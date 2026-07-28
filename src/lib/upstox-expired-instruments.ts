/**
 * Upstox expired FO instruments + option contract list (V2).
 * Mirrors D:\BOTS\NexusPulse bot upstox_client helpers for real-option studies.
 */

import type { UpstoxHistCandle } from '@/lib/upstox-historical';
import { fetchUpstoxHistoricalWindow, fetchUpstoxIntradayCandles } from '@/lib/upstox-historical';

export const UPSTOX_V2_BASE = 'https://api.upstox.com/v2';
export const NIFTY_UNDERLYING_KEY = 'NSE_INDEX|Nifty 50';

type RawCandle = [string, number, number, number, number, number?, number?];

function parseCandles(raw: RawCandle[]): UpstoxHistCandle[] {
  const out: UpstoxHistCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [ts, open, high, low, close, volume, oi] = row;
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
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

async function upstoxV2Get(
  accessToken: string,
  path: string,
  params?: Record<string, string>
): Promise<unknown> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const res = await fetch(`${UPSTOX_V2_BASE}${path}${qs}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken.trim()}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstox ${path} ${res.status}: ${text.slice(0, 240)}`);
  }
  return res.json();
}

export type UpstoxOptionContractRow = {
  instrument_key?: string;
  instrument_type?: string;
  strike_price?: number;
  expiry?: string;
  trading_symbol?: string;
  tradingsymbol?: string;
};

export async function fetchExpiredExpiries(
  accessToken: string,
  underlyingKey = NIFTY_UNDERLYING_KEY
): Promise<string[]> {
  const json = (await upstoxV2Get(accessToken, '/expired-instruments/expiries', {
    instrument_key: underlyingKey,
  })) as { data?: string[] };
  return (json.data ?? []).map((x) => String(x).slice(0, 10));
}

export async function fetchOptionContractList(
  accessToken: string,
  underlyingKey = NIFTY_UNDERLYING_KEY
): Promise<UpstoxOptionContractRow[]> {
  const json = (await upstoxV2Get(accessToken, '/option/contract', {
    instrument_key: underlyingKey,
  })) as { data?: UpstoxOptionContractRow[] };
  return json.data ?? [];
}

export async function fetchExpiredOptionContracts(
  accessToken: string,
  expiryDate: string,
  underlyingKey = NIFTY_UNDERLYING_KEY
): Promise<UpstoxOptionContractRow[]> {
  const json = (await upstoxV2Get(accessToken, '/expired-instruments/option/contract', {
    instrument_key: underlyingKey,
    expiry_date: expiryDate.slice(0, 10),
  })) as { data?: UpstoxOptionContractRow[] };
  return json.data ?? [];
}

/** 1m candles for expired FO keys (instrument_key may include |DD-MM-YYYY). */
export async function fetchExpiredDayCandles(
  accessToken: string,
  instrumentKey: string,
  day: string,
  interval = '1minute'
): Promise<UpstoxHistCandle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const d = day.slice(0, 10);
  const json = (await upstoxV2Get(
    accessToken,
    `/expired-instruments/historical-candle/${encoded}/${interval}/${d}/${d}`
  )) as { data?: { candles?: RawCandle[] } };
  return parseCandles(json.data?.candles ?? []);
}

/** One calendar day of 1m bars (intraday API when day is today). */
export async function fetchInstrumentDayCandles(
  accessToken: string,
  instrumentKey: string,
  day: string,
  todayIso: string
): Promise<UpstoxHistCandle[]> {
  const d = day.slice(0, 10);
  if (d === todayIso.slice(0, 10)) {
    const intra = await fetchUpstoxIntradayCandles({
      accessToken,
      instrumentKey,
      unit: 'minutes',
      interval: 1,
    });
    if (intra.ok && intra.candles.length) return intra.candles;
  }
  const hist = await fetchUpstoxHistoricalWindow({
    accessToken,
    instrumentKey,
    unit: 'minutes',
    interval: 1,
    fromDate: d,
    toDate: d,
  });
  return hist.candles;
}

export function isExpiredInstrumentKey(instrumentKey: string): boolean {
  return instrumentKey.includes('|') && instrumentKey.split('|').length >= 3;
}

export async function loadOptionDayCloses(
  accessToken: string,
  instrumentKey: string,
  day: string,
  todayIso: string
): Promise<Map<number, number>> {
  let candles: UpstoxHistCandle[] = [];
  try {
    if (isExpiredInstrumentKey(instrumentKey)) {
      candles = await fetchExpiredDayCandles(accessToken, instrumentKey, day);
    } else {
      candles = await fetchInstrumentDayCandles(accessToken, instrumentKey, day, todayIso);
    }
  } catch {
    candles = [];
  }
  const map = new Map<number, number>();
  for (const c of candles) {
    map.set(new Date(c.t).getTime(), c.close);
  }
  return map;
}

/** Last option close at or before `ts` (ms). */
export function premiumAtOrBefore(closes: Map<number, number>, tsMs: number): number | null {
  let best: number | null = null;
  let bestT = -1;
  for (const [t, close] of closes) {
    if (t <= tsMs && t >= bestT && close > 0) {
      bestT = t;
      best = close;
    }
  }
  return best;
}
