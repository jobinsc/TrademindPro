import { NextRequest, NextResponse } from 'next/server';
import { runHistoricalBacktest } from '@/lib/backtest';
import {
  catalogStrategyById,
  catalogStrategyLabel,
  timeframeNote,
  timeframeToYahooInterval,
} from '@/lib/strategy-catalog';
import { fetchYahooCandles, type YahooInterval } from '@/lib/yahoo-nifty';
import { toYahooSymbol } from '@/lib/chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      strategyId?: string;
      strategyName?: string;
      symbol?: string;
      exchange?: string;
      timeframe?: string;
      fromDate?: string;
      toDate?: string;
      initialCapital?: number;
      stopLossPoints?: number | null;
      targetPoints?: number | null;
    };

    const strategyId = (body.strategyId || 'ema_cross').trim();
    const symbol = (body.symbol || 'NIFTY').trim().toUpperCase();
    const exchange = (body.exchange || 'NSE').trim().toUpperCase();
    const timeframe = body.timeframe || '15m';
    const fromDate = body.fromDate || '2024-01-01';
    const toDate = body.toDate || new Date().toISOString().slice(0, 10);
    const initialCapital = Math.max(1000, Number(body.initialCapital) || 100000);
    const stopLossPoints =
      body.stopLossPoints != null && Number(body.stopLossPoints) > 0
        ? Number(body.stopLossPoints)
        : null;
    const targetPoints =
      body.targetPoints != null && Number(body.targetPoints) > 0
        ? Number(body.targetPoints)
        : null;

    const meta = catalogStrategyById(strategyId);
    if (meta && !meta.executable) {
      return NextResponse.json(
        { ok: false, error: 'This strategy is not executable in the backtest engine yet.' },
        { status: 400 }
      );
    }

    const yahooIv = timeframeToYahooInterval(timeframe) as YahooInterval;
    const noteParts = [
      'Underlying spot simulation (not options premium).',
      timeframeNote(timeframe),
      stopLossPoints != null ? `SL ${stopLossPoints} pts` : null,
      targetPoints != null ? `Tgt ${targetPoints} pts` : null,
    ].filter(Boolean);

    const yahoo = toYahooSymbol({ symbol, exchange });
    const data = await fetchYahooCandles(yahoo, yahooIv, 5000, symbol);

    if (!data.ok || data.candles.length < 40) {
      return NextResponse.json(
        {
          ok: false,
          error: data.error || `Not enough history for ${symbol} ${timeframe}`,
          yahoo,
          interval: yahooIv,
        },
        { status: 502 }
      );
    }

    const result = runHistoricalBacktest(data.candles, {
      strategyId,
      strategyName: body.strategyName || meta?.name || catalogStrategyLabel(strategyId),
      symbol,
      timeframe,
      fromDate,
      toDate,
      initialCapital,
      stopLossPoints,
      targetPoints,
      dataNote: noteParts.join(' · '),
    });

    return NextResponse.json({
      ok: true,
      bars: data.candles.length,
      yahoo,
      interval: yahooIv,
      run: {
        ...result,
        id: crypto.randomUUID(),
        ranAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backtest failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
