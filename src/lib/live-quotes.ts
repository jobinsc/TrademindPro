import { fetchYahooQuote } from '@/lib/yahoo-nifty';
import { resolveInstrumentKeys } from '@/lib/instruments';
import { fetchUpstoxQuotes } from '@/lib/upstox-market';

export type LiveQuote = {
  symbol: string;
  exchange?: string;
  lastPrice: number;
  change: number | null;
  changePct: number | null;
  source: 'upstox' | 'yahoo';
  ok: boolean;
  error?: string;
};

function yahooSymbol(symbol: string, exchange?: string): string {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return s;
  if (s.includes('=') || s.startsWith('^')) return s;
  if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
  if (exchange === 'BSE') return `${s}.BO`;
  return `${s}.NS`;
}

/** Fetch live quotes — Upstox when token present, Yahoo fallback otherwise */
export async function fetchLiveQuotes(opts: {
  symbols: { symbol: string; exchange?: string }[];
  accessToken?: string | null;
}): Promise<LiveQuote[]> {
  const wanted = opts.symbols
    .map((s) => ({
      symbol: s.symbol.trim().toUpperCase(),
      exchange: s.exchange,
    }))
    .filter((s) => s.symbol);

  if (!wanted.length) return [];

  const bySym = new Map<string, LiveQuote>();
  const token = opts.accessToken?.trim();

  if (token) {
    try {
      const resolved = await resolveInstrumentKeys(wanted.map((w) => w.symbol));
      const keys = Array.from(resolved.values()).map((i) => i.instrumentKey);
      if (keys.length) {
        const quotes = await fetchUpstoxQuotes(token, keys);
        for (const q of quotes) {
          bySym.set(q.symbol.toUpperCase(), {
            symbol: q.symbol.toUpperCase(),
            lastPrice: q.lastPrice,
            change: q.change,
            changePct: q.changePct,
            source: 'upstox',
            ok: true,
          });
        }
      }
    } catch {
      /* fall through to Yahoo for missing */
    }
  }

  const missing = wanted.filter((w) => !bySym.has(w.symbol));
  if (missing.length) {
    const yahooRows = await Promise.all(
      missing.map(async (w) => {
        const ySym = yahooSymbol(w.symbol, w.exchange);
        const r = await fetchYahooQuote(ySym, w.symbol);
        if (!r.ok || !r.spot) {
          return {
            symbol: w.symbol,
            exchange: w.exchange,
            lastPrice: 0,
            change: null,
            changePct: null,
            source: 'yahoo' as const,
            ok: false,
            error: r.error || 'No quote',
          };
        }
        const change =
          r.prevClose && r.prevClose > 0 ? r.spot - r.prevClose : null;
        const changePct =
          change != null && r.prevClose ? (change / r.prevClose) * 100 : null;
        return {
          symbol: w.symbol,
          exchange: w.exchange,
          lastPrice: r.spot,
          change,
          changePct,
          source: 'yahoo' as const,
          ok: true,
        };
      })
    );
    for (const row of yahooRows) bySym.set(row.symbol, row);
  }

  return wanted.map(
    (w) =>
      bySym.get(w.symbol) || {
        symbol: w.symbol,
        exchange: w.exchange,
        lastPrice: 0,
        change: null,
        changePct: null,
        source: 'yahoo' as const,
        ok: false,
        error: 'Missing',
      }
  );
}
