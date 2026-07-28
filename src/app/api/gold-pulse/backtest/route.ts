import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAndRunGoldPulseBacktest,
  isValidGoldStudyDay,
  sliceGoldBacktestByOpenDateRange,
} from '@/lib/gold-pulse/backtest';
import { goldStrategyParams, isGoldStrategyId } from '@/lib/gold-pulse/strategies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Official Yahoo study for a GoldPulse strategy. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
      strategyId?: string;
    };
    const strategyId = isGoldStrategyId(String(body.strategyId || ''))
      ? (body.strategyId as 'v12_max' | 'sweep_peak')
      : 'v12_max';

    const result = await fetchAndRunGoldPulseBacktest({ ...goldStrategyParams(strategyId) });
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 });
    }

    const fromDate = body.fromDate?.slice(0, 10);
    const toDate = body.toDate?.slice(0, 10);
    if (fromDate || toDate) {
      if (!fromDate || !toDate || !isValidGoldStudyDay(fromDate) || !isValidGoldStudyDay(toDate)) {
        return NextResponse.json(
          { ok: false, error: 'Provide valid fromDate and toDate (YYYY-MM-DD)' },
          { status: 400 }
        );
      }
      if (fromDate > toDate) {
        return NextResponse.json(
          { ok: false, error: 'Start date must be on or before end date' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ...sliceGoldBacktestByOpenDateRange(result, fromDate, toDate),
        strategyId,
      });
    }

    return NextResponse.json({ ...result, strategyId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
