import type { Candle } from '@/lib/nejoic';

/** Yahoo-supported intervals we request */
export type YahooInterval =
  | '1m'
  | '2m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '1d'
  | '1wk'
  | '1mo';

type YahooChart = {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }[];
      };
    }[];
  };
};

const RANGE: Record<YahooInterval, string> = {
  '1m': '1d',
  '2m': '1d',
  '5m': '5d',
  '15m': '5d',
  '30m': '1mo',
  '60m': '1mo',
  '1d': '6mo',
  '1wk': '2y',
  '1mo': '5y',
};

export function parseYahooChart(data: YahooChart): {
  spot: number;
  prevClose: number | null;
  candles: Candle[];
} | null {
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;
  const q = result.indicators?.quote?.[0];
  if (!q) return null;

  const candles: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      t: new Date(result.timestamp[i] * 1000).toISOString(),
      open,
      high,
      low,
      close,
    });
  }
  if (candles.length < 5) return null;
  const spot =
    result.meta?.regularMarketPrice ?? candles[candles.length - 1]?.close ?? 0;
  const prevClose = result.meta?.chartPreviousClose ?? null;
  return { spot, prevClose, candles };
}

export async function fetchNiftyCandles(
  interval: YahooInterval | string,
  maxBars = 120
): Promise<{
  ok: boolean;
  spot: number;
  prevClose: number | null;
  candles: Candle[];
  label: string;
  error?: string;
}> {
  const iv = (interval in RANGE ? interval : '5m') as YahooInterval;
  const range = RANGE[iv];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=${iv}&range=${range}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TradeMindPro/0.1',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        ok: false,
        spot: 0,
        prevClose: null,
        candles: [],
        label: `Nifty ${iv}`,
        error: `Upstream ${res.status}`,
      };
    }
    const data = (await res.json()) as YahooChart;
    const parsed = parseYahooChart(data);
    if (!parsed) {
      return {
        ok: false,
        spot: 0,
        prevClose: null,
        candles: [],
        label: `Nifty ${iv}`,
        error: 'Could not parse candles',
      };
    }
    return {
      ok: true,
      spot: parsed.spot,
      prevClose: parsed.prevClose,
      candles: parsed.candles.slice(-maxBars),
      label: `Nifty 50 (${iv})`,
    };
  } catch (e) {
    return {
      ok: false,
      spot: 0,
      prevClose: null,
      candles: [],
      label: `Nifty ${iv}`,
      error: e instanceof Error ? e.message : 'Fetch failed',
    };
  }
}
