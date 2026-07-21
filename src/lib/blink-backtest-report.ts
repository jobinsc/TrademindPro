import type { Candle } from '@/lib/nejoic';
import { blinkStrategyComboLabel } from '@/lib/blink-multi-strategy';
import { blinkStrategyDisplayName, type BlinkStrategyMode } from '@/lib/blink-strategies';
import { blinkTimeframeLabel, defaultBlinkSettings, type BlinkSettings } from '@/lib/blink';
import { blinkUnderlyingLabel, blinkStrikeStep, blinkTradeQty, blinkDefaultBrokerage } from '@/lib/blink-universe';
import {
  runOptionsPremiumBacktest,
  type OptionsBacktestInput,
  type OptionsBacktestTrade,
} from '@/lib/blink-options-backtest';
import type { OptionMoneyness } from '@/lib/option-sim';

function plainStrategyName(label: string): string {
  if (label.includes('HH/LL') || label.toLowerCase().includes('structure')) return 'Price highs & lows';
  if (label.toLowerCase().includes('supertrend')) return 'Supertrend';
  if (label.toLowerCase().includes('bollinger')) return 'Bollinger bands';
  if (label.toLowerCase().includes('macd')) return 'MACD';
  if (label.toLowerCase().includes('stoch')) return 'Stochastic';
  if (label.toLowerCase().includes('previous day')) return 'Prev day high/low';
  if (label.toLowerCase().includes('opening')) return 'Opening range';
  if (label.toLowerCase().includes('cci')) return 'CCI indicator';
  if (label.toLowerCase().includes('ema')) return 'EMA';
  if (label.toLowerCase().includes('rsi')) return 'RSI';
  if (label.toLowerCase().includes('williams')) return 'Williams %R';
  if (label.toLowerCase().includes('engulf')) return 'Engulfing candle';
  if (label.toLowerCase().includes('pin')) return 'Pin bar';
  return label;
}

function plainMoneyness(m: OptionMoneyness): string {
  if (m === 'atm') return 'ATM (strike near Nifty)';
  if (m === 'itm') return 'ITM (safer, costs more)';
  return 'OTM (cheaper, riskier)';
}

function plainTimeWindow(start: string, end: string): string {
  return `${start} to ${end} (Indian time)`;
}

export type BlinkUserBacktestInput = {
  strategyMode: BlinkStrategyMode;
  strategyMode2?: BlinkStrategyMode | 'none' | '';
  strategyCombine?: 'any' | 'all';
  stopLossPoints: number;
  targetPoints: number;
  minConfidence: number;
  maxTradesPerDay: number;
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  maxLotsPerTrade: number;
  lotSize: number;
  brokeragePerLot: number;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  strikeMoneyness: OptionMoneyness;
  chartTimeframe: string;
  lookbackDays: number;
  fromDate: string;
  toDate: string;
  symbol: string;
  exchange: 'NSE';
  /** Full Blink signal settings for multi-strategy backtest */
  blinkSettings: Pick<
    BlinkSettings,
    | 'strategyMode'
    | 'strategyMode2'
    | 'strategyCombine'
    | 'minConfidence'
    | 'emaFast'
    | 'emaSlow'
    | 'rsiPeriod'
    | 'rsiCeMin'
    | 'rsiCeMax'
    | 'rsiPeMin'
    | 'rsiPeMax'
    | 'cciPeriod'
    | 'cciOversold'
    | 'cciOverbought'
    | 'paLeftBars'
    | 'paRightBars'
    | 'strikeMoneyness'
    | 'symbol'
    | 'orbMinutes'
    | 'paLessonFocus'
  >;
};

export type BlinkDailyReportRow = {
  date: string;
  dayLabel: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  summary: string;
};

export type BlinkUserBacktestReport = {
  tested: {
    strategyLabel: string;
    symbol: string;
    symbolLabel: string;
    strategyMode: BlinkStrategyMode;
    timeframe: string;
    timeframeLabel: string;
    tradeWindow: string;
    strike: string;
    stopLoss: number;
    target: number;
    maxTradesPerDay: number;
    lots: number;
    fromDate: string;
    toDate: string;
    daysTested: number;
  };
  totals: {
    netPnl: number;
    totalTrades: number;
    winRate: number;
    greenDays: number;
    redDays: number;
    flatDays: number;
    avgPnlPerDay: number;
    bestDay: { date: string; pnl: number } | null;
    worstDay: { date: string; pnl: number } | null;
  };
  plainHeadline: string;
  plainBullets: string[];
  dailyRows: BlinkDailyReportRow[];
};

