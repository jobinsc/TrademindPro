/**
 * Professional day-trader playbooks — INTRADAY ONLY (no overnight).
 * Agent finds a trade plan (CE / PE / stalk) — never "I don't know".
 *
 * UP       → buy dips (HL / OR reclaim) → CE
 * DOWN     → sell rallies (LH / OR reject) → PE
 * SIDEWAYS → fade range extremes OR trade confirmed break → CE/PE
 *            mid-range with no trigger → STALK (explicit wait with levels)
 * Close    → STALK / square-off only — never carry past the session
 */

import type { Candle, OptionBias } from '@/lib/nejoic';
import { runPriceAction } from '@/lib/price-action';
import { pickOptionStrike } from '@/lib/option-sim';
import type { MarketScenario } from '@/lib/blink-nifty-pa-profile';
import {
  applyEdgeToPlan,
  DEFAULT_EDGE_POLICY,
  type EdgePolicy,
} from '@/lib/blink-edge-policy';
import {
  appendIntradayExitRule,
  classifyIntradayBar,
  INTRADAY_RULES_TEXT,
} from '@/lib/blink-intraday';
import { optionTargetHint } from '@/lib/blink-option-target';

export type ProTradePlan = {
  scenario: MarketScenario;
  bias: OptionBias;
  /** STALK = professional wait with defined levels (still a plan) */
  mode: 'ENTER' | 'STALK';
  setup: string;
  reason: string;
  confidence: number;
  strike: number | null;
  entryZone: string;
  invalidation: string;
  targetHint: string;
  howProTradesIt: string;
};

function sessionRange(candles: Candle[], lookback = 40) {
  const slice = candles.slice(-Math.min(lookback, candles.length));
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const mid = (high + low) / 2;
  const width = high - low || 1;
  return { high, low, mid, width };
}

function openingRange(candles: Candle[], bars = 5) {
  const slice = candles.slice(0, Math.min(bars, candles.length));
  if (!slice.length) return null;
  return {
    high: Math.max(...slice.map((c) => c.high)),
    low: Math.min(...slice.map((c) => c.low)),
  };
}

function rejectionShape(c: Candle) {
  const body = Math.max(Math.abs(c.close - c.open), 0.1);
  return {
    bull: c.close > c.open && Math.min(c.open, c.close) - c.low >= body,
    bear: c.close < c.open && c.high - Math.max(c.open, c.close) >= body,
  };
}

/**
 * Build a professional trade path for the current 3m context.
 */
