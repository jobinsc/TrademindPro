import { NextRequest, NextResponse } from 'next/server';
import { fetchNiftyCandles, type YahooInterval } from '@/lib/yahoo-nifty';
import { timeframeToYahoo } from '@/lib/nejoic-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: YahooInterval[] = [
  '1m',
  '2m',
  '5m',
  '15m',
  '30m',
  '60m',
  '1d',
  '1wk',
  '1mo',
];

export async function GET(req: NextRequest) {
  const tf = req.nextUrl.searchParams.get('tf') || req.nextUrl.searchParams.get('interval') || '5m';
  const yahoo = timeframeToYahoo(tf);
  const interval = (ALLOWED.includes(yahoo as YahooInterval) ? yahoo : '5m') as YahooInterval;
  const limit = Math.min(500, Math.max(40, Number(req.nextUrl.searchParams.get('limit') || 120)));

  const parsed = await fetchNiftyCandles(interval, limit);
  if (!parsed.ok) {
    return NextResponse.json({
      ok: false,
      source: null,
      error: parsed.error,
      spot: null,
      candles: [],
      interval,
      tf,
    });
  }
  return NextResponse.json({
    ok: true,
    source: 'yahoo-nsei',
    label: `${parsed.label} · ${tf}`,
    spot: parsed.spot,
    candles: parsed.candles,
    interval,
    tf,
    fetchedAt: new Date().toISOString(),
  });
}
