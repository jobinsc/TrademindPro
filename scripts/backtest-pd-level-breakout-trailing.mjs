import { promises as fs } from 'node:fs';
import path from 'node:path';

const inputPath = path.join(process.cwd(), '.data', 'nifty-futures-1m-2025-07-22-to-2026-07-21.json');
const outputPath = path.join(process.cwd(), '.data', 'nifty-futures-pd-breakout-trailing.json');
const TARGETS = [30, 60, 90];
const STOPS = [15, 20, 30];
const LAST_SIGNAL = '14:30';
const FORCE_EXIT = '15:13';

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function feesInPoints(date, entryPrice, exitPrice, lotSize) {
  const buyTurnover = Math.min(entryPrice, exitPrice) * lotSize;
  const sellTurnover = Math.max(entryPrice, exitPrice) * lotSize;
  const turnover = buyTurnover + sellTurnover;
  const brokerage = 40;
  const stt = sellTurnover * (date >= '2026-04-01' ? 0.0005 : 0.0002);
  const exchange = turnover * 0.0000173;
  const sebi = turnover * 0.000001;
  const stamp = buyTurnover * 0.00002;
  const gst = 0.18 * (brokerage + exchange + sebi);
  return round((brokerage + stt + exchange + sebi + stamp + gst) / lotSize + 2);
}

function breakoutSignals(sessions, index) {
  if (index < 1) return [];
  const previous = sessions[index - 1];
  const current = sessions[index];
  if (previous.instrumentKey !== current.instrumentKey) return [];
  const previousHigh = Math.max(...previous.bars.map((bar) => bar.high));
  const previousLow = Math.min(...previous.bars.map((bar) => bar.low));
  const signals = [];
  for (let i = 1; i < current.bars.length - 1; i++) {
    const bar = current.bars[i];
    const prior = current.bars[i - 1];
    if (bar.time > LAST_SIGNAL) break;
    if (bar.close > previousHigh && prior.close <= previousHigh) {
      signals.push({ direction: 'LONG', levelType: 'PDH', level: previousHigh, signalIndex: i });
    }
    if (bar.close < previousLow && prior.close >= previousLow) {
      signals.push({ direction: 'SHORT', levelType: 'PDL', level: previousLow, signalIndex: i });
    }
  }
  return signals;
}

function resolve(session, signal, target, stopDistance) {
  const bars = session.bars;
  const entryIndex = signal.signalIndex + 1;
  const entryBar = bars[entryIndex];
  if (!entryBar) return null;
  const entry = entryBar.open;
  const forceIndex = bars.findIndex((bar) => bar.time === FORCE_EXIT);
  const finalIndex = forceIndex >= entryIndex ? forceIndex : bars.length - 1;
  let effectiveStop = signal.direction === 'LONG' ? entry - stopDistance : entry + stopDistance;
  let favorableExtreme = entry;
  let exitIndex = finalIndex;
  let exitPrice = bars[finalIndex].close;
  let outcome = 'TIME_EXIT';

  for (let i = entryIndex; i <= finalIndex; i++) {
    const bar = bars[i];
    const targetHit =
      signal.direction === 'LONG' ? bar.high >= entry + target : bar.low <= entry - target;
    const stopHit =
      signal.direction === 'LONG' ? bar.low <= effectiveStop : bar.high >= effectiveStop;

    if (stopHit) {
      outcome = targetHit ? 'AMBIGUOUS_TRAIL_STOP' : effectiveStop === (signal.direction === 'LONG' ? entry - stopDistance : entry + stopDistance) ? 'INITIAL_STOP' : 'TRAIL_STOP';
      exitIndex = i;
      exitPrice =
        signal.direction === 'LONG'
          ? bar.open <= effectiveStop ? bar.open : effectiveStop
          : bar.open >= effectiveStop ? bar.open : effectiveStop;
      break;
    }
    if (targetHit) {
      outcome = 'TARGET';
      exitIndex = i;
      exitPrice = signal.direction === 'LONG' ? entry + target : entry - target;
      break;
    }

    // The completed bar's extreme updates the stop for the next bar only.
    if (signal.direction === 'LONG') {
      favorableExtreme = Math.max(favorableExtreme, bar.high);
      effectiveStop = Math.max(effectiveStop, favorableExtreme - stopDistance);
    } else {
      favorableExtreme = Math.min(favorableExtreme, bar.low);
      effectiveStop = Math.min(effectiveStop, favorableExtreme + stopDistance);
    }
  }

  const grossPoints = signal.direction === 'LONG' ? exitPrice - entry : entry - exitPrice;
  const costPoints = feesInPoints(session.date, entry, exitPrice, session.lotSize);
  return {
    date: session.date,
    direction: signal.direction,
    levelType: signal.levelType,
    level: round(signal.level),
    signalTime: bars[signal.signalIndex].time,
    entryTime: entryBar.time,
    exitTime: bars[exitIndex].time,
    entry: round(entry),
    exit: round(exitPrice),
    outcome,
    grossPoints: round(grossPoints),
    costPoints,
    netPoints: round(grossPoints - costPoints),
    netInr: round((grossPoints - costPoints) * session.lotSize),
    lotSize: session.lotSize,
    expiry: session.expiry,
    exitIndex,
  };
}

