/**
 * Intraday opportunity hunter — trader mindset:
 * Analyse the chart → find 0–2 quality opportunities → plan entry/exit.
 * No forced daily quota: zero trades is valid when the LH edge is absent.
 */

import type { Candle, OptionBias } from '@/lib/nejoic';
import { detectMarketScenario, type MarketScenario } from '@/lib/blink-nifty-pa-profile';
import { buildProTradePlan, type ProTradePlan } from '@/lib/blink-pro-playbooks';
import {
  DEFAULT_EDGE_POLICY,
  filterOpportunitiesByEdge,
} from '@/lib/blink-edge-policy';
import {
  classifyIntradayBar,
  isIntradayEntryAllowed,
} from '@/lib/blink-intraday';

export type SessionOpportunity = {
  slot: number; // 1, 2, 3…
  atBar: number;
  atTime: string;
  scenario: MarketScenario;
  bias: OptionBias;
  setup: string;
  reason: string;
  confidence: number;
  strike: number | null;
  entryZone: string;
  invalidation: string;
  targetHint: string;
  howProTradesIt: string;
  sessionPhase: 'open' | 'mid' | 'close';
};

function phaseForBar(barIdx: number, total: number, time?: string): 'open' | 'mid' | 'close' {
  return classifyIntradayBar(barIdx, total, time).phase;
}

function planToOpp(
  slot: number,
  barIdx: number,
  candle: Candle,
  plan: ProTradePlan,
  total: number
): SessionOpportunity {
  return {
    slot,
    atBar: barIdx,
    atTime: candle.t,
    scenario: plan.scenario,
    bias: plan.bias,
    setup: plan.setup,
    reason: plan.reason,
    confidence: plan.confidence,
    strike: plan.strike,
    entryZone: plan.entryZone,
    invalidation: plan.invalidation,
    targetHint: plan.targetHint,
    howProTradesIt: plan.howProTradesIt,
    sessionPhase: phaseForBar(barIdx, total, candle.t),
  };
}

/**
 * Walk a full NSE session on 3m bars and hunt up to 2 ENTER setups.
 * Uses rolling context so the agent thinks like a live trader through the day.
 */
export function findSessionTradeOpportunities(
  candles: Candle[],
  opts?: {
    maxOps?: number;
    minConfidence?: number;
    stepBars?: number;
  }
): SessionOpportunity[] {
  const maxOps = opts?.maxOps ?? DEFAULT_EDGE_POLICY.maxKeep ?? 2;
  const minConf = opts?.minConfidence ?? 66;
  const step = opts?.stepBars ?? 4; // every ~12 minutes on 3m
  if (candles.length < 25) return [];

  const found: SessionOpportunity[] = [];
  const usedKeys = new Set<string>();

  // Checkpoint bars: after OR (~5 bars), then step through day, plus last bar
  const checkpoints = new Set<number>();
  for (let i = 20; i < candles.length; i += step) checkpoints.add(i);
  checkpoints.add(candles.length - 1);
  // Extra: first pullback windows (open-heavy)
  if (candles.length > 35) checkpoints.add(30);
  if (candles.length > 50) checkpoints.add(45);

  const sorted = [...checkpoints].sort((a, b) => a - b);

  for (const i of sorted) {
    if (found.length >= maxOps) break;
    // Intraday only — no late entries that can't exit same day
    if (!isIntradayEntryAllowed(i, candles)) continue;

    const window = candles.slice(0, i + 1);
    const spot = window[window.length - 1].close;
    const mkt = detectMarketScenario(window);
    const plan = buildProTradePlan(window, mkt.scenario, spot, minConf);

    if (plan.mode !== 'ENTER' || plan.bias === 'FLAT' || plan.confidence < minConf) {
      continue;
    }

    // Dedupe: same bias+setup within 12 bars
    const key = `${plan.bias}|${plan.setup.replace(/\d+/g, '')}`;
    let tooClose = false;
    for (const prev of found) {
      const prevKey = `${prev.bias}|${prev.setup.replace(/\d+/g, '')}`;
      if (prevKey === key && Math.abs(prev.atBar - i) < 12) {
        tooClose = true;
        break;
      }
      // Same bias within 8 bars — one slot is enough
      if (prev.bias === plan.bias && Math.abs(prev.atBar - i) < 8) {
        tooClose = true;
        break;
      }
    }
    if (tooClose || usedKeys.has(`${key}@${Math.floor(i / 12)}`)) continue;

    usedKeys.add(`${key}@${Math.floor(i / 12)}`);
    found.push(planToOpp(found.length + 1, i, candles[i], plan, candles.length));
  }

  return filterOpportunitiesByEdge(found, DEFAULT_EDGE_POLICY);
}