export function buildProTradePlan(
  candles: Candle[],
  scenario: MarketScenario,
  spot: number,
  minConfidence = 68,
  edgePolicy: EdgePolicy = DEFAULT_EDGE_POLICY
): ProTradePlan {
  const pa = runPriceAction(candles, { leftBars: 5, rightBars: 5 });
  const range = sessionRange(candles);
  const or = openingRange(candles, 5);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const nearLow = spot <= range.low + range.width * 0.18;
  const nearHigh = spot >= range.high - range.width * 0.18;
  const shape = rejectionShape(last);

  let plan: ProTradePlan;

  const sessionWindow = classifyIntradayBar(
    candles.length - 1,
    Math.max(candles.length, 100),
    last.t
  );

  // Intraday only — never open a new ticket late / overnight risk
  if (!sessionWindow.allowEntry) {
    plan = {
      scenario,
      bias: 'FLAT',
      mode: 'STALK',
      setup: 'INTRADAY_FLAT_WINDOW',
      reason: `${sessionWindow.reason}. ${INTRADAY_RULES_TEXT}`,
      confidence: 40,
      strike: null,
      entryZone: 'No new entries — square off / stay flat',
      invalidation: 'N/A',
      targetHint: 'Flat by session end — no overnight holds',
      howProTradesIt:
        'Intraday desk rule: last hour = manage/exit only. Never carry options overnight.',
    };
  } else if (scenario === 'UP') {
    // UP playbook: do not buy a generic HL. Require a bullish rejection and
    // reclaim at confirmed support so there is a defined stop and room to scalp.
    const support = pa.support;
    const tol = Math.max(8, spot * 0.0005);
    const brokeAboveOrEarlier =
      or != null &&
      candles
        .slice(5, -1)
        .some((c) => c.close > or.high + Math.max(2, tol * 0.25));
    const orRetest =
      or != null &&
      brokeAboveOrEarlier &&
      last.low <= or.high + tol &&
      last.close > or.high &&
      shape.bull;
    const reclaim =
      support != null &&
      last.low <= support + tol &&
      last.close > support &&
      shape.bull;

    if (orRetest && or != null) {
      const strike = pickOptionStrike(spot, 'CE', 'atm', 50);
      plan = {
        scenario,
        bias: 'CE',
        mode: 'ENTER',
        setup: 'UP_OR_RETEST_CE',
        reason:
          `UP day: prior OR breakout retested and held ${or.high.toFixed(1)}. ` +
          optionTargetHint(spot, 'CE', strike),
        confidence: 80,
        strike,
        entryZone: `Bullish close above retested OR high ${or.high.toFixed(1)}`,
        invalidation: `3m close below OR high ${or.high.toFixed(1)}`,
        targetHint: optionTargetHint(spot, 'CE', strike),
        howProTradesIt:
          'UP: never chase the first break. Enter ATM CE only after OR-high retest and bullish rejection.',
      };
    } else if (reclaim && support != null) {
      const strike = pickOptionStrike(spot, 'CE', 'atm', 50);
      plan = {
        scenario,
        bias: 'CE',
        mode: 'ENTER',
        setup: 'UP_PULLBACK_RECLAIM_CE',
        reason:
          `UP day: bullish rejection reclaimed support ${support.toFixed(1)}. ` +
          optionTargetHint(spot, 'CE', strike),
        confidence: 76,
        strike,
        entryZone: `Above reclaimed support ${support.toFixed(1)}`,
        invalidation: `3m close below ${support.toFixed(1)}`,
        targetHint: optionTargetHint(spot, 'CE', strike),
        howProTradesIt:
          'UP: wait for pullback into support, bullish rejection, then CE. Never chase an extended candle.',
      };
    } else {
      plan = {
        scenario,
        bias: 'FLAT',
        mode: 'STALK',
        setup: 'UP_STALK_RECLAIM',
        reason:
          `UP day plan: wait for bullish rejection at ${support?.toFixed(1) ?? 'confirmed support'}.`,
        confidence: 50,
        strike: null,
        entryZone: `Reclaim ${support?.toFixed(1) ?? 'support'} with bullish 3m close`,
        invalidation: 'Close below support cancels CE plan',
        targetHint: optionTargetHint(spot, 'CE'),
        howProTradesIt:
          'UP plan exists, but entry waits for pullback + rejection. A plan is not a forced trade.',
      };
    }
  } else if (scenario === 'DOWN') {
    const resistance = pa.resistance;
    const tol = Math.max(8, spot * 0.0005);
    const pullbackReject =
      resistance != null &&
      last.high >= resistance - tol &&
      last.close < resistance &&
      shape.bear;

    if (pullbackReject && resistance != null) {
      const strike = pickOptionStrike(spot, 'PE', 'atm', 50);
      plan = {
        scenario,
        bias: 'PE',
        mode: 'ENTER',
        setup: 'DOWN_PULLBACK_REJECT_PE',
        reason:
          `DOWN day: bearish rejection from resistance ${resistance.toFixed(1)}. ` +
          optionTargetHint(spot, 'PE', strike),
        confidence: 80,
        strike,
        entryZone: `Bearish close below resistance ${resistance.toFixed(1)}`,
        invalidation: `3m close above ${resistance.toFixed(1)}`,
        targetHint: optionTargetHint(spot, 'PE', strike),
        howProTradesIt:
          'DOWN: sell the rally only after a bearish rejection at resistance; ATM PE with hard invalidation.',
      };
    } else if (pa.setup === 'LH_BREAK') {
      const strike = pickOptionStrike(spot, 'PE', 'atm', 50);
      plan = {
        scenario,
        bias: 'PE',
        mode: 'ENTER',
        setup: 'LH_BREAK',
        reason: `${pa.entryHint} ${optionTargetHint(spot, 'PE')}`,
        confidence: Math.max(pa.confidence, 80),
        strike,
        entryZone: pa.resistance
          ? `Near LH resistance ~${pa.resistance.toFixed(1)}`
          : 'On LH print / reject of prior swing high',
        invalidation: pa.resistance
          ? `3m close above ${pa.resistance.toFixed(1)}`
          : '3m close above last Lower High',
        targetHint: optionTargetHint(spot, 'PE', strike),
        howProTradesIt:
          'DOWN: wait for the LH break, buy ATM PE, hard stop above the LH; take the intraday option-point objective.',
      };
    } else {
      plan = {
        scenario,
        bias: 'FLAT',
        mode: 'STALK',
        setup: 'DOWN_STALK_LH_BREAK',
        reason: 'DOWN day plan: stalk the next LH rejection and break for PE.',
        confidence: 55,
        strike: null,
        entryZone: `Wait below LH ${pa.resistance?.toFixed(1) ?? 'resistance'}`,
        invalidation: 'Day flips: close above session high → reclassify',
        targetHint: optionTargetHint(spot, 'PE'),
        howProTradesIt: 'DOWN plan exists; enter only when LH_BREAK confirms.',
      };
    }
  } else {
    // SIDEWAYS playbook: trade rejection at an edge, never the middle.
    if (nearLow && or && shape.bull) {
      const strike = pickOptionStrike(spot, 'CE', 'atm', 50);
      plan = {
        scenario: 'SIDEWAYS',
        bias: 'CE',
        mode: 'ENTER',
        setup: 'RANGE_REJECT_LOW_CE',
        reason:
          `SIDEWAYS: bullish wick rejected the range low. ${optionTargetHint(spot, 'CE', strike)}`,
        confidence: 75,
        strike,
        entryZone: `Bullish close off range/OR low ~${Math.min(range.low, or.low).toFixed(1)}`,
        invalidation: `Close below ${Math.min(range.low, or.low).toFixed(1)}`,
        targetHint: optionTargetHint(spot, 'CE', strike),
        howProTradesIt: 'SIDEWAYS: CE only after bullish rejection at the lower edge.',
      };
    } else if (nearHigh && or && shape.bear) {
      const strike = pickOptionStrike(spot, 'PE', 'atm', 50);
      const confirmed = last.close < prev.low;
      plan = {
        scenario: 'SIDEWAYS',
        bias: 'PE',
        mode: 'ENTER',
        setup: confirmed
          ? 'RANGE_REJECT_HIGH_CONFIRM_PE'
          : 'RANGE_REJECT_HIGH_PE',
        reason:
          `SIDEWAYS: bearish wick rejected the range high${confirmed ? ' and closed below the prior candle low' : ''}. ` +
          optionTargetHint(spot, 'PE', strike),
        confidence: confirmed ? 82 : 75,
        strike,
        entryZone: `Bearish close off range/OR high ~${Math.max(range.high, or.high).toFixed(1)}`,
        invalidation: `Close above ${Math.max(range.high, or.high).toFixed(1)}`,
        targetHint: optionTargetHint(spot, 'PE', strike),
        howProTradesIt: 'SIDEWAYS: PE only after bearish rejection at the upper edge.',
      };
    } else {
      plan = {
        scenario: 'SIDEWAYS',
        bias: 'FLAT',
        mode: 'STALK',
        setup: 'RANGE_STALK_REJECTION',
        reason: `SIDEWAYS plan: stalk rejection at OR/range edges ${or ? `${or.low.toFixed(1)}–${or.high.toFixed(1)}` : ''}.`,
        confidence: 48,
        strike: null,
        entryZone: or
          ? `Bull reject ${or.low.toFixed(1)} or bear reject ${or.high.toFixed(1)}`
          : 'Stalk day extremes',
        invalidation: 'N/A until entry',
        targetHint: 'No mid-range entry; wait for an edge rejection',
        howProTradesIt: 'SIDEWAYS plan exists at both edges; no mid-range lottery.',
      };
    }
  }

  plan = {
    ...plan,
    howProTradesIt: appendIntradayExitRule(plan.howProTradesIt),
    targetHint:
      plan.mode === 'ENTER'
        ? `${plan.targetHint} · square off same day`
        : plan.targetHint,
  };

  const sessionPhase = sessionWindow.phase;

  return applyEdgeToPlan(plan, edgePolicy, {
    sessionPhase,
    spot,
    or: or ? { high: or.high, low: or.low, mid: (or.high + or.low) / 2 } : null,
    dayHigh: range.high,
    dayLow: range.low,
  });
}

/** Convert plan → Blink-compatible bias for live engine */
export function planToLiveBias(
  plan: ProTradePlan,
  minConfidence: number
): { bias: OptionBias; setup: string; reason: string; confidence: number } {
  if (plan.mode === 'STALK' || plan.confidence < minConfidence) {
    return {
      bias: 'FLAT',
      setup: plan.setup,
      reason: `[${plan.scenario}/${plan.mode}] ${plan.reason}`,
      confidence: plan.confidence,
    };
  }
  return {
    bias: plan.bias,
    setup: plan.setup,
    reason: `[${plan.scenario}] ${plan.reason}`,
    confidence: plan.confidence,
  };
}
