import { NextRequest, NextResponse } from 'next/server';
import {
  buildBlinkTradingPlan,
  blinkLabEffectiveDays,
  defaultBlinkLabGoals,
  enhancePlanWithAi,
  runBlinkLabPermutations,
  type BlinkLabGoals,
} from '@/lib/blink-lab';
import { BLINK_TIMEFRAMES } from '@/lib/blink';
import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import { toYahooSymbol } from '@/lib/chart';
import { timeframeToYahooInterval } from '@/lib/strategy-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Partial<BlinkLabGoals>;
  try {
    body = (await req.json()) as Partial<BlinkLabGoals>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const goals: BlinkLabGoals = {
    ...defaultBlinkLabGoals(),
    ...body,
    maxTradesPerDay: Math.max(1, Math.min(10, Number(body.maxTradesPerDay) || 3)),
    dailyProfitTarget: Math.max(500, Number(body.dailyProfitTarget) || 2500),
    dailyMaxLoss: Math.max(200, Number(body.dailyMaxLoss) || 1200),
    maxLotsPerTrade: Math.max(1, Math.min(3, Number(body.maxLotsPerTrade) || 2)),
    lookbackDays: Math.max(14, Math.min(60, Number(body.lookbackDays) || 30)),
    tradeWindowStart: String(body.tradeWindowStart || '09:20').slice(0, 5),
    tradeWindowEnd: String(body.tradeWindowEnd || '15:15').slice(0, 5),
    strikeMoneyness:
      body.strikeMoneyness === 'itm' || body.strikeMoneyness === 'otm'
        ? body.strikeMoneyness
        : 'atm',
    scanAllWindows: body.scanAllWindows !== false,
    scanAllMoneyness: body.scanAllMoneyness === true,
    timeframe: BLINK_TIMEFRAMES.some((t) => t.id === body.timeframe)
      ? String(body.timeframe)
      : '1m',
  };

  const effectiveDays = blinkLabEffectiveDays(goals.timeframe, goals.lookbackDays);
  goals.lookbackDays = effectiveDays;

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - effectiveDays * 86400000).toISOString().slice(0, 10);

  const yahoo = toYahooSymbol({ symbol: 'NIFTY', exchange: 'NSE' });
  const yahooIv = timeframeToYahooInterval(goals.timeframe);
  const data = await fetchYahooCandles(yahoo, yahooIv, 5000, 'NIFTY');

  if (!data.ok || data.candles.length < 40) {
    return NextResponse.json(
      {
        ok: false,
        error: data.error || `Not enough Nifty ${goals.timeframe} history for backtest`,
      },
      { status: 502 }
    );
  }

  const ranked = runBlinkLabPermutations(data.candles, goals, fromDate, toDate);
  const plan = buildBlinkTradingPlan(ranked, goals);
  const aiPlan = await enhancePlanWithAi(plan, goals);

  return NextResponse.json({
    ok: true,
    cloudAi: Boolean(process.env.OPENAI_API_KEY?.trim()),
    permutationCount: ranked.length,
    bars: data.candles.length,
    fromDate,
    toDate,
    timeframe: goals.timeframe,
    effectiveDays,
    plan: {
      ...plan,
      aiNarrative: aiPlan,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    cloudAi: Boolean(process.env.OPENAI_API_KEY?.trim()),
    description: 'POST goals → runs SL×Tgt×strategy permutations and returns a trading plan',
  });
}
