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

/** Short TTL quote cache — cuts duplicate polls (Pinax + Nexus + Lab) hitting UDAPI10005. */
const QUOTE_CACHE_TTL_MS = 2_500;
const quoteCache = new Map<string, { at: number; quote: UpstoxQuote }>();
let lastQuoteCallAt = 0;
let quoteCooldownUntil = 0;
let quoteFetchMutex: Promise<void> = Promise.resolve();

/**
 * Serialize quote HTTP calls across all concurrent requests.
 * Without this, multiple agents can call `fetchUpstoxQuotes()` at the same time
 * and bypass the spacing guard around `lastQuoteCallAt`.
 */
async function withQuoteFetchLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = quoteFetchMutex;
  let release!: () => void;
  quoteFetchMutex = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function quoteCacheKey(instrumentKey: string): string {
  return instrumentKey.replace(/:/g, '|');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch full market quotes — max 500 keys per Upstox call; soft cache + 429 backoff. */
export async function fetchUpstoxQuotes(
  accessToken: string,
  instrumentKeys: string[]
): Promise<UpstoxQuote[]> {
  const token = accessToken.trim();
  if (!token) throw new Error('Missing Upstox access token');
  if (!instrumentKeys.length) return [];

  const now = Date.now();
  const unique = [...new Set(instrumentKeys.map(quoteCacheKey).filter(Boolean))];
  const results: UpstoxQuote[] = [];
  const missing: string[] = [];

  for (const key of unique) {
    const hit = quoteCache.get(key);
    if (hit && now - hit.at < QUOTE_CACHE_TTL_MS) {
      results.push(hit.quote);
    } else {
      missing.push(key);
    }
  }

  if (!missing.length) return results;

  // Run actual HTTP calls under a global lock.
  return withQuoteFetchLock(async () => {
    // Another concurrent request may have filled the cache while we waited.
    const now2 = Date.now();
    const stillMissing: string[] = [];
    for (const key of unique) {
      const hit = quoteCache.get(key);
      if (hit && now2 - hit.at < QUOTE_CACHE_TTL_MS) {
        results.push(hit.quote);
      } else {
        stillMissing.push(key);
      }
    }

    // De-dupe results in case we added cached quotes twice.
    const seen = new Set<string>();
    const deduped: UpstoxQuote[] = [];
    for (const r of results) {
      const k = quoteCacheKey(r.instrumentKey);
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(r);
    }
    results.length = 0;
    results.push(...deduped);

    if (!stillMissing.length) return results;

    // Global spacing between live Upstox quote HTTP calls (serialized by lock).
    const MIN_QUOTE_SPACING_MS = 700;
    const waitSpace = Math.max(0, MIN_QUOTE_SPACING_MS - (now2 - lastQuoteCallAt));
    const waitCool = Math.max(0, quoteCooldownUntil - now2);
    const wait = Math.max(waitSpace, waitCool);
    if (wait > 0) await sleep(wait);

    const batches = chunk(stillMissing, 400);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const qs = encodeURIComponent(batch.join(','));
      let attempt = 0;
      while (attempt < 3) {
        attempt += 1;
        lastQuoteCallAt = Date.now();
        const res = await fetch(
          `${UPSTOX_API_BASE}/market-quote/quotes?instrument_key=${qs}`,
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
          }
        );
        if (res.status === 429) {
          // Backoff to avoid lockstep bursts from multiple agents.
          const backoff = Math.min(20_000, 2_000 * attempt * attempt);
          quoteCooldownUntil = Date.now() + backoff;
          if (attempt >= 3) {
            // Prefer stale cache over hard fail when rate-limited.
            for (const key of batch) {
              const stale = quoteCache.get(key);
              if (stale) results.push(stale.quote);
            }
            break; // go to next batch (or finish)
          }
          await sleep(backoff);
          continue;
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `Upstox quotes error ${res.status}: ${text.slice(0, 240)}`
          );
        }
        const json = (await res.json()) as {
          data?: Record<string, QuotePayload>;
          status?: string;
        };
        const data = json.data || {};
        const fetchedAt = Date.now();
        for (const [key, raw] of Object.entries(data)) {
          const q = normalizeQuote(raw, key);
          if (q) {
            results.push(q);
            quoteCache.set(quoteCacheKey(q.instrumentKey), {
              at: fetchedAt,
              quote: q,
            });
          }
        }
        break;
      }
      if (i < batches.length - 1) await sleep(200);
    }

    // Final de-dupe.
    const seen2 = new Set<string>();
    const deduped2: UpstoxQuote[] = [];
    for (const r of results) {
      const k = quoteCacheKey(r.instrumentKey);
      if (seen2.has(k)) continue;
      seen2.add(k);
      deduped2.push(r);
    }
    results.length = 0;
    results.push(...deduped2);

    return results;
  });
}

export function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
