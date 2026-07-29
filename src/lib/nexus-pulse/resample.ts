import type { Candle } from '@/lib/nejoic';

/** Bucket 1m candles into N-minute OHLC (IST-safe via ISO timestamps). */
export function resampleMinutes(candles: Candle[], minutes: number): Candle[] {
  if (!candles.length || minutes <= 1) {
    return [...candles].sort((a, b) => a.t.localeCompare(b.t));
  }
  const sorted = [...candles].sort((a, b) => a.t.localeCompare(b.t));
  const buckets = new Map<string, Candle[]>();

  for (const c of sorted) {
    const d = new Date(c.t);
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    const istMin = (utcMin + 330) % (24 * 60);
    const bucketIst = Math.floor(istMin / minutes) * minutes;
    // Key by UTC day + bucket start for uniqueness across days
    const day = new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    const key = `${day}-${bucketIst}`;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const out: Candle[] = [];
  for (const list of buckets.values()) {
    if (!list.length) continue;
    out.push({
      t: list[0].t,
      open: list[0].open,
      high: Math.max(...list.map((x) => x.high)),
      low: Math.min(...list.map((x) => x.low)),
      close: list[list.length - 1].close,
    });
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

/**
 * Last fully closed TF bar — ignore the in-progress bucket.
 * Prevents live ticks from entering/exiting on a half-formed 3m/5m candle
 * (stale cache → instant UT_5M flip when the next bucket appears).
 */
export function lastClosedBar<T extends { t: string }>(
  bars: T[],
  tfMinutes: number,
  nowMs = Date.now()
): T | null {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const ageMs = nowMs - new Date(last.t).getTime();
  if (
    Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs < tfMinutes * 60_000 - 2_000 &&
    bars.length >= 2
  ) {
    return bars[bars.length - 2];
  }
  return last;
}
