import type { Candle } from '@/lib/nejoic';
import type { BlinkStrategyMode } from '@/lib/blink';
import { blinkTimeframeLabel } from '@/lib/blink';
import { timeframeNote } from '@/lib/strategy-catalog';
import { runOptionsPremiumBacktest } from '@/lib/blink-options-backtest';
import type { OptionMoneyness } from '@/lib/option-sim';
import { TRADE_WINDOW_PRESETS } from '@/lib/option-sim';

export type BlinkPlainReport = {
  headline: string;
  verdict: 'good' | 'ok' | 'weak';
  bullets: string[];
  settingsLines: { label: string; value: string }[];
  tableNote: string;
};

export function plainStrategyName(label: string): string {
  if (label.includes('HH/LL')) return 'Price highs & lows';
  if (label.toLowerCase().includes('cci')) return 'CCI indicator';
  if (label.toLowerCase().includes('ema')) return 'EMA crossover';
  return label;
}

export function plainMoneyness(m: OptionMoneyness): string {
  if (m === 'atm') return 'ATM (strike near Nifty)';
  if (m === 'itm') return 'ITM (safer, costs more)';
  return 'OTM (cheaper, riskier)';
}

export function plainTimeWindow(start: string, end: string): string {
  return `${start} to ${end} (Indian time)`;
}

export type BlinkLabGoals = {
  maxTradesPerDay: number;
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  maxLotsPerTrade: number;
  lookbackDays: number;
  lotSize: number;
  brokeragePerLot: number;
  /** Nifty candle interval for backtest, e.g. 1m, 5m, 15m */
  timeframe: string;
  /** IST trade window */
  tradeWindowStart: string;
  tradeWindowEnd: string;
  /** ATM / ITM / OTM strike vs spot */
  strikeMoneyness: OptionMoneyness;
  /** When true, test every session preset and pick best time in results */
  scanAllWindows?: boolean;
  /** When true, test ATM + ITM + OTM and pick best strike type */
  scanAllMoneyness?: boolean;
};

export type BlinkLabStrategy = {
  id: string;
  blinkMode: BlinkStrategyMode;
  label: string;
};

export const BLINK_LAB_STRATEGIES: BlinkLabStrategy[] = [
  { id: 'hhll_lonesome', blinkMode: 'cci_hhll_combo', label: 'HH/LL Lonesome (+ live CCI filter)' },
  { id: 'cci_zero', blinkMode: 'cci_zero', label: 'CCI zero-line' },
  { id: 'ema_cross', blinkMode: 'ema_rsi', label: 'EMA 9/21 cross' },
];

/** Premium-point grids (option simulation) */
const PREM_SL_GRID = [4, 6, 8, 10, 12];
const PREM_TG_GRID = [5, 6, 8, 10, 12, 15];

export type BlinkLabRow = {
  strategyId: string;
  strategyLabel: string;
  blinkMode: BlinkStrategyMode;
  sl: number;
  tg: number;
  netPnl: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  tradesPerDay: number;
  score: number;
  premiumSl: number;
  premiumTg: number;
  timeWindow: string;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  moneyness: OptionMoneyness;
};

export type BlinkTradingPlan = {
  summary: string;
  narrative: string;
  recommended: {
    strategyMode: BlinkStrategyMode;
    strategyLabel: string;
    stopLossPoints: number;
    targetPoints: number;
    maxTradesPerDay: number;
    dailyProfitTarget: number;
    dailyMaxLoss: number;
    minConfidence: number;
    maxLotsPerTrade: number;
    strikeMoneyness: OptionMoneyness;
    tradeWindowStart: string;
    tradeWindowEnd: string;
    chartTimeframe: string;
  };
  math: {
    tradesPerDay: number;
    netPerMonth: number;
    profitFactor: number;
    winRate: number;
    rupeePerWinEstimate: number;
    rupeePerLossEstimate: number;
    tradesNeededForDailyTarget: number;
    note: string;
  };
  topCombos: BlinkLabRow[];
  steps: string[];
  plainReport: BlinkPlainReport;
};

export function defaultBlinkLabGoals(): BlinkLabGoals {
  return {
    maxTradesPerDay: 3,
    dailyProfitTarget: 2500,
    dailyMaxLoss: 1200,
    maxLotsPerTrade: 2,
    lookbackDays: 30,
    lotSize: 65,
    brokeragePerLot: 175,
    tradeWindowStart: '09:20',
    tradeWindowEnd: '15:15',
    strikeMoneyness: 'atm',
    timeframe: '1m',
  };
}

