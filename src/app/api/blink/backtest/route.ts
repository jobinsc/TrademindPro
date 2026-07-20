import { NextRequest, NextResponse } from 'next/server';
import type { BlinkStrategyMode } from '@/lib/blink-strategies';
import { isBlinkStrategyMode } from '@/lib/blink-strategies';
import { BLINK_TIMEFRAMES } from '@/lib/blink';
import { blinkLabEffectiveDays } from '@/lib/blink-lab';
import { runUserBlinkBacktest, type BlinkUserBacktestInput } from '@/lib/blink-backtest-report';
import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import { toYahooSymbol } from '@/lib/chart';
import { timeframeToYahooInterval } from '@/lib/strategy-catalog';
import type { OptionMoneyness } from '@/lib/option-sim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const strategyMode: BlinkStrategyMode = isBlinkStrategyMode(String(body.strategyMode))
    ? (body.strategyMode as BlinkStrategyMode)
    : 'cci_hhll_combo';

  const timeframe = BLINK_TIMEFRAMES.some((t) => t.id === body.chartTimeframe)
    ? String(body.chartTimeframe)
    : BLINK_TIMEFRAMES.some((t) => t.id === body.timeframe)
      ? String(body.timeframe)
      : '5m';

  const lookbackDays = Math.max(7, Math.min(60, Number(body.lookbackDays) || 30));
  const effectiveDays = blinkLabEffectiveDays(timeframe, lookbackDays);

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - effectiveDays * 86400000).toISOString().slice(0, 10);

  const input: BlinkUserBacktestInput = {
    strategyMode,
    stopLossPoints: Math.max(1, Number(body.stopLossPoints) || 8),
    targetPoints: Math.max(1, Number(body.targetPoints) || 5),
    minConfidence: Math.max(50, Math.min(95, Number(body.minConfidence) || 68)),
    maxTradesPerDay: Math.max(1, Math.min(10, Number(body.maxTradesPerDay) || 3)),
    dailyProfitTarget: Math.max(100, Number(body.dailyProfitTarget) || 2500),
    dailyMaxLoss: Math.max(100, Number(body.dailyMaxLoss) || 1200),
    maxLotsPerTrade: Math.max(1, Math.min(3, Number(body.maxLotsPerTrade) || 1)),
    lotSize: Math.max(1, Number(body.lotSize) || 65),
    brokeragePerLot: Math.max(0, Number(body.brokeragePerLot) || 175),
    tradeWindowStart: String(body.tradeWindowStart || '09:20').slice(0, 5),
    tradeWindowEnd: String(body.tradeWindowEnd || '15:15').slice(0, 5),
    strikeMoneyness:
      body.strikeMoneyness === 'itm' || body.strikeMoneyness === 'otm'
        ? (body.strikeMoneyness as OptionMoneyness)
        : 'atm',
    chartTimeframe: timeframe,
    lookbackDays: effectiveDays,
    fromDate,
    toDate,
  };

  const yahoo = toYahooSymbol({ symbol: 'NIFTY', exchange: 'NSE' });
  const yahooIv = timeframeToYahooInterval(timeframe);
  const data = await fetchYahooCandles(yahoo, yahooIv, 5000, 'NIFTY');

  if (!data.ok || data.candles.length < 40) {
    return NextResponse.json(
      {
        ok: false,
        error: data.error || `Not enough Nifty ${timeframe} history for backtest`,
      },
      { status: 502 }
    );
  }

  const report = runUserBlinkBacktest(data.candles, input);

  return NextResponse.json({
    ok: true,
    bars: data.candles.length,
    fromDate,
    toDate,
    effectiveDays,
    timeframe,
    report,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    description: 'POST your Blink settings → daily profit/loss report (no auto-scan)',
  });
}
