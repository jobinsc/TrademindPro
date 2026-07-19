import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooCandles, type YahooInterval } from '@/lib/yahoo-nifty';
import { toYahooSymbol } from '@/lib/chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Candles for chart peeks / local charts */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
    const exchange = (searchParams.get('exchange') || 'NSE').toUpperCase();
    const interval = (searchParams.get('interval') || '5m') as YahooInterval;
    const limit = Math.min(5000, Math.max(20, Number(searchParams.get('limit') || 2500)));

    const yahoo = toYahooSymbol({ symbol, exchange });
    const data = await fetchYahooCandles(yahoo, interval, limit, symbol);

    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || 'No candles', yahoo },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      symbol,
      exchange,
      yahoo,
      interval,
      spot: data.spot,
      prevClose: data.prevClose,
      candles: data.candles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Candle fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