/** Yahoo history limits — 1m only has ~7 days */
export function blinkLabEffectiveDays(timeframe: string, requested: number): number {
  if (timeframe === '1m') return Math.min(requested, 7);
  if (timeframe === '2m' || timeframe === '3m') return Math.min(requested, 10);
  return requested;
}

export function blinkLabTimeframeNote(timeframe: string): string | undefined {
  if (timeframe === '1m') return '1-minute data is limited to about 7 days on Yahoo.';
  return timeframeNote(timeframe);
}

export { TRADE_WINDOW_PRESETS };

function scoreRow(
  row: Omit<BlinkLabRow, 'score'>,
  goals: BlinkLabGoals
): number {
  const { tradesPerDay, profitFactor, netPnl } = row;
  if (profitFactor < 1 || netPnl <= 0) return netPnl * 0.01;

  const tradeGap = Math.abs(tradesPerDay - goals.maxTradesPerDay);
  const tradeFit = 1 / (1 + tradeGap * 0.35);
  const overtradePenalty = tradesPerDay > goals.maxTradesPerDay * 2 ? 0.4 : 1;
  const pfBoost = Math.min(profitFactor, 2.5);
  const pnlBoost = Math.log10(Math.max(netPnl, 1) + 1);

  return pfBoost * pnlBoost * tradeFit * overtradePenalty * 100;
}

function estimateRupeeMove(
  premiumPts: number,
  lots: number,
  lotSize: number,
  brokerage: number
): number {
  return premiumPts * lotSize * lots - brokerage * lots;
}

function labWindows(goals: BlinkLabGoals) {
  if (goals.scanAllWindows) {
    return TRADE_WINDOW_PRESETS.map((p) => ({
      start: p.start,
      end: p.end,
      label: `${p.start}–${p.end} IST`,
    }));
  }
  return [
    {
      start: goals.tradeWindowStart,
      end: goals.tradeWindowEnd,
      label: `${goals.tradeWindowStart}–${goals.tradeWindowEnd} IST`,
    },
  ];
}

function labMoneyness(goals: BlinkLabGoals): OptionMoneyness[] {
  if (goals.scanAllMoneyness) return ['atm', 'itm', 'otm'];
  return [goals.strikeMoneyness];
}

export function runBlinkLabPermutations(
  candles: Candle[],
  goals: BlinkLabGoals,
  fromDate: string,
  toDate: string
): BlinkLabRow[] {
  const rows: BlinkLabRow[] = [];
  const days = Math.max(1, goals.lookbackDays);
  const windows = labWindows(goals);
  const moneynessList = labMoneyness(goals);

  for (const win of windows) {
    for (const money of moneynessList) {
      for (const strat of BLINK_LAB_STRATEGIES) {
        for (const sl of PREM_SL_GRID) {
          for (const tg of PREM_TG_GRID) {
            if (tg < sl * 0.75) continue;

            const run = runOptionsPremiumBacktest(candles, {
              strategyId: strat.id,
              fromDate,
              toDate,
              stopLossPremium: sl,
              targetPremium: tg,
              lots: goals.maxLotsPerTrade,
              lotSize: goals.lotSize,
              brokeragePerLot: goals.brokeragePerLot,
              initialCapital: 100_000,
              strikeMoneyness: money,
              tradeWindowStart: win.start,
              tradeWindowEnd: win.end,
            });

            const tradesPerDay = run.totalTrades / days;
            const base = {
              strategyId: strat.id,
              strategyLabel: strat.label,
              blinkMode: strat.blinkMode,
              sl,
              tg,
              netPnl: run.netPnl,
              winRate: run.winRate,
              profitFactor: run.profitFactor,
              trades: run.totalTrades,
              tradesPerDay: Math.round(tradesPerDay * 10) / 10,
              premiumSl: sl,
              premiumTg: tg,
              timeWindow: win.label,
              tradeWindowStart: win.start,
              tradeWindowEnd: win.end,
              moneyness: money,
            };
            rows.push({
              ...base,
              score: scoreRow(base, goals),
            });
          }
        }
      }
    }
  }

  return rows.sort((a, b) => b.score - a.score);
}

