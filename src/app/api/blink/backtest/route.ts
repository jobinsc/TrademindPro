import { NextRequest, NextResponse } from 'next/server';
import type { BlinkStrategyMode } from '@/lib/blink-strategies';
import { isBlinkStrategyMode } from '@/lib/blink-strategies';
import { BLINK_TIMEFRAMES } from '@/lib/blink';
import { blinkUnderlying, blinkDefaultLotSize, blinkDefaultBrokerage } from '@/lib/blink-universe';
import { blinkLabEffectiveDays } from '@/lib/blink-lab';
import {
  pickBlinkBacktestSettings,
  runUserBlinkBacktest,
  type BlinkUserBacktestInput,
} from '@/lib/blink-backtest-report';
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

  const rawSecond = String(body.strategyMode2 ?? 'none');
  const strategyMode2: BlinkStrategyMode | 'none' =
    rawSecond === 'none' || rawSecond === ''
      ? 'none'
      : isBlinkStrategyMode(rawSecond)
        ? (rawSecond as BlinkStrategyMode)
        : 'none';

  const strategyCombine = body.strategyCombine === 'any' ? 'any' : 'all';

  const timeframe = BLINK_TIMEFRAMES.some((t) => t.id === body.chartTimeframe)
    ? String(body.chartTimeframe)
    : BLINK_TIMEFRAMES.some((t) => t.id === body.timeframe)
      ? String(body.timeframe)
      : '5m';

  const lookbackDays = Math.max(7, Math.min(60, Number(body.lookbackDays) || 30));
  const effectiveDays = blinkLabEffectiveDays(timeframe, lookbackDays);

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - effectiveDays * 86400000).toISOString().slice(0, 10);

  const minConfidence = Math.max(50, Math.min(95, Number(body.minConfidence) || 68));
  const strikeMoneyness: OptionMoneyness =
    body.strikeMoneyness === 'itm' || body.strikeMoneyness === 'otm'
      ? (body.strikeMoneyness as OptionMoneyness)
      : 'atm';

  const rawSymbol = String(body.symbol || 'NIFTY').trim().toUpperCase();
  const meta = blinkUnderlying(rawSymbol);
  const symbol = meta.symbol;
  const lotSize = Math.max(1, Number(body.lotSize) || blinkDefaultLotSize(symbol));
  const brokDefault = blinkDefaultBrokerage(symbol, lotSize);
  const rawBrok = Number(body.brokeragePerLot);
  // Ignore leftover Nifty ₹175 when testing qty-1 stocks
  const brokeragePerLot =
    meta.kind === 'stock' && (Number.isNaN(rawBrok) || rawBrok >= 100)
      ? brokDefault
      : Math.max(0, rawBrok || brokDefault);

  const input: BlinkUserBacktestInput = {
    strategyMode,
    strategyMode2,
    strategyCombine,
    stopLossPoints: Math.max(1, Number(body.stopLossPoints) || 8),
    targetPoints: Math.max(1, Number(body.targetPoints) || 5),
    minConfidence,
    maxTradesPerDay: Math.max(1, Math.min(10, Number(body.maxTradesPerDay) || 3)),
    dailyProfitTarget: Math.max(100, Number(body.dailyProfitTarget) || 2500),
    dailyMaxLoss: Math.max(100, Number(body.dailyMaxLoss) || 1200),
    maxLotsPerTrade: Math.max(1, Math.min(3, Number(body.maxLotsPerTrade) || 1)),
    lotSize,
    brokeragePerLot,
    tradeWindowStart: String(body.tradeWindowStart || '09:20').slice(0, 5),
    tradeWindowEnd: String(body.tradeWindowEnd || '15:15').slice(0, 5),
    strikeMoneyness,
    chartTimeframe: timeframe,
    lookbackDays: effectiveDays,
    fromDate,
    toDate,
    symbol,
    exchange: 'NSE',
    blinkSettings: pickBlinkBacktestSettings({
      strategyMode,
      strategyMode2,
      strategyCombine,
      minConfidence,
      strikeMoneyness,
      symbol,
      emaFast: Number(body.emaFast) || undefined,
      emaSlow: Number(body.emaSlow) || undefined,
      rsiPeriod: Number(body.rsiPeriod) || undefined,
      cciPeriod: Number(body.cciPeriod) || undefined,
      cciOversold: Number(body.cciOversold) || undefined,
      cciOverbought: Number(body.cciOverbought) || undefined,
      paLeftBars: Number(body.paLeftBars) || undefined,
      paRightBars: Number(body.paRightBars) || undefined,
      orbMinutes: Number(body.orbMinutes) || undefined,
    }),
  };

  const yahoo = toYahooSymbol({ symbol, exchange: 'NSE' });
  const yahooIv = timeframeToYahooInterval(timeframe);
  const data = await fetchYahooCandles(yahoo, yahooIv, 5000, symbol);

  if (!data.ok || data.candles.length < 40) {
    return NextResponse.json(
      {
        ok: false,
        error: data.error || `Not enough ${symbol} ${timeframe} history for backtest`,
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
