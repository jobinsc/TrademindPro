import { UPSTOX_API_BASE } from '@/lib/upstox';

export type UpstoxQuote = {
  instrumentKey: string;
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number; // previous close / OHLC close
  change: number;
  changePct: number;
  volume: number;
  averagePrice: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
};

type QuotePayload = {
  instrument_key?: string;
  symbol?: string;
  last_price?: number;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  net_change?: number;
  volume?: number;
  average_price?: number;
  depth?: {
    buy?: Array<{ price?: number }>;
    sell?: Array<{ price?: number }>;
  };
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeQuote(raw: QuotePayload, fallbackKey: string): UpstoxQuote | null {
  const last = Number(raw.last_price ?? 0);
  if (!Number.isFinite(last) || last <= 0) return null;
  const open = Number(raw.ohlc?.open ?? last);
  const high = Number(raw.ohlc?.high ?? last);
  const low = Number(raw.ohlc?.low ?? last);
  const close = Number(raw.ohlc?.close ?? last);
  const change = Number(raw.net_change ?? last - close);
  const changePct = close > 0 ? (change / close) * 100 : 0;
  const bestBid = Number(raw.depth?.buy?.[0]?.price ?? 0);
  const bestAsk = Number(raw.depth?.sell?.[0]?.price ?? 0);
  const symbol = String(raw.symbol || '')
    .replace(/^(NSE_EQ|BSE_EQ):/i, '')
    .trim()
    .toUpperCase();

  return {
    instrumentKey: String(raw.instrument_key || fallbackKey),
    symbol: symbol || fallbackKey,
    lastPrice: last,
    open,
    high,
    low,
    close,
    change,
    changePct,
    volume: Number(raw.volume ?? 0),
    averagePrice: Number(raw.average_price ?? last),
    bestBid: bestBid > 0 ? bestBid : undefined,
    bestAsk: bestAsk > 0 ? bestAsk : undefined,
    spread:
      bestBid > 0 && bestAsk >= bestBid
        ? Number((bestAsk - bestBid).toFixed(2))
        : undefined,
  };
}

/** Fetch full market quotes — max 500 keys per Upstox call */
export async function fetchUpstoxQuotes(
  accessToken: string,
  instrumentKeys: string[]
): Promise<UpstoxQuote[]> {
  const token = accessToken.trim();
  if (!token) throw new Error('Missing Upstox access token');
  if (!instrumentKeys.length) return [];

  const results: UpstoxQuote[] = [];
  const batches = chunk(instrumentKeys, 400);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const qs = encodeURIComponent(batch.join(','));
    const res = await fetch(`${UPSTOX_API_BASE}/market-quote/quotes?instrument_key=${qs}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upstox quotes error ${res.status}: ${text.slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      data?: Record<string, QuotePayload>;
      status?: string;
    };
    const data = json.data || {};
    for (const [key, raw] of Object.entries(data)) {
      const q = normalizeQuote(raw, key);
      if (q) results.push(q);
    }
    // Gentle pacing between batches on full-market scans
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return results;
}

export function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
