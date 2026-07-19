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
  '1m': '7d',
  '2m': '10d',
  '5m': '1mo',
  '15m': '1mo',
  '30m': '3mo',
  '60m': '3mo',
  '1d': '10y',
  '1wk': 'max',
  '1mo': 'max',
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

export async function fetchYahooQuote(
  symbol: string,
  label?: string
): Promise<{
  ok: boolean;
  spot: number;
  prevClose: number | null;
  label: string;
  symbol: string;
  error?: string;
}> {
  const nice = label || symbol;
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TradeMindPro/0.1',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        spot: 0,
        prevClose: null,
        label: nice,
        symbol,
        error: `Upstream ${res.status}`,
      };
    }
    const data = (await res.json()) as YahooChart;
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close?.filter(
      (c): c is number => c != null
    );
    const spot =
      meta?.regularMarketPrice ??
      (closes && closes.length ? closes[closes.length - 1] : 0);
    const prevClose =
      meta?.chartPreviousClose ??
      (closes && closes.length > 1 ? closes[closes.length - 2] : null);
    if (!spot) {
      return {
        ok: false,
        spot: 0,
        prevClose: null,
        label: nice,
        symbol,
        error: 'No quote',
      };
    }
    return { ok: true, spot, prevClose, label: nice, symbol };
  } catch (e) {
    return {
      ok: false,
      spot: 0,
      prevClose: null,
      label: nice,
      symbol,
      error: e instanceof Error ? e.message : 'Fetch failed',
    };
  }
}

export async function fetchYahooCandles(
  symbol: string,
  interval: YahooInterval | string,
  maxBars = 120,
  label?: string
): Promise<{
  ok: boolean;
  spot: number;
  prevClose: number | null;
  candles: Candle[];
  label: string;
  symbol: string;
  error?: string;
}> {
  const iv = (interval in RANGE ? interval : '5m') as YahooInterval;
  const range = RANGE[iv];
  const encoded = encodeURIComponent(symbol);
  const nice = label || symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${iv}&range=${range}`;
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
        label: `${nice} ${iv}`,
        symbol,
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
        label: `${nice} ${iv}`,
        symbol,
        error: 'Could not parse candles',
      };
    }
    return {
      ok: true,
      spot: parsed.spot,
      prevClose: parsed.prevClose,
      // Keep full Yahoo history (do not truncate to a tiny window)
      candles:
        maxBars > 0
          ? parsed.candles.slice(-Math.min(maxBars, parsed.candles.length))
          : parsed.candles,
      label: `${nice} (${iv})`,
      symbol,
    };
  } catch (e) {
    return {
      ok: false,
      spot: 0,
      prevClose: null,
      candles: [],
      label: `${nice} ${iv}`,
      symbol,
      error: e instanceof Error ? e.message : 'Fetch failed',
    };
  }
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
  const r = await fetchYahooCandles('^NSEI', interval, maxBars, 'Nifty 50');
  return {
    ok: r.ok,
    spot: r.spot,
    prevClose: r.prevClose,
    candles: r.candles,
    label: r.label,
    error: r.error,
  };
}
