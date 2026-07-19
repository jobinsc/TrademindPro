import { NextResponse } from 'next/server';
import { fetchNiftyCandles } from '@/lib/yahoo-nifty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const parsed = await fetchNiftyCandles('1m', 80);
  if (!parsed.ok) {
    return NextResponse.json({
      ok: false,
      source: null,
      error: parsed.error,
      spot: null,
      candles: [],
    });
  }
  return NextResponse.json({
    ok: true,
    source: 'yahoo-nsei',
    label: parsed.label,
    spot: parsed.spot,
    candles: parsed.candles,
    fetchedAt: new Date().toISOString(),
  });
}
