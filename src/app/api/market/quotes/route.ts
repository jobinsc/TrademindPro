import { NextRequest, NextResponse } from 'next/server';
import { resolveInstrumentKeys } from '@/lib/instruments';
import { fetchUpstoxQuotes, getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live quotes for symbols or instrument keys */
export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first', code: 'NO_TOKEN' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      symbols?: string[];
      instrumentKeys?: string[];
    };

    let keys = body.instrumentKeys?.filter(Boolean) || [];
    /** instrument_key (often ISIN form) → trading symbol */
    const keyToSymbol = new Map<string, string>();

    if (body.symbols?.length) {
      const resolved = await resolveInstrumentKeys(body.symbols);
      for (const [sym, row] of resolved) {
        keyToSymbol.set(row.instrumentKey.replace(/:/g, '|'), sym.toUpperCase());
        keyToSymbol.set(row.instrumentKey.replace(/\|/g, ':'), sym.toUpperCase());
      }
      if (!keys.length) {
        keys = Array.from(resolved.values()).map((i) => i.instrumentKey);
      }
    }
    if (!keys.length) {
      return NextResponse.json({ ok: false, error: 'symbols or instrumentKeys required' }, { status: 400 });
    }

    const quotes = await fetchUpstoxQuotes(token, keys);
    const enriched = quotes.map((q) => {
      const kPipe = q.instrumentKey.replace(/:/g, '|');
      const kColon = q.instrumentKey.replace(/\|/g, ':');
      const mapped =
        keyToSymbol.get(kPipe) ||
        keyToSymbol.get(kColon) ||
        keyToSymbol.get(q.instrumentKey) ||
        q.symbol;
      return { ...q, symbol: String(mapped || q.symbol || '').toUpperCase() };
    });
    return NextResponse.json({ ok: true, count: enriched.length, quotes: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
