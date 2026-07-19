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
};

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Demo backtest — replaced by real historical engine later */
export function runDemoBacktest(input: {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  initialCapital: number;
}): Omit<BacktestRun, 'id' | 'ranAt'> {
  const seed = hash(
    `${input.strategyId}:${input.symbol}:${input.timeframe}:${input.fromDate}:${input.toDate}`
  );
  const totalTrades = 20 + (seed % 40);
  const winRate = 40 + (seed % 35);
  const wins = Math.round((totalTrades * winRate) / 100);
  const losses = totalTrades - wins;
  const avgWin = 800 + (seed % 700);
  const avgLoss = 500 + (seed % 400);
  const netPnl = wins * avgWin - losses * avgLoss;
  const profitFactor =
    losses * avgLoss > 0
      ? Math.round(((wins * avgWin) / (losses * avgLoss)) * 100) / 100
      : 2.5;
  const maxDrawdown = 3000 + (seed % 8000);
  const sharpe = Math.round((0.4 + (seed % 20) / 10) * 100) / 100;

  let equity = input.initialCapital;
  const equityCurve: { day: number; equity: number }[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const drift = (netPnl / steps) * (0.7 + ((seed + i) % 7) / 10);
    equity += drift;
    equityCurve.push({ day: i, equity: Math.round(equity) });
  }

  return {
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromDate: input.fromDate,
    toDate: input.toDate,
    initialCapital: input.initialCapital,
    totalTrades,
    winRate,
    netPnl,
    maxDrawdown,
    profitFactor,
    sharpe,
    equityCurve,
  };
}