function runVariant(sessions, target, stop) {
  const trades = [];
  for (let day = 0; day < sessions.length; day++) {
    const session = sessions[day];
    const signals = breakoutSignals(sessions, day);
    const usedDirections = new Set();
    let availableAfter = 0;
    for (const signal of signals) {
      if (usedDirections.size >= 2) break;
      if (usedDirections.has(signal.direction) || signal.signalIndex < availableAfter) continue;
      const trade = resolve(session, signal, target, stop);
      if (!trade) continue;
      trades.push(trade);
      usedDirections.add(signal.direction);
      availableAfter = trade.exitIndex + 1;
    }
  }
  return trades;
}

function summarize(trades) {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    cumulative += trade.netPoints;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const winners = trades.filter((trade) => trade.netPoints > 0);
  const losers = trades.filter((trade) => trade.netPoints <= 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPoints, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPoints, 0));
  const count = Math.max(1, trades.length);
  return {
    trades: trades.length,
    tradingDays: new Set(trades.map((trade) => trade.date)).size,
    wins: winners.length,
    losses: losers.length,
    targetHits: trades.filter((trade) => trade.outcome === 'TARGET').length,
    initialStops: trades.filter((trade) => trade.outcome === 'INITIAL_STOP').length,
    trailingStops: trades.filter((trade) => trade.outcome.includes('TRAIL_STOP')).length,
    winRate: round((100 * winners.length) / count, 1),
    averageGrossPoints: round(trades.reduce((sum, trade) => sum + trade.grossPoints, 0) / count),
    averageCostPoints: round(trades.reduce((sum, trade) => sum + trade.costPoints, 0) / count),
    averageNetPoints: round(trades.reduce((sum, trade) => sum + trade.netPoints, 0) / count),
    totalNetPoints: round(trades.reduce((sum, trade) => sum + trade.netPoints, 0)),
    totalNetInr: round(trades.reduce((sum, trade) => sum + trade.netInr, 0)),
    profitFactor: round(grossProfit / Math.max(0.01, grossLoss)),
    maxDrawdownPoints: round(maxDrawdown),
  };
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const sessions = dataset.primary;
const dates = sessions.map((session) => session.date);
const trainEnd = dates[Math.floor(dates.length * 0.5) - 1];
const validationEnd = dates[Math.floor(dates.length * 0.75) - 1];
const variants = [];

for (const target of TARGETS) {
  for (const stop of STOPS) {
    const trades = runVariant(sessions, target, stop);
    variants.push({
      target,
      stop,
      training: summarize(trades.filter((trade) => trade.date <= trainEnd)),
      validation: summarize(trades.filter((trade) => trade.date > trainEnd && trade.date <= validationEnd)),
      test: summarize(trades.filter((trade) => trade.date > validationEnd)),
      all: summarize(trades),
      trades,
    });
  }
}

variants.sort((a, b) =>
  b.validation.averageNetPoints - a.validation.averageNetPoints ||
  b.training.averageNetPoints - a.training.averageNetPoints
);
const frozen = variants[0];
const byMonth = [...new Set(frozen.trades.map((trade) => trade.date.slice(0, 7)))].map((month) => ({
  month,
  ...summarize(frozen.trades.filter((trade) => trade.date.startsWith(month))),
}));
const byDirection = ['LONG', 'SHORT'].map((direction) => ({
  direction,
  ...summarize(frozen.trades.filter((trade) => trade.direction === direction)),
}));

const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    setup: 'One-minute close crosses above previous-day high to buy or below previous-day low to sell',
    maximumTradesPerDay: 2,
    maximumPerDirectionPerDay: 1,
    noOverlap: true,
    lastSignal: LAST_SIGNAL,
    forceExit: FORCE_EXIT,
    execution: 'Next one-minute open',
    targets: TARGETS,
    initialAndTrailingStopDistances: STOPS,
    trailingMechanics: 'Completed-bar favorable extreme minus/plus stop distance; new trail applies from next bar',
    costs: 'One-lot date-effective futures fees plus one point slippage per side',
  },
  split: {
    training: `${dates[0]} to ${trainEnd}`,
    validation: `${dates[dates.indexOf(trainEnd) + 1]} to ${validationEnd}`,
    test: `${dates[dates.indexOf(validationEnd) + 1]} to ${dates.at(-1)}`,
  },
  sessions: sessions.length,
  rankedValidation: variants.map(({ trades, ...variant }) => variant),
  frozen: {
    target: frozen.target,
    stop: frozen.stop,
    training: frozen.training,
    validation: frozen.validation,
    test: frozen.test,
    all: frozen.all,
  },
  byMonth,
  byDirection,
  trades: frozen.trades.map(({ exitIndex, ...trade }) => trade),
};

await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  outputPath,
  split: report.split,
  frozen: report.frozen,
  rankedValidation: report.rankedValidation,
  byMonth,
  byDirection,
}, null, 2));
