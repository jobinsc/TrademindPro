/**
 * Extra chart-reading techniques beyond HH/HL playbooks.
 * Desk-trader style: liquidity sweep, failed auction (OR fail), BOS, engulf at level.
 * Each returns a candidate ENTER plan the hunter can grade.
 */

import type { Candle, OptionBias } from '@/lib/nejoic';
import { pickOptionStrike } from '@/lib/option-sim';
import type { PriceActionResult } from '@/lib/price-action';
import type { MarketScenario } from '@/lib/blink-nifty-pa-profile';

export type ChartTechniqueId =
  | 'SWEEP_RECLAIM_PE'
  | 'SWEEP_RECLAIM_CE'
  | 'OR_FAIL_PE'
  | 'OR_FAIL_CE'
  | 'BOS_DOWN_PE'
  | 'BOS_UP_CE'
  | 'ENGULF_LH_PE'
  | 'ENGULF_HL_CE';

export type ChartTechniqueHit = {
  id: ChartTechniqueId;
  bias: OptionBias;
  confidence: number;
  reason: string;
  entryZone: string;
  invalidation: string;
  targetHint: string;
  howProTradesIt: string;
};

function openingRange(candles: Candle[], bars = 5) {
  const n = Math.min(bars, candles.length);
  if (n < 3) return null;
  const slice = candles.slice(0, n);
  return {
    high: Math.max(...slice.map((c) => c.high)),
    low: Math.min(...slice.map((c) => c.low)),
  };
}

function atrApprox(candles: Candle[], n = 14): number {
  const end = candles.length - 1;
  const start = Math.max(1, end - n + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    sum += Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    count += 1;
  }
  return count ? sum / count : 20;
}

function isBearEngulf(prev: Candle, cur: Candle): boolean {
  return (
    cur.close < cur.open &&
    prev.close > prev.open &&
    cur.open >= prev.close &&
    cur.close <= prev.open
  );
}

function isBullEngulf(prev: Candle, cur: Candle): boolean {
  return (
    cur.close > cur.open &&
    prev.close < prev.open &&
    cur.open <= prev.close &&
    cur.close >= prev.open
  );
}

/**
 * Scan the latest bars for classic PA / auction techniques.
 * Returns best hit (highest confidence) or null.
 */
