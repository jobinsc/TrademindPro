import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import { fetchNiftyOptionLtp, type OptionSide } from '@/lib/upstox-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live Nifty option LTP from Upstox (ATM current week by default).
 * Body: { spot, option: 'CE'|'PE', strike?, expiry?: 'current_week'|'next_week' }
 */
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
      spot?: number;
      option?: OptionSide;
      strike?: number;
      expiry?: 'current_week' | 'next_week';
      instrumentKey?: string;
    };

    const option = (body.option || 'CE').toUpperCase() as OptionSide;
    if (option !== 'CE' && option !== 'PE') {
      return NextResponse.json({ ok: false, error: 'option must be CE or PE' }, { status: 400 });
    }
    const spot = Number(body.spot || 0);
    if (!spot) {
      return NextResponse.json({ ok: false, error: 'spot required' }, { status: 400 });
    }

    // Direct quote if instrument key already known (open trade exit)
    if (body.instrumentKey) {
      const { fetchUpstoxQuotes } = await import('@/lib/upstox-market');
      const quotes = await fetchUpstoxQuotes(token, [body.instrumentKey]);
      const q = quotes[0];
      if (!q?.lastPrice) {
        return NextResponse.json(
          { ok: false, error: 'No LTP for instrument' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        source: 'upstox',
        ltp: Math.round(q.lastPrice * 100) / 100,
        instrumentKey: body.instrumentKey,
        option,
        strike: body.strike ?? null,
      });
    }

    const result = await fetchNiftyOptionLtp({
      accessToken: token,
      spot,
      option,
      strike: body.strike,
      expiryKeyword: body.expiry || 'current_week',
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'LTP unavailable', source: result.source },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: 'upstox',
      ltp: result.ltp,
      instrumentKey: result.contract?.instrumentKey,
      tradingSymbol: result.contract?.tradingSymbol,
      strike: result.contract?.strike,
      expiry: result.contract?.expiry,
      lotSize: result.contract?.lotSize,
      option,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Option LTP failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
