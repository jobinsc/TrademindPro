/**
 * Intraday-only rules for Blink (NSE cash/FO day trader).
 * No overnight holds — square off same session; no late entries that can't finish.
 *
 * NSE cash: ~09:15–15:30. On 3m ≈ 125 bars/day.
 * Entry cutoff: last ~45–60 min (no new tickets).
 * Force flat: last ~15 min (must be flat before close).
 */

import type { Candle } from '@/lib/nejoic';
import { istMinutesOfDay } from '@/lib/option-sim';

/** Bars from end of session where NEW entries are banned (~60m on 3m) */
export const INTRADAY_NO_ENTRY_BARS = 20;

/** Bars from end where any open trade is force-squared (~15m on 3m) */
export const INTRADAY_FORCE_FLAT_BARS = 5;

/** Soft fraction: also ban entries after this share of the day */
export const INTRADAY_ENTRY_CUTOFF_PCT = 0.78;

export const INTRADAY_RULES_TEXT =
  'INTRADAY ONLY — square off same day. No overnight. No new entries in last hour; flat by ~15:15.';

export type IntradayWindow = {
  /** May open a new trade */
  allowEntry: boolean;
  /** Must be flat / grade walk stops here */
  forceFlat: boolean;
  /** Session phase for UI */
  phase: 'open' | 'mid' | 'close';
  reason: string;
};

/**
 * Classify bar index within a full (or partial) session.
 * Prefer clock time when present; fall back to bar fractions.
 */
export function classifyIntradayBar(
  barIdx: number,
  totalBars: number,
  candleTime?: string
): IntradayWindow {
  const barsLeft = Math.max(0, totalBars - 1 - barIdx);
  const pct = totalBars > 1 ? barIdx / (totalBars - 1) : 0;

  let phase: IntradayWindow['phase'] = 'open';
  if (pct >= 0.66) phase = 'close';
  else if (pct >= 0.33) phase = 'mid';

  // Clock-based NSE cutoffs when time is available
  // Candle timestamps are normalized to UTC ISO. Convert to IST before applying
  // NSE clock rules; reading the raw UTC hour made every trade look like "open".
  const mins = candleTime ? istMinutesOfDay(candleTime) : null;
  if (mins != null) {
    // 15:15 = force flat zone; 14:30 = no new entries
    const forceFlat = mins >= 15 * 60 + 15;
    const allowEntry = mins < 14 * 60 + 30 && !forceFlat;
    if (mins >= 14 * 60 + 30) phase = 'close';
    else if (mins >= 12 * 60) phase = 'mid';
    else phase = 'open';

    return {
      allowEntry,
      forceFlat,
      phase,
      reason: forceFlat
        ? 'Past 15:15 — square off / no overnight'
        : !allowEntry
          ? 'Past 14:30 — no new intraday entries (need time to exit)'
          : 'Intraday window open',
    };
  }

  const forceFlat = barsLeft <= INTRADAY_FORCE_FLAT_BARS;
  const allowEntry =
    !forceFlat &&
    barsLeft > INTRADAY_NO_ENTRY_BARS &&
    pct < INTRADAY_ENTRY_CUTOFF_PCT &&
    phase !== 'close';

  return {
    allowEntry,
    forceFlat,
    phase: allowEntry ? phase : phase === 'open' ? 'mid' : 'close',
    reason: forceFlat
      ? 'Last bars of session — force flat, no overnight'
      : !allowEntry
        ? 'Too late for new entries — intraday only'
        : 'Intraday window open',
  };
}

export function isIntradayEntryAllowed(
  barIdx: number,
  candles: Candle[]
): boolean {
  const c = candles[barIdx];
  return classifyIntradayBar(barIdx, candles.length, c?.t).allowEntry;
}

/** Last bar index to walk for exits (force square before close) */
export function intradayGradeWalkEnd(candlesLength: number): number {
  return Math.max(0, candlesLength - 1 - INTRADAY_FORCE_FLAT_BARS);
}

export function appendIntradayExitRule(text: string): string {
  if (text.includes('INTRADAY ONLY')) return text;
  return `${text} · ${INTRADAY_RULES_TEXT}`;
}

/** Keep only the latest IST trading date from a rolling multi-day feed. */
export function latestIstSessionCandles(candles: Candle[]): Candle[] {
  if (!candles.length) return [];
  const dayKey = (t: string) => {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t.slice(0, 10);
    return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
  };
  const latestDay = dayKey(candles[candles.length - 1].t);
  return candles.filter((c) => dayKey(c.t) === latestDay);
}
