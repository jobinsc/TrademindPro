import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import { runPriceAction } from '@/lib/price-action';
import { fetchLiveQuotes } from '@/lib/live-quotes';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SymbolAnalysis = {
  symbol: string;
  ok: boolean;
  ltp: number | null;
  changePct: number | null;
  bias: 'CE' | 'PE' | 'FLAT';
  setup: string;
  confidence: number;
  pattern: string;
  structureText: string;
  support: number | null;
  resistance: number | null;
  updatedAt: string;
  error?: string;
};

function yahooSym(symbol: string, exchange?: string) {
  const s = symbol.trim().toUpperCase();
  if (exchange === 'BSE') return `${s}.BO`;
  return `${s}.NS`;
}

/** Background PA + live quote for journal / watchlist symbols */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      symbols?: { symbol: string; exchange?: string }[];
    };
    const list = (body.symbols || []).slice(0, 20);
    if (!list.length) {
      return NextResponse.json({ ok: false, error: 'symbols required' }, { status: 400 });
    }

    const token = getBearerToken(req);
    const quotes = await fetchLiveQuotes({ symbols: list, accessToken: token });
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    const analyses: SymbolAnalysis[] = await Promise.all(
      list.map(async (item) => {
        const sym = item.symbol.trim().toUpperCase();
        const q = quoteMap.get(sym);
        try {
          const candles = await fetchYahooCandles(
            yahooSym(sym, item.exchange),
            '15m',
            80,
            sym
          );
          if (!candles.ok || candles.candles.length < 20) {
            return {
              symbol: sym,
              ok: Boolean(q?.ok),
              ltp: q?.ok ? q.lastPrice : null,
              changePct: q?.changePct ?? null,
              bias: 'FLAT' as const,
              setup: 'NO_DATA',
              confidence: 0,
              pattern: '—',
              structureText: candles.error || 'Need more bars',
              support: null,
              resistance: null,
              updatedAt: new Date().toISOString(),
              error: candles.error,
            };
          }
          const pa = runPriceAction(candles.candles, {
            leftBars: 5,
            rightBars: 5,
          });
          return {
            symbol: sym,
            ok: true,
            ltp: q?.ok ? q.lastPrice : candles.spot,
            changePct: q?.changePct ?? null,
            bias: pa.bias,
            setup: pa.setup,
            confidence: pa.confidence,
            pattern: pa.lastLabel || pa.structureText.split('·')[0]?.trim() || '—',
            structureText: pa.structureText,
            support: pa.support,
            resistance: pa.resistance,
            updatedAt: new Date().toISOString(),
          };
        } catch (e) {
          return {
            symbol: sym,
            ok: false,
            ltp: q?.ok ? q.lastPrice : null,
            changePct: q?.changePct ?? null,
            bias: 'FLAT' as const,
            setup: 'ERROR',
            confidence: 0,
            pattern: '—',
            structureText: e instanceof Error ? e.message : 'Failed',
            support: null,
            resistance: null,
            updatedAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : 'Failed',
          };
        }
      })
    );

    return NextResponse.json({
      ok: analyses.some((a) => a.ok),
      fetchedAt: new Date().toISOString(),
      analyses,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyze failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
