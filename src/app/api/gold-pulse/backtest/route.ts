import { NextResponse } from 'next/server';
import { fetchAndRunGoldPulseBacktest } from '@/lib/gold-pulse/backtest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Yahoo GC=F 5m + 15m UT / Sector 7 G backtest. */
export async function POST() {
  try {
    const result = await fetchAndRunGoldPulseBacktest();
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
