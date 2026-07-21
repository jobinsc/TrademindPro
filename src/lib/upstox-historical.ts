/**
 * Upstox Historical Candle Data V3 — real Nifty OHLC (incl. native 3-minute).
 * Docs: GET /v3/historical-candle/:instrument_key/:unit/:interval/:to_date/:from_date
 *
 * For minutes 1–15: max ~1 month per request → we chunk ranges.
 */

import type { Candle } from '@/lib/nejoic';

export const UPSTOX_V3_BASE = 'https://api.upstox.com/v3';
export const NIFTY_INDEX_INSTRUMENT_KEY = 'NSE_INDEX|Nifty 50';

export type UpstoxHistCandle = Candle & {
  volume?: number;
  oi?: number;
};

type RawCandle = [
  string, // timestamp
  number, // open
  number, // high
  number, // low
  number, // close
  number, // volume
  number, // oi
];

function parseCandles(raw: RawCandle[]): UpstoxHistCandle[] {
  const out: UpstoxHistCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [ts, open, high, low, close, volume, oi] = row;
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(Number(open))
    ) {
      continue;
    }
    out.push({
      t: new Date(ts).toISOString(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0),
      oi: Number(oi ?? 0),
    });
  }
  return out;
}

function dayAdd(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Split [from, to] into chunks of at most `maxDays` calendar days (inclusive). */
export function chunkDateRange(
  fromDate: string,
  toDate: string,
  maxDays = 28
): { from: string; to: string }[] {
  if (fromDate > toDate) return [];
  const chunks: { from: string; to: string }[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    let end = dayAdd(cursor, maxDays - 1);
    if (end > toDate) end = toDate;
    chunks.push({ from: cursor, to: end });
    cursor = dayAdd(end, 1);
  }
  return chunks;
}

/**
 * Fetch one Upstox V3 historical window.
 * Example: minutes/3 for true 3-minute Nifty bars.
 */
export async function fetchUpstoxHistoricalWindow(opts: {
  accessToken: string;
  instrumentKey?: string;
  unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  interval?: number;
  fromDate: string;
  toDate: string;
}): Promise<{ ok: boolean; candles: UpstoxHistCandle[]; error?: string }> {
  const token = opts.accessToken.trim();
  if (!token) return { ok: false, candles: [], error: 'Missing Upstox access token' };

  const instrumentKey = opts.instrumentKey || NIFTY_INDEX_INSTRUMENT_KEY;
  const unit = opts.unit || 'minutes';
  const interval = opts.interval ?? 3;
  const encoded = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_V3_BASE}/historical-candle/${encoded}/${unit}/${interval}/${opts.toDate}/${opts.fromDate}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      candles: [],
      error: `Upstox historical ${res.status}: ${text.slice(0, 280)}`,
    };
  }

  const json = (await res.json()) as {
    status?: string;
    data?: { candles?: RawCandle[] };
  };
  const candles = parseCandles(json.data?.candles || []);
  return { ok: true, candles };
}

/** Fetch the current trading day's live intraday candles. */
export async function fetchUpstoxIntradayCandles(opts: {
  accessToken: string;
  instrumentKey?: string;
  unit?: 'minutes' | 'hours' | 'days';
  interval?: number;
}): Promise<{ ok: boolean; candles: UpstoxHistCandle[]; error?: string }> {
  const token = opts.accessToken.trim();
  if (!token) return { ok: false, candles: [], error: 'Missing Upstox access token' };
  const instrumentKey = opts.instrumentKey || NIFTY_INDEX_INSTRUMENT_KEY;
  const unit = opts.unit || 'minutes';
  const interval = opts.interval ?? 1;
  const encoded = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_V3_BASE}/historical-candle/intraday/${encoded}/${unit}/${interval}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      candles: [],
      error: `Upstox intraday ${res.status}: ${text.slice(0, 280)}`,
    };
  }
  const json = (await res.json()) as {
    data?: { candles?: RawCandle[] };
  };
  const candles = parseCandles(json.data?.candles || []).sort((a, b) =>
    a.t.localeCompare(b.t)
  );
  return { ok: candles.length > 0, candles, error: candles.length ? undefined : 'No intraday candles returned' };
}

/**
 * Fetch multi-month 3m Nifty by chunking (V3 limit ~1 month for ≤15m intervals).
 */
