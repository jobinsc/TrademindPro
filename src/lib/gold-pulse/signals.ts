import type { Candle } from '@/lib/nejoic';
import { runUtBot, type UtBotBar } from '@/lib/nexus-pulse/ut-bot';
import { GOLD_UT_ENTRY, GOLD_UT_HTF } from '@/lib/gold-pulse/rules';
import type { GoldSignal, GoldSide, GoldUtSnap } from '@/lib/gold-pulse/types';

function snap(tf: string, params: { keyValue: number; atrPeriod: number }, bars: UtBotBar[]): GoldUtSnap {
  return {
    tf,
    keyValue: params.keyValue,
    atrPeriod: params.atrPeriod,
    bars: bars.length,
    last: bars.length ? bars[bars.length - 1] : null,
    prev: bars.length >= 2 ? bars[bars.length - 2] : null,
  };
}

export function evaluateGoldUtEntry(opts: {
  candlesEntry: Candle[];
  candlesHtf: Candle[];
}): {
  decision: GoldSignal;
  utEntry: GoldUtSnap;
  utHtf: GoldUtSnap;
} {
  const entryBars = runUtBot(opts.candlesEntry, {
    keyValue: GOLD_UT_ENTRY.keyValue,
    atrPeriod: GOLD_UT_ENTRY.atrPeriod,
  });
  const htfBars = runUtBot(opts.candlesHtf, {
    keyValue: GOLD_UT_HTF.keyValue,
    atrPeriod: GOLD_UT_HTF.atrPeriod,
  });

  const utEntry = snap(GOLD_UT_ENTRY.tf, GOLD_UT_ENTRY, entryBars);
  const utHtf = snap(GOLD_UT_HTF.tf, GOLD_UT_HTF, htfBars);

  const lastE = utEntry.last;
  const prevE = utEntry.prev;
  const lastH = utHtf.last;

  const buy = Boolean(lastE?.buy);
  const sell = Boolean(lastE?.sell);
  const newEdge = Boolean(
    (buy && prevE && !prevE.buy) || (sell && prevE && !prevE.sell)
  );
  const htfPos = (lastH?.pos ?? 0) as -1 | 0 | 1;

  let side: GoldSide | 'FLAT' = 'FLAT';
  let reason = 'No aligned UT entry';

  if (buy && htfPos === 1) {
    side = 'LONG';
    reason = `5m UT buy + 15m bullish (Sector 7 G filter)`;
  } else if (sell && htfPos === -1) {
    side = 'SHORT';
    reason = `5m UT sell + 15m bearish (Sector 7 G filter)`;
  } else if (buy && htfPos !== 1) {
    reason = '5m buy ignored — 15m not bullish';
  } else if (sell && htfPos !== -1) {
    reason = '5m sell ignored — 15m not bearish';
  }

  return {
    utEntry,
    utHtf,
    decision: {
      at: new Date().toISOString(),
      side,
      reason,
      entryBuy: buy,
      entrySell: sell,
      htfPos,
      newEntryEdge: newEdge && side !== 'FLAT',
    },
  };
}

export function exitReasonLabel(r: string | undefined): string {
  if (r === 'UT_HTF') return 'Sector 7 G (15m UT against us)';
  if (r === 'UT_ENTRY') return '5m UT flipped';
  if (r === 'TRAIL') return 'profit trail';
  if (r === 'SL') return 'stop loss';
  if (r === 'MANUAL') return 'manual';
  if (r === 'EOD') return 'session flat';
  return r || '—';
}
