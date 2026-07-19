import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveQuotes } from '@/lib/live-quotes';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified live quotes — Upstox if Bearer token sent, else Yahoo (.NS / .BO).
 * POST { symbols: string[] | { symbol, exchange }[], interval ignored }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      symbols?: (string | { symbol: string; exchange?: string })[];
    };
    const raw = Array.isArray(body.symbols) ? body.symbols : [];
    const symbols = raw
      .map((s) =>
        typeof s === 'string'
          ? { symbol: s }
          : { symbol: s.symbol, exchange: s.exchange }
      )
      .filter((s) => s.symbol?.trim());

    if (!symbols.length) {
      return NextResponse.json({ ok: false, error: 'symbols required' }, { status: 400 });
    }

    // Cap batch size for 3s polling
    const capped = symbols.slice(0, 80);
    const token = getBearerToken(req);
    const quotes = await fetchLiveQuotes({
      symbols: capped,
      accessToken: token,
    });

    return NextResponse.json({
      ok: quotes.some((q) => q.ok),
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      quotes: quotes.map(({ symbol, lastPrice, change, changePct, ok }) => ({
        symbol,
        lastPrice,
        change,
        changePct,
        ok,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Live quotes failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
