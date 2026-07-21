/**
 * Previous-day auction playbooks.
 *
 * Intraday traders anchor today to PDH / PDL / prior close. These triggers
 * require a rejection or break-and-retest; touching a level alone is not entry.
 */

import type { Candle } from '@/lib/nejoic';
import type { MarketScenario } from '@/lib/blink-nifty-pa-profile';
import type { ProTradePlan } from '@/lib/blink-pro-playbooks';
import { pickOptionStrike } from '@/lib/option-sim';
import { optionTargetHint } from '@/lib/blink-option-target';

export type PriorDayContext = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function shape(c: Candle) {
  const body = Math.max(Math.abs(c.close - c.open), 0.1);
  return {
    bull: c.close > c.open && Math.min(c.open, c.close) - c.low >= body,
    bear: c.close < c.open && c.high - Math.max(c.open, c.close) >= body,
  };
}

export function buildPriorDayTradePlan(
  candles: Candle[],
  scenario: MarketScenario,
  spot: number,
  prior?: PriorDayContext | null
): ProTradePlan | null {
  if (!prior || candles.length < 8) return null;

  const last = candles[candles.length - 1];
  const s = shape(last);
  const tol = Math.max(8, spot * 0.0005);
  const earlier = candles.slice(0, -1);
  const brokePdh = earlier.some((c) => c.close > prior.high + 3);
  const brokePdl = earlier.some((c) => c.close < prior.low - 3);

  // UP continuation: PDH accepted, then retested from above.
  if (
    brokePdh &&
    last.low <= prior.high + tol &&
    last.close > prior.high &&
    s.bull
  ) {
    const strike = pickOptionStrike(spot, 'CE', 'atm', 50);
    return {
      scenario,
      bias: 'CE',
      mode: 'ENTER',
      setup: 'PDH_BREAK_RETEST_CE',
      reason:
        `Prior-day high ${prior.high.toFixed(1)} broke, retested and held. ` +
        optionTargetHint(spot, 'CE', strike),
      confidence: 82,
      strike,
      entryZone: `Bullish close above retested PDH ${prior.high.toFixed(1)}`,
      invalidation: `3m close below PDH ${prior.high.toFixed(1)}`,
      targetHint: optionTargetHint(spot, 'CE', strike),
      howProTradesIt:
        'UP auction: buy ATM CE only after PDH acceptance and a successful retest.',
    };
  }

  // DOWN continuation: PDL accepted, then retested from below.
  if (
    brokePdl &&
    last.high >= prior.low - tol &&
    last.close < prior.low &&
    s.bear
  ) {
    const strike = pickOptionStrike(spot, 'PE', 'atm', 50);
    return {
      scenario,
      bias: 'PE',
      mode: 'ENTER',
      setup: 'PDL_BREAK_RETEST_PE',
      reason:
        `Prior-day low ${prior.low.toFixed(1)} broke, retested and failed. ` +
        optionTargetHint(spot, 'PE', strike),
      confidence: 82,
      strike,
      entryZone: `Bearish close below retested PDL ${prior.low.toFixed(1)}`,
      invalidation: `3m close above PDL ${prior.low.toFixed(1)}`,
      targetHint: optionTargetHint(spot, 'PE', strike),
      howProTradesIt:
        'DOWN auction: buy ATM PE only after PDL acceptance and a failed retest.',
    };
  }

  // Failed auction above PDH: rejection back below is a PE reversal.
  if (
    last.high >= prior.high - tol &&
    last.close < prior.high &&
    s.bear
  ) {
    const strike = pickOptionStrike(spot, 'PE', 'atm', 50);
    return {
      scenario,
      bias: 'PE',
      mode: 'ENTER',
      setup: 'PDH_REJECT_PE',
      reason:
        `Failed auction at prior-day high ${prior.high.toFixed(1)}. ` +
        optionTargetHint(spot, 'PE', strike),
      confidence: 78,
      strike,
      entryZone: `Bearish rejection below PDH ${prior.high.toFixed(1)}`,
      invalidation: `3m close above PDH ${prior.high.toFixed(1)}`,
      targetHint: optionTargetHint(spot, 'PE', strike),
      howProTradesIt:
        'Reversal auction: PDH rejects price; take ATM PE only after the bearish close.',
    };
  }

  // Failed auction below PDL: reclaim back above is a CE reversal.
  if (
    last.low <= prior.low + tol &&
    last.close > prior.low &&
    s.bull
  ) {
    const strike = pickOptionStrike(spot, 'CE', 'atm', 50);
    return {
      scenario,
      bias: 'CE',
      mode: 'ENTER',
      setup: 'PDL_RECLAIM_CE',
      reason:
        `Failed auction below prior-day low ${prior.low.toFixed(1)}. ` +
        optionTargetHint(spot, 'CE', strike),
      confidence: 78,
      strike,
      entryZone: `Bullish reclaim above PDL ${prior.low.toFixed(1)}`,
      invalidation: `3m close below PDL ${prior.low.toFixed(1)}`,
      targetHint: optionTargetHint(spot, 'CE', strike),
      howProTradesIt:
        'Reversal auction: PDL rejects lower prices; ATM CE only after reclaim.',
    };
  }

  return null;
}
