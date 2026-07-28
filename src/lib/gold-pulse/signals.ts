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

/**
 * BOTS / NexusPulse entry: new entry-TF Buy/Sell + HTF pos agrees.
 * Gold: Buy+HTF long → LONG; Sell+HTF short → SHORT.
 */
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
  let reason = 'No aligned Sector 7 entry';

  if (buy && htfPos === 1) {
    side = 'LONG';
    reason = `${GOLD_UT_ENTRY.tf} Buy + ${GOLD_UT_HTF.tf} long → LONG (BOTS idea)`;
  } else if (sell && htfPos === -1) {
    side = 'SHORT';
    reason = `${GOLD_UT_ENTRY.tf} Sell + ${GOLD_UT_HTF.tf} short → SHORT (BOTS idea)`;
  } else if (buy && htfPos !== 1) {
    reason = `${GOLD_UT_ENTRY.tf} buy ignored — ${GOLD_UT_HTF.tf} not long`;
  } else if (sell && htfPos !== -1) {
    reason = `${GOLD_UT_ENTRY.tf} sell ignored — ${GOLD_UT_HTF.tf} not short`;
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
  if (r === 'UT_HTF') return `Sector 7 G (${GOLD_UT_HTF.tf} against)`;
  if (r === 'UT_ENTRY') return `${GOLD_UT_ENTRY.tf} UT flipped`;
  if (r === 'TRAIL') return 'profit trail (BOTS)';
  if (r === 'SL') return 'stop loss';
  if (r === 'MANUAL') return 'manual';
  if (r === 'EOD') return 'session flat';
  return r || '—';
}
