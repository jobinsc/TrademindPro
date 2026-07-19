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
    if (!keys.length && body.symbols?.length) {
      const resolved = await resolveInstrumentKeys(body.symbols);
      keys = Array.from(resolved.values()).map((i) => i.instrumentKey);
    }
    if (!keys.length) {
      return NextResponse.json({ ok: false, error: 'symbols or instrumentKeys required' }, { status: 400 });
    }

    const quotes = await fetchUpstoxQuotes(token, keys);
    return NextResponse.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