export async function fetchUpstoxNifty3mRange(opts: {
  accessToken: string;
  fromDate: string;
  toDate: string;
}): Promise<{
  ok: boolean;
  candles: UpstoxHistCandle[];
  chunks: number;
  error?: string;
  source: 'upstox_v3';
}> {
  const chunks = chunkDateRange(opts.fromDate, opts.toDate, 28);
  if (!chunks.length) {
    return {
      ok: false,
      candles: [],
      chunks: 0,
      error: 'Invalid date range',
      source: 'upstox_v3',
    };
  }

  const all: UpstoxHistCandle[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const part = await fetchUpstoxHistoricalWindow({
      accessToken: opts.accessToken,
      instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
      unit: 'minutes',
      interval: 3,
      fromDate: c.from,
      toDate: c.to,
    });
    if (!part.ok) {
      return {
        ok: false,
        candles: all,
        chunks: i,
        error: part.error || `Failed chunk ${c.from}→${c.to}`,
        source: 'upstox_v3',
      };
    }
    all.push(...part.candles);
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Sort ascending + de-dupe by timestamp
  all.sort((a, b) => a.t.localeCompare(b.t));
  const seen = new Set<string>();
  const unique: UpstoxHistCandle[] = [];
  for (const bar of all) {
    if (seen.has(bar.t)) continue;
    seen.add(bar.t);
    unique.push(bar);
  }

  if (unique.length < 20) {
    return {
      ok: false,
      candles: unique,
      chunks: chunks.length,
      error: `Only ${unique.length} bars — check Upstox connection / date range`,
      source: 'upstox_v3',
    };
  }

  return {
    ok: true,
    candles: unique,
    chunks: chunks.length,
    source: 'upstox_v3',
  };
}

/** Fetch a long Nifty 1-minute window in Upstox-safe 28-day chunks. */
export async function fetchUpstoxNifty1mRange(opts: {
  accessToken: string;
  fromDate: string;
  toDate: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{
  ok: boolean;
  candles: UpstoxHistCandle[];
  chunks: number;
  error?: string;
  source: 'upstox_v3';
}> {
  const chunks = chunkDateRange(opts.fromDate, opts.toDate, 28);
  if (!chunks.length) {
    return {
      ok: false,
      candles: [],
      chunks: 0,
      error: 'Invalid date range',
      source: 'upstox_v3',
    };
  }

  const all: UpstoxHistCandle[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const part = await fetchUpstoxHistoricalWindow({
      accessToken: opts.accessToken,
      instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
      unit: 'minutes',
      interval: 1,
      fromDate: c.from,
      toDate: c.to,
    });
    if (!part.ok) {
      return {
        ok: false,
        candles: all,
        chunks: i,
        error: part.error || `Failed 1m chunk ${c.from}→${c.to}`,
        source: 'upstox_v3',
      };
    }
    all.push(...part.candles);
    opts.onProgress?.(i + 1, chunks.length);
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  all.sort((a, b) => a.t.localeCompare(b.t));
  const unique = [...new Map(all.map((bar) => [bar.t, bar])).values()];
  if (unique.length < 100) {
    return {
      ok: false,
      candles: unique,
      chunks: chunks.length,
      error: `Only ${unique.length} one-minute bars returned`,
      source: 'upstox_v3',
    };
  }
  return {
    ok: true,
    candles: unique,
    chunks: chunks.length,
    source: 'upstox_v3',
  };
}

/** Rolling six-calendar-month window accepted by Upstox 1-minute history. */
export function sixMonthOneMinuteRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  label: string;
} {
  const istNow = new Date(now.getTime() + 330 * 60 * 1000);
  const toDate = istNow.toISOString().slice(0, 10);
  const from = new Date(`${toDate}T12:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - 6);
  const fromDate = from.toISOString().slice(0, 10);
  return {
    fromDate,
    toDate,
    label: `Six-month Nifty 1m (${fromDate} → ${toDate})`,
  };
}

/** Default study window: June 1 → today (or July 31) of current year */
export function defaultJuneJulyStudyRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  label: string;
} {
  const y = now.getFullYear();
  const fromDate = `${y}-06-01`;
  const today = now.toISOString().slice(0, 10);
  const julyEnd = `${y}-07-31`;
  const toDate = today < julyEnd ? today : julyEnd;
  return {
    fromDate,
    toDate,
    label: `June–July ${y} (through ${toDate})`,
  };
}

/**
 * Maximum training window: full year ending the day before June 1 of current year.
 * Example (in 2026): 2025-06-01 → 2026-05-31
 */
export function yearBeforeJuneStudyRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  label: string;
} {
  const y = now.getFullYear();
  const fromDate = `${y - 1}-06-01`;
  const toDate = `${y}-05-31`;
  return {
    fromDate,
    toDate,
    label: `1 year before June ${y} (${fromDate} → ${toDate})`,
  };
}

/**
 * Out-of-sample validation year immediately before the training year.
 * Example (in 2026): 2024-06-01 → 2025-05-31.
 */
export function priorValidationYearRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  label: string;
} {
  const y = now.getFullYear();
  const fromDate = `${y - 2}-06-01`;
  const toDate = `${y - 1}-05-31`;
  return {
    fromDate,
    toDate,
    label: `Prior validation year (${fromDate} → ${toDate})`,
  };
}