export function pickBlinkBacktestSettings(
  source: Partial<BlinkSettings> & { strategyMode: BlinkStrategyMode }
): OptionsBacktestInput['blinkSettings'] {
  const s = { ...defaultBlinkSettings(), ...source };
  return {
    strategyMode: s.strategyMode,
    strategyMode2: s.strategyMode2 ?? 'none',
    strategyCombine: s.strategyCombine ?? 'all',
    minConfidence: s.minConfidence,
    emaFast: s.emaFast,
    emaSlow: s.emaSlow,
    rsiPeriod: s.rsiPeriod,
    rsiCeMin: s.rsiCeMin,
    rsiCeMax: s.rsiCeMax,
    rsiPeMin: s.rsiPeMin,
    rsiPeMax: s.rsiPeMax,
    cciPeriod: s.cciPeriod,
    cciOversold: s.cciOversold,
    cciOverbought: s.cciOverbought,
    paLeftBars: s.paLeftBars,
    paRightBars: s.paRightBars,
    strikeMoneyness: s.strikeMoneyness,
    symbol: s.symbol || 'NIFTY',
    orbMinutes: s.orbMinutes ?? 5,
    paLessonFocus: s.paLessonFocus ?? 'all',
  };
}

export function blinkStrategyLabel(mode: BlinkStrategyMode): string {
  return blinkStrategyDisplayName(mode);
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function daySummary(trades: number, netPnl: number): string {
  if (trades === 0) return 'No trades — strategy did not fire or limits blocked entries.';
  if (netPnl > 0) return `Good day — you would have made about ₹${Math.round(netPnl)}.`;
  if (netPnl < 0) return `Loss day — you would have lost about ₹${Math.round(Math.abs(netPnl))}.`;
  return 'Break-even day — wins and losses cancelled out.';
}

export function buildDailyRows(
  trades: OptionsBacktestTrade[],
  fromDate: string,
  toDate: string
): BlinkDailyReportRow[] {
  const byDay = new Map<string, OptionsBacktestTrade[]>();
  for (const t of trades) {
    const d = t.exitAt.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(t);
  }

  const rows: BlinkDailyReportRow[] = [];
  const start = new Date(`${fromDate}T12:00:00`);
  const end = new Date(`${toDate}T12:00:00`);

  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const dow = cur.getDay();
    if (dow === 0 || dow === 6) continue;
    const date = cur.toISOString().slice(0, 10);
    const dayTrades = byDay.get(date) ?? [];
    const wins = dayTrades.filter((t) => t.pnl > 0).length;
    const losses = dayTrades.filter((t) => t.pnl <= 0).length;
    const netPnl = Math.round(dayTrades.reduce((s, t) => s + t.pnl, 0));
    rows.push({
      date,
      dayLabel: formatDayLabel(date),
      trades: dayTrades.length,
      wins,
      losses,
      netPnl,
      summary: daySummary(dayTrades.length, netPnl),
    });
  }

  return rows;
}

