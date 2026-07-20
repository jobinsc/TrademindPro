import type { Candle } from '@/lib/nejoic';
import { catalogStrategyLabel, type CatalogStrategyId } from '@/lib/strategy-catalog';
import { lastAtr, runCatalogSignal } from '@/lib/backtest-signals';

export type BacktestTrade = {
  entryAt: string;
  exitAt: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnl: number;
  setup: string;
};

export type BacktestRun = {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  initialCapital: number;
  ranAt: string;
  totalTrades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpe: number;
  equityCurve: { day: number; equity: number }[];
  trades?: BacktestTrade[];
  dataNote?: string;
};

export type BacktestInput = {
  strategyId: string;
  strategyName?: string;
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  initialCapital: number;
  atrMult?: number;
  rewardRisk?: number;
  /** Fixed stop distance in points (overrides ATR when set) */
  stopLossPoints?: number | null;
  /** Fixed target distance in points (overrides RR when set) */
  targetPoints?: number | null;
  dataNote?: string;
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/** Real historical walk on spot candles (underlying, not options premium). */
export function runHistoricalBacktest(
  candles: Candle[],
  input: BacktestInput
): Omit<BacktestRun, 'id' | 'ranAt'> {
  const capital = Math.max(1000, input.initialCapital || 100000);
  const atrMult = input.atrMult ?? 1.2;
  const rr = input.rewardRisk ?? 1.5;
  const minConf = 60;

  const filtered = candles.filter((c) => {
    const d = dayKey(c.t);
    return d >= input.fromDate && d <= input.toDate;
  });
  const series = filtered.length >= 30 ? filtered : candles;

  type Pos = {
    side: 'LONG' | 'SHORT';
    entry: number;
    stop: number;
    target: number;
    entryAt: string;
    setup: string;
    qty: number;
  };

  let cash = capital;
  let pos: Pos | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: { day: number; equity: number }[] = [];
  let peak = capital;
  let maxDrawdown = 0;
  const returns: number[] = [];

  const markEquity = (barIdx: number, price: number) => {
    let eq = cash;
    if (pos) {
      const unreal =
        pos.side === 'LONG'
          ? (price - pos.entry) * pos.qty
          : (pos.entry - price) * pos.qty;
      eq += unreal;
    }
    equityCurve.push({ day: barIdx, equity: Math.round(eq) });
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDrawdown) maxDrawdown = dd;
    return eq;
  };

  const closePos = (exit: number, exitAt: string) => {
    if (!pos) return;
    const pnl =
      pos.side === 'LONG' ? (exit - pos.entry) * pos.qty : (pos.entry - exit) * pos.qty;
    cash += pnl;
    returns.push(pnl / capital);
    trades.push({
      entryAt: pos.entryAt,
      exitAt,
      side: pos.side,
      entry: pos.entry,
      exit,
      pnl: Math.round(pnl * 100) / 100,
      setup: pos.setup,
    });
    pos = null;
  };

  // Warmup then walk
  const start = Math.min(60, Math.max(20, Math.floor(series.length * 0.15)));
  for (let i = start; i < series.length; i++) {
    const window = series.slice(0, i + 1);
    const bar = series[i];
    const atr = lastAtr(window, 14) || bar.close * 0.005;

    // Manage open position
    if (pos) {
      const hitStop =
        pos.side === 'LONG' ? bar.low <= pos.stop : bar.high >= pos.stop;
      const hitTgt =
        pos.side === 'LONG' ? bar.high >= pos.target : bar.low <= pos.target;
      if (hitStop) {
        closePos(pos.stop, bar.t);
      } else if (hitTgt) {
        closePos(pos.target, bar.t);
      } else {
        const sig = runCatalogSignal(input.strategyId as CatalogStrategyId, window);
        if (sig && sig.confidence >= minConf) {
          if (pos.side === 'LONG' && sig.bias === 'PE') closePos(bar.close, bar.t);
          else if (pos.side === 'SHORT' && sig.bias === 'CE') closePos(bar.close, bar.t);
        }
      }
    }

    // New entries
    if (!pos) {
      const sig = runCatalogSignal(input.strategyId as CatalogStrategyId, window);
      if (sig && (sig.bias === 'CE' || sig.bias === 'PE') && sig.confidence >= minConf) {
        const slPts = Number(input.stopLossPoints);
        const tgPts = Number(input.targetPoints);
        const stopDist =
          Number.isFinite(slPts) && slPts > 0
            ? slPts
            : Math.max(atr * atrMult, bar.close * 0.0015);
        const targetDist =
          Number.isFinite(tgPts) && tgPts > 0 ? tgPts : stopDist * rr;
        const riskBudget = capital * 0.01; // 1% risk per trade
        const qty = Math.max(1, Math.floor(riskBudget / stopDist));
        if (sig.bias === 'CE') {
          pos = {
            side: 'LONG',
            entry: bar.close,
            stop: bar.close - stopDist,
            target: bar.close + targetDist,
            entryAt: bar.t,
            setup: sig.setup,
            qty,
          };
        } else {
          pos = {
            side: 'SHORT',
            entry: bar.close,
            stop: bar.close + stopDist,
            target: bar.close - targetDist,
            entryAt: bar.t,
            setup: sig.setup,
            qty,
          };
        }
      }
    }

    markEquity(i - start, bar.close);
  }

  // Force flat at end
  if (pos && series.length) {
    const last = series[series.length - 1];
    closePos(last.close, last.t);
    markEquity(equityCurve.length, last.close);
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = Math.round((cash - capital) * 100) / 100;
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99 : 0;

  // Sharpe from per-trade returns (simple)
  let sharpe = 0;
  if (returns.length > 1) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance) || 1e-9;
    sharpe = Math.round((mean / std) * Math.sqrt(returns.length) * 100) / 100;
  }

  // Ensure some equity points
  if (equityCurve.length === 0) {
    equityCurve.push({ day: 0, equity: capital });
  }

  return {
    strategyId: input.strategyId,
    strategyName: input.strategyName || catalogStrategyLabel(input.strategyId),
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromDate: input.fromDate,
    toDate: input.toDate,
    initialCapital: capital,
    totalTrades: trades.length,
    winRate: Math.round(winRate * 10) / 10,
    netPnl,
    maxDrawdown: Math.round(maxDrawdown),
    profitFactor,
    sharpe,
    equityCurve,
    trades: trades.slice(-80),
    dataNote: input.dataNote,
  };
}

/** @deprecated Demo — kept for type compat; prefer runHistoricalBacktest */
export function runDemoBacktest(input: BacktestInput): Omit<BacktestRun, 'id' | 'ranAt'> {
  return runHistoricalBacktest([], { ...input, dataNote: 'No candles — empty run' });
}
