/**
 * Same option premium tape as real-option study (loadOptionDayCloses + premiumAtOrBefore).
 * Live must use this for entry/exit marks — not a separate intraday lastClosedBar path.
 */

import {
  loadOptionDayCloses,
  premiumAtOrBefore,
} from '@/lib/upstox-expired-instruments';
import { istDate } from '@/lib/pinax-forge/ist';

const closeCache = new Map<string, { at: number; map: Map<number, number> }>();
const CLOSE_CACHE_TTL_MS = 45_000;

async function closesFor(
  accessToken: string,
  instrumentKey: string,
  day: string
): Promise<Map<number, number>> {
  const todayIso = istDate();
  const cacheKey = `${instrumentKey}|${day}`;
  const hit = closeCache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.at < CLOSE_CACHE_TTL_MS) return hit.map;
  const map = await loadOptionDayCloses(accessToken, instrumentKey, day, todayIso);
  closeCache.set(cacheKey, { at: now, map });
  return map;
}

/** Study-style premium at or before tsMs. */
export async function studyOptionPremiumAt(opts: {
  accessToken: string;
  instrumentKey: string;
  day: string;
  tsMs: number;
}): Promise<number | null> {
  if (!opts.instrumentKey) return null;
  const map = await closesFor(opts.accessToken, opts.instrumentKey, opts.day.slice(0, 10));
  return premiumAtOrBefore(map, opts.tsMs);
}

/** Fill markMap with study tape premiums at tsMs. Returns keys that got a price. */
export async function fillMarksFromStudyOptionTape(
  accessToken: string,
  markMap: Map<string, number>,
  trades: { instrumentKey: string }[],
  opts: { day: string; tsMs: number }
): Promise<Set<string>> {
  const filled = new Set<string>();
  const day = opts.day.slice(0, 10);
  const keys = [...new Set(trades.map((t) => t.instrumentKey).filter(Boolean))];
  await Promise.all(
    keys.map(async (instrumentKey) => {
      try {
        const p = await studyOptionPremiumAt({
          accessToken,
          instrumentKey,
          day,
          tsMs: opts.tsMs,
        });
        if (p != null && p > 0) {
          markMap.set(instrumentKey, p);
          filled.add(instrumentKey);
        }
      } catch {
        /* leave unset */
      }
    })
  );
  return filled;
}

/** True when a TF bucket starting at barT is fully closed (study uses completed OHLC). */
export function isTfBarFullyClosed(barT: string, tfMinutes: number, nowMs = Date.now()): boolean {
  const start = new Date(barT).getTime();
  if (!Number.isFinite(start)) return false;
  return nowMs >= start + tfMinutes * 60_000 - 2_000;
}