export function runUserBlinkBacktest(
  candles: Candle[],
  input: BlinkUserBacktestInput
): BlinkUserBacktestReport {
  const strategyLabel = blinkStrategyComboLabel({
    strategyMode: input.strategyMode,
    strategyMode2: input.strategyMode2 ?? 'none',
    strategyCombine: input.strategyCombine ?? 'all',
  });

  const symbol = input.symbol || input.blinkSettings.symbol || 'NIFTY';
  const symbolLabel = blinkUnderlyingLabel(symbol);

  const run = runOptionsPremiumBacktest(candles, {
    symbol,
    strikeStep: blinkStrikeStep(symbol),
    blinkSettings: input.blinkSettings,
    fromDate: input.fromDate,
    toDate: input.toDate,
    stopLossPremium: input.stopLossPoints,
    targetPremium: input.targetPoints,
    lots: input.maxLotsPerTrade,
    lotSize: input.lotSize,
    brokeragePerLot: input.brokeragePerLot,
    initialCapital: 100_000,
    strikeMoneyness: input.strikeMoneyness,
    tradeWindowStart: input.tradeWindowStart,
    tradeWindowEnd: input.tradeWindowEnd,
    minConfidence: input.minConfidence,
    maxTradesPerDay: input.maxTradesPerDay,
    dailyMaxLoss: input.dailyMaxLoss,
    dailyProfitTarget: input.dailyProfitTarget,
  });

  const dailyRows = buildDailyRows(run.trades, input.fromDate, input.toDate);
  const greenDays = dailyRows.filter((r) => r.netPnl > 0).length;
  const redDays = dailyRows.filter((r) => r.netPnl < 0).length;
  const flatDays = dailyRows.filter((r) => r.trades === 0).length;
  const avgPnlPerDay =
    dailyRows.length > 0
      ? Math.round(dailyRows.reduce((s, r) => s + r.netPnl, 0) / dailyRows.length)
      : 0;

  const tradedDays = dailyRows.filter((r) => r.trades > 0);
  const bestDay =
    tradedDays.length > 0
      ? tradedDays.reduce((a, b) => (b.netPnl > a.netPnl ? b : a))
      : null;
  const worstDay =
    tradedDays.length > 0
      ? tradedDays.reduce((a, b) => (b.netPnl < a.netPnl ? b : a))
      : null;

  const tfLabel = blinkTimeframeLabel(input.chartTimeframe);
  const madeMoney = run.netPnl > 0;

  const plainHeadline = madeMoney
    ? `With your exact settings, the backtest made ₹${Math.round(run.netPnl)} over ${dailyRows.length} trading days (~₹${avgPnlPerDay}/day on average).`
    : run.netPnl < 0
      ? `With your exact settings, the backtest lost ₹${Math.round(Math.abs(run.netPnl))} over ${dailyRows.length} trading days.`
      : `With your exact settings, the backtest broke even over ${dailyRows.length} trading days.`;

  const qty = blinkTradeQty(symbol, input.maxLotsPerTrade);
  const brok = input.brokeragePerLot;
  const maxLossPerTrade = Math.round(input.stopLossPoints * qty + brok * input.maxLotsPerTrade);

  const plainBullets = [
    `Underlying: ${symbolLabel} (${symbol}).`,
    `Strategy tested: ${strategyLabel} on ${tfLabel} charts.`,
    `Trade only between ${plainTimeWindow(input.tradeWindowStart, input.tradeWindowEnd)}.`,
    `Qty ${qty} units · Stop ${input.stopLossPoints} premium pts (≈ ₹${input.stopLossPoints * qty} loss) + ₹${brok} brokerage per trade → worst case ~₹${maxLossPerTrade}/trade.`,
    `Target ${input.targetPoints} premium pts · ${input.maxLotsPerTrade} lot(s) · max ${input.maxTradesPerDay} trades/day.`,
    `Total ${run.totalTrades} trades · ${Math.round(run.winRate)}% winners · max ${input.maxTradesPerDay} trades allowed per day.`,
    `${greenDays} profitable days, ${redDays} loss days, ${flatDays} days with no trades.`,
    bestDay
      ? `Best day: ${bestDay.dayLabel} (+₹${Math.round(bestDay.netPnl)}, ${bestDay.trades} trades).`
      : 'No trades were taken in this period.',
    worstDay && worstDay.netPnl < 0
      ? `Worst day: ${worstDay.dayLabel} (−₹${Math.round(Math.abs(worstDay.netPnl))}, ${worstDay.trades} trades).`
      : null,
    `This simulates option premium moves — not exact historical option prices.`,
  ].filter((x): x is string => Boolean(x));

  return {
    tested: {
      strategyLabel,
      symbol,
      symbolLabel,
      strategyMode: input.strategyMode,
      timeframe: input.chartTimeframe,
      timeframeLabel: tfLabel,
      tradeWindow: plainTimeWindow(input.tradeWindowStart, input.tradeWindowEnd),
      strike: plainMoneyness(input.strikeMoneyness),
      stopLoss: input.stopLossPoints,
      target: input.targetPoints,
      maxTradesPerDay: input.maxTradesPerDay,
      lots: input.maxLotsPerTrade,
      fromDate: input.fromDate,
      toDate: input.toDate,
      daysTested: dailyRows.length,
    },
    totals: {
      netPnl: Math.round(run.netPnl),
      totalTrades: run.totalTrades,
      winRate: Math.round(run.winRate),
      greenDays,
      redDays,
      flatDays,
      avgPnlPerDay,
      bestDay: bestDay ? { date: bestDay.date, pnl: bestDay.netPnl } : null,
      worstDay: worstDay ? { date: worstDay.date, pnl: worstDay.netPnl } : null,
    },
    plainHeadline,
    plainBullets,
    dailyRows,
  };
}
