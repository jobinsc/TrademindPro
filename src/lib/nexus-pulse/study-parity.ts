/**
 * Shared gates with real-option study (BOTS backtest_session_real_options.py).
 * Live desks must use these so entry times match Run study — not multi-day leftover signals.
 */

import { istDate, istMinutesOfDay } from '@/lib/pinax-forge/ist';
import type { Candle } from '@/lib/nejoic';

/** Study loop: `for (let i = 40; i < df1m.length; i++)` — no entries before this index. */
export const STUDY_1M_WARMUP_BARS = 40;

/** Cash/FO session slice used by the study (09:15–15:29 IST). */
export function sessionSliceCash(candles: Candle[]): Candle[] {
  return candles
    .filter((c) => {
      const mins = istMinutesOfDay(c.t);
      if (mins == null) return false;
      return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 29;
    })
    .sort((a, b) => a.t.localeCompare(b.t));
}

/** Today's session 1m only — study never carries overnight UT state into the open. */
export function studyDaySession1m(candles: Candle[], sessionDate: string): Candle[] {
  const day = sessionDate.slice(0, 10);
  return sessionSliceCash(candles).filter((c) => istDate(new Date(c.t)) === day);
}

export function lastBarAtOrBefore<T extends { t: string }>(bars: T[], tsMs: number): T | null {
  let best: T | null = null;
  for (const b of bars) {
    const t = new Date(b.t).getTime();
    if (t <= tsMs) best = b;
    else break;
  }
  return best;
}

/**
 * Last TF bar that is fully closed by decision time `tsMs`.
 * Prevents live from entering on a half-built 5m bucket (pos can flicker −1/1),
 * and prevents study lookahead when the day series already contains later 1m closes.
 */
export function lastClosedTfAtOrBefore<T extends { t: string }>(
  bars: T[],
  tfMinutes: number,
  tsMs: number
): T | null {
  let best: T | null = null;
  for (const b of bars) {
    const start = new Date(b.t).getTime();
    if (!Number.isFinite(start) || start > tsMs) break;
    const closedAt = start + tfMinutes * 60_000 - 2_000;
    if (tsMs >= closedAt) best = b;
  }
  return best;
}

/** Same entry gate as real-option study: 3m edge + 5m pos agree. */
export function studyWantSide(opts: {
  buy3: boolean;
  sell3: boolean;
  pos5: number;
}): 'CE' | 'PE' | null {
  if (opts.buy3 && opts.pos5 === 1) return 'CE';
  if (opts.sell3 && opts.pos5 === -1) return 'PE';
  return null;
}

/** Index of this 1m bar in the study day series; -1 if missing. */
export function studyBarIndex(day1m: Candle[], barT: string | null | undefined): number {
  if (!barT || !day1m.length) return -1;
  return day1m.findIndex((c) => c.t === barT);
}

export function studyWarmupReady(day1m: Candle[], closed1mT: string | null | undefined): boolean {
  return studyBarIndex(day1m, closed1mT) >= STUDY_1M_WARMUP_BARS;
}