export function buildBlinkTradingPlan(
  ranked: BlinkLabRow[],
  goals: BlinkLabGoals
): BlinkTradingPlan {
  const profitable = ranked.filter((r) => r.profitFactor >= 1 && r.netPnl > 0);
  const pool = profitable.length ? profitable : ranked;
  const best = pool[0];
  const closeToTradeGoal = pool.find(
    (r) =>
      r.profitFactor >= 1 &&
      r.netPnl > 0 &&
      r.tradesPerDay <= goals.maxTradesPerDay * 1.5
  );
  const pick = closeToTradeGoal || best;

  const effectiveDays = blinkLabEffectiveDays(goals.timeframe, goals.lookbackDays);
  const tfLabel = blinkTimeframeLabel(goals.timeframe);
  const tfNote = blinkLabTimeframeNote(goals.timeframe);

  const premiumSl = pick.premiumSl;
  const premiumTg = pick.premiumTg;
  const lots = goals.maxLotsPerTrade;
  const rupeeWin = estimateRupeeMove(premiumTg, lots, goals.lotSize, goals.brokeragePerLot);
  const rupeeLoss = estimateRupeeMove(premiumSl, lots, goals.lotSize, goals.brokeragePerLot) * -1;
  const tradesForTarget = rupeeWin > 0 ? Math.ceil(goals.dailyProfitTarget / rupeeWin) : 99;

  const minConf =
    pick.tradesPerDay > goals.maxTradesPerDay * 2
      ? 82
      : pick.tradesPerDay > goals.maxTradesPerDay
        ? 78
        : 72;

  const summary =
    profitable.length > 0
      ? `Best: ${pick.strategyLabel} · ${pick.moneyness.toUpperCase()} · ${pick.timeWindow} · SL ${premiumSl} / Tgt ${premiumTg} premium · ~${pick.tradesPerDay} trades/day.`
      : `No profitable combo — try ITM/ATM, shorter time window, or Tgt ≥ SL.`;

  const narrative = [
    `Simulated **real option premium** (delta model) on Nifty 1m over ${goals.lookbackDays} days.`,
    `Strike: **${pick.moneyness.toUpperCase()}** · Session: **${pick.timeWindow}**`,
    `Strategy **${pick.strategyLabel}** · premium SL **${premiumSl}** / Tgt **${premiumTg}** · **${lots} lot(s)**.`,
    `One full target ≈ **₹${Math.round(rupeeWin)}** net; one full stop ≈ **₹${Math.round(Math.abs(rupeeLoss))}**.`,
    `For **₹${goals.dailyProfitTarget}/day** need ~**${Math.min(tradesForTarget, goals.maxTradesPerDay)}** clean win(s) (no losses).`,
    pick.tradesPerDay > goals.maxTradesPerDay
      ? `Backtest **${pick.tradesPerDay} trades/day** — narrow time window or raise min confidence to **${minConf}%**.`
      : `Trade count is near your ${goals.maxTradesPerDay}/day cap.`,
  ].join('\n');

  const steps = [
    `Signal engine → ${pick.blinkMode === 'cci_hhll_combo' ? 'CCI + HH/LL' : pick.strategyLabel}.`,
    `Strike → ${pick.moneyness.toUpperCase()} · Time → ${pick.tradeWindowStart}–${pick.tradeWindowEnd} IST.`,
    `Premium SL ${premiumSl} / Tgt ${premiumTg} · max ${goals.maxTradesPerDay} trades/day.`,
    `Daily target ₹${goals.dailyProfitTarget}, max loss ₹${goals.dailyMaxLoss}.`,
    `Paper trade with Upstox LTP — simulation is approximate.`,
  ];

  const madeMoney = pick.profitFactor >= 1 && pick.netPnl > 0;
  const monthly = Math.round(pick.netPnl);
  const dailyAvg = Math.round(pick.netPnl / Math.max(1, effectiveDays));
  const winPct = Math.round(pick.winRate);
  const plainHeadline = madeMoney
    ? `On paper, this setup made about ₹${monthly} in ${effectiveDays} days (~₹${dailyAvg}/day) on ${tfLabel} charts.`
    : `Nothing profitable was found in the last ${effectiveDays} days (${tfLabel} charts) with these goals. Try 5m/15m or fewer trades/day.`;

  const plainBullets = madeMoney
    ? [
        `Tested ${effectiveDays} days of Nifty ${tfLabel} data (option prices simulated).`,
        ...(tfNote ? [tfNote] : []),
        `About ${pick.tradesPerDay} trades per day on average (${pick.trades} trades total).`,
        `${winPct}% of trades were winners.`,
        `When you win fully, you keep about ₹${Math.round(rupeeWin)}. When you lose fully, you lose about ₹${Math.round(Math.abs(rupeeLoss))}.`,
        `To reach ₹${goals.dailyProfitTarget}/day you need roughly ${Math.min(tradesForTarget, goals.maxTradesPerDay)} winning trade(s) with no losses — that's the ideal case.`,
        pick.tradesPerDay > goals.maxTradesPerDay
          ? `This setup trades more often (${pick.tradesPerDay}/day) than your ${goals.maxTradesPerDay}/day limit — consider a shorter time window.`
          : `Trade count fits your ${goals.maxTradesPerDay} trades/day limit.`,
      ]
    : [
        `Tested ${effectiveDays} days on ${tfLabel} charts — no combo made consistent profit.`,
        ...(tfNote ? [tfNote] : []),
        `Try: strike ATM or ITM, target points ≥ stop-loss points, or trade only morning session.`,
        `This is a simulation — real live prices from Upstox may differ.`,
      ];

  const plainReport: BlinkPlainReport = {
    headline: plainHeadline,
    verdict: madeMoney ? (pick.profitFactor >= 1.15 ? 'good' : 'ok') : 'weak',
    bullets: plainBullets,
    settingsLines: [
      { label: 'Chart interval', value: tfLabel },
      { label: 'Strategy', value: plainStrategyName(pick.strategyLabel) },
      { label: 'Trade between', value: plainTimeWindow(pick.tradeWindowStart, pick.tradeWindowEnd) },
      { label: 'Option strike', value: plainMoneyness(pick.moneyness) },
      { label: 'Stop loss', value: `${premiumSl} points on option premium` },
      { label: 'Target', value: `${premiumTg} points on option premium` },
      { label: 'Max trades/day', value: String(goals.maxTradesPerDay) },
      { label: 'Daily profit goal', value: `₹${goals.dailyProfitTarget}` },
      { label: 'Max daily loss', value: `₹${goals.dailyMaxLoss}` },
    ],
    tableNote: 'Top setups from the backtest — Net = total profit/loss in ₹ over the test period.',
  };

  return {
    summary,
    narrative,
    recommended: {
      strategyMode: pick.blinkMode,
      strategyLabel: pick.strategyLabel,
      stopLossPoints: premiumSl,
      targetPoints: premiumTg,
      maxTradesPerDay: goals.maxTradesPerDay,
      dailyProfitTarget: goals.dailyProfitTarget,
      dailyMaxLoss: goals.dailyMaxLoss,
      minConfidence: minConf,
      maxLotsPerTrade: lots,
      strikeMoneyness: pick.moneyness,
      tradeWindowStart: pick.tradeWindowStart,
      tradeWindowEnd: pick.tradeWindowEnd,
      chartTimeframe: goals.timeframe,
    },
    math: {
      tradesPerDay: pick.tradesPerDay,
      netPerMonth: Math.round(pick.netPnl),
      profitFactor: pick.profitFactor,
      winRate: pick.winRate,
      rupeePerWinEstimate: Math.round(rupeeWin),
      rupeePerLossEstimate: Math.round(rupeeLoss),
      tradesNeededForDailyTarget: Math.min(tradesForTarget, goals.maxTradesPerDay),
      note: 'Option premium simulation (delta model) + brokerage. Not historical option chain data.',
    },
    topCombos: ranked.slice(0, 8),
    steps,
    plainReport,
  };
}

export async function enhancePlanWithAi(
  plan: BlinkTradingPlan,
  goals: BlinkLabGoals
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 550,
        messages: [
          {
            role: 'system',
            content:
              'You are Blink Lab, a Nifty options scalping coach. Write a short trading plan. Mention time window, ATM/ITM/OTM, premium SL/Tgt. Paper mode only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              goals,
              plan: plan.recommended,
              math: plan.math,
              top3: plan.topCombos.slice(0, 3),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