export function detectChartTechniques(
  candles: Candle[],
  pa: PriceActionResult,
  scenario: MarketScenario
): ChartTechniqueHit | null {
  if (candles.length < 25) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const spot = last.close;
  const or = openingRange(candles, 5);
  const a = atrApprox(candles);
  const dayHigh = Math.max(...candles.map((c) => c.high));
  const dayLow = Math.min(...candles.map((c) => c.low));
  const lookback = candles.slice(0, -1);
  const priorHigh = Math.max(...lookback.slice(-20).map((c) => c.high));
  const priorLow = Math.min(...lookback.slice(-20).map((c) => c.low));

  const hits: ChartTechniqueHit[] = [];

  // ——— 1) Liquidity sweep + reclaim (stop hunt) ———
  // Wick above prior high, close back below → PE
  if (
    last.high > priorHigh + a * 0.05 &&
    last.close < priorHigh &&
    last.close < last.open
  ) {
    hits.push({
      id: 'SWEEP_RECLAIM_PE',
      bias: 'PE',
      confidence: 78,
      reason: `Swept prior high ${priorHigh.toFixed(1)} then closed back below — liquidity grab PE.`,
      entryZone: `Reclaim under ${priorHigh.toFixed(1)}`,
      invalidation: `3m close above sweep high ${last.high.toFixed(1)}`,
      targetHint: pa.support
        ? `Toward support ${pa.support.toFixed(1)}`
        : `−1R / session low ${dayLow.toFixed(1)}`,
      howProTradesIt:
        'Chart read: stops above swing get run, then price fails — sell the reclaim with PE.',
    });
  }
  // Wick below prior low, close back above → CE
  if (
    last.low < priorLow - a * 0.05 &&
    last.close > priorLow &&
    last.close > last.open
  ) {
    hits.push({
      id: 'SWEEP_RECLAIM_CE',
      bias: 'CE',
      confidence: 78,
      reason: `Swept prior low ${priorLow.toFixed(1)} then closed back above — liquidity grab CE.`,
      entryZone: `Reclaim above ${priorLow.toFixed(1)}`,
      invalidation: `3m close below sweep low ${last.low.toFixed(1)}`,
      targetHint: pa.resistance
        ? `Toward resistance ${pa.resistance.toFixed(1)}`
        : `+1R / session high ${dayHigh.toFixed(1)}`,
      howProTradesIt:
        'Chart read: stops below swing get run, then reclaim — buy CE on the failure.',
    });
  }

  // ——— 2) Failed auction / OR fail ———
  if (or) {
    const brokeOrHigh = candles.some(
      (c, i) => i >= 5 && c.close > or.high && c.high > or.high
    );
    const brokeOrLow = candles.some(
      (c, i) => i >= 5 && c.close < or.low && c.low < or.low
    );
    // Was above OR, now closed back inside → PE
    if (
      brokeOrHigh &&
      last.close < or.high &&
      last.close > or.low &&
      last.close < last.open
    ) {
      hits.push({
        id: 'OR_FAIL_PE',
        bias: 'PE',
        confidence: 80,
        reason: `Failed auction: broke OR high ${or.high.toFixed(1)} then reclaimed inside — PE.`,
        entryZone: `Back under OR high ${or.high.toFixed(1)}`,
        invalidation: `3m close back above OR high ${or.high.toFixed(1)}`,
        targetHint: `OR mid / low ${((or.high + or.low) / 2).toFixed(1)} → ${or.low.toFixed(1)}`,
        howProTradesIt:
          'Auction theory: acceptance above OR fails → trade back through the range with PE.',
      });
    }
    if (
      brokeOrLow &&
      last.close > or.low &&
      last.close < or.high &&
      last.close > last.open
    ) {
      hits.push({
        id: 'OR_FAIL_CE',
        bias: 'CE',
        confidence: 80,
        reason: `Failed auction: broke OR low ${or.low.toFixed(1)} then reclaimed inside — CE.`,
        entryZone: `Back above OR low ${or.low.toFixed(1)}`,
        invalidation: `3m close back below OR low ${or.low.toFixed(1)}`,
        targetHint: `OR mid / high ${((or.high + or.low) / 2).toFixed(1)} → ${or.high.toFixed(1)}`,
        howProTradesIt:
          'Auction theory: acceptance below OR fails → trade back through the range with CE.',
      });
    }
  }

  // ——— 3) Break of structure (BOS) ———
  if (pa.support != null && last.close < pa.support && last.close < last.open) {
    hits.push({
      id: 'BOS_DOWN_PE',
      bias: 'PE',
      confidence: scenario === 'DOWN' ? 82 : 74,
      reason: `BOS down: close below structure support ${pa.support.toFixed(1)} — PE.`,
      entryZone: `Under broken HL/support ${pa.support.toFixed(1)}`,
      invalidation: `3m close back above ${pa.support.toFixed(1)}`,
      targetHint: `Next LL / day low ${dayLow.toFixed(1)}`,
      howProTradesIt:
        'Structure break: bulls lose the HL — PE with stop above broken level.',
    });
  }
  if (
    pa.resistance != null &&
    last.close > pa.resistance &&
    last.close > last.open
  ) {
    hits.push({
      id: 'BOS_UP_CE',
      bias: 'CE',
      confidence: scenario === 'UP' ? 76 : 70,
      reason: `BOS up: close above structure resistance ${pa.resistance.toFixed(1)} — CE.`,
      entryZone: `Above broken LH/resistance ${pa.resistance.toFixed(1)}`,
      invalidation: `3m close back below ${pa.resistance.toFixed(1)}`,
      targetHint: `Next HH / day high ${dayHigh.toFixed(1)}`,
      howProTradesIt:
        'Structure break: bears lose the LH — CE with stop under broken level.',
    });
  }

  // ——— 4) Engulfing at S/R ———
  if (
    pa.resistance != null &&
    isBearEngulf(prev, last) &&
    Math.abs(last.high - pa.resistance) <= a * 0.6
  ) {
    hits.push({
      id: 'ENGULF_LH_PE',
      bias: 'PE',
      confidence: 81,
      reason: `Bear engulf at LH/resistance ~${pa.resistance.toFixed(1)} — PE rejection.`,
      entryZone: `At resistance ${pa.resistance.toFixed(1)}`,
      invalidation: `3m close above engulf high ${last.high.toFixed(1)}`,
      targetHint: pa.support
        ? `Support ${pa.support.toFixed(1)}`
        : `−1ATR (~${(spot - a).toFixed(1)})`,
      howProTradesIt:
        'Candle read: engulf at supply = institutional reject — PE only at the level.',
    });
  }
  if (
    pa.support != null &&
    isBullEngulf(prev, last) &&
    Math.abs(last.low - pa.support) <= a * 0.6
  ) {
    hits.push({
      id: 'ENGULF_HL_CE',
      bias: 'CE',
      confidence: 76,
      reason: `Bull engulf at HL/support ~${pa.support.toFixed(1)} — CE reclaim.`,
      entryZone: `At support ${pa.support.toFixed(1)}`,
      invalidation: `3m close below engulf low ${last.low.toFixed(1)}`,
      targetHint: pa.resistance
        ? `Resistance ${pa.resistance.toFixed(1)}`
        : `+1ATR (~${(spot + a).toFixed(1)})`,
      howProTradesIt:
        'Candle read: engulf at demand — CE only when reclaim holds.',
    });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.confidence - a.confidence);
  return hits[0];
}

/** Turn a technique hit into playbook-shaped fields (+ strike). */
export function techniqueToPlanFields(
  hit: ChartTechniqueHit,
  spot: number,
  scenario: MarketScenario
) {
  const strike =
    hit.bias === 'FLAT' ? null : pickOptionStrike(spot, hit.bias, 'atm', 50);
  return {
    scenario,
    bias: hit.bias,
    mode: 'ENTER' as const,
    setup: hit.id,
    reason: hit.reason,
    confidence: hit.confidence,
    strike,
    entryZone: hit.entryZone,
    invalidation: hit.invalidation,
    targetHint: hit.targetHint,
    howProTradesIt: hit.howProTradesIt,
  };
}
