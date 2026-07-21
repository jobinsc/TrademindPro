import { promises as fs } from 'node:fs';
import path from 'node:path';

const inputPath = path.join(
  process.cwd(),
  '.data',
  'nifty-futures-1m-2025-07-22-to-2026-07-21.json'
);
const outputPath = path.join(
  process.cwd(),
  '.data',
  'nifty-futures-pd-level-rejection.json'
);
const TARGETS = [30, 60, 90];
const STOPS = [15, 20, 30];
const MAX_TRADES = 3;
const LAST_SIGNAL = '14:30';
const FORCE_EXIT = '15:13';
const COOLDOWN_MINUTES = 15;

function round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function minuteNumber(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

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

function rejectionSignals(sessions, index) {
  if (index < 1) return [];
  const previous = sessions[index - 1];
  const current = sessions[index];
  if (previous.instrumentKey !== current.instrumentKey) return [];
  const previousHigh = Math.max(...previous.bars.map((bar) => bar.high));
  const previousLow = Math.min(...previous.bars.map((bar) => bar.low));
  const signals = [];
  for (let barIndex = 1; barIndex < current.bars.length - 1; barIndex++) {
    const bar = current.bars[barIndex];
    if (bar.time > LAST_SIGNAL) break;
    const prior = current.bars[barIndex - 1];
    const shortRejection =
      bar.high >= previousHigh &&
      bar.close < previousHigh &&
      bar.close < bar.open &&
      prior.close <= previousHigh;
    const longRejection =
      bar.low <= previousLow &&
      bar.close > previousLow &&
      bar.close > bar.open &&
      prior.close >= previousLow;
    if (shortRejection) {
      signals.push({
        direction: 'SHORT',
        signalIndex: barIndex,
        level: previousHigh,
        levelType: 'PDH',
      });
    } else if (longRejection) {
      signals.push({
        direction: 'LONG',
        signalIndex: barIndex,
        level: previousLow,
        levelType: 'PDL',
      });
    }
  }
  return signals;
}

function resolve(session, signal, target, stop) {
  const bars = session.bars;
  const entryIndex = signal.signalIndex + 1;
  const entryBar = bars[entryIndex];
  if (!entryBar) return null;
  const entry = entryBar.open;
  let outcome = 'TIME_EXIT';
  let exitIndex = bars.findIndex((bar) => bar.time === FORCE_EXIT);
  if (exitIndex < entryIndex) exitIndex = bars.length - 1;
  let exitPrice = bars[exitIndex].close;
  for (let index = entryIndex; index <= exitIndex; index++) {
    const bar = bars[index];
    const targetHit =
      signal.direction === 'LONG'
        ? bar.high >= entry + target
        : bar.low <= entry - target;
    const stopHit =
      signal.direction === 'LONG'
        ? bar.low <= entry - stop
        : bar.high >= entry + stop;
    if (stopHit) {
      outcome = targetHit ? 'AMBIGUOUS_STOP' : 'STOP';
      exitIndex = index;
      if (signal.direction === 'LONG') {
        exitPrice = bar.open <= entry - stop ? bar.open : entry - stop;
      } else {
        exitPrice = bar.open >= entry + stop ? bar.open : entry + stop;
      }
      break;
    }
    if (targetHit) {
      outcome = 'TARGET';
      exitIndex = index;
      exitPrice = signal.direction === 'LONG' ? entry + target : entry - target;
      break;
    }
  }
  const grossPoints =
    signal.direction === 'LONG' ? exitPrice - entry : entry - exitPrice;
  const costPoints = feesInPoints(
    session.date,
    entry,
    exitPrice,
    session.lotSize
  );
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
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const session = sessions[sessionIndex];
    const signals = rejectionSignals(sessions, sessionIndex);
    let availableAfterIndex = 0;
    let lastSignalMinute = -Infinity;
    let dailyTrades = 0;
    for (const signal of signals) {
      if (dailyTrades >= MAX_TRADES) break;
      if (signal.signalIndex < availableAfterIndex) continue;
      const signalMinute = minuteNumber(session.bars[signal.signalIndex].time);
      if (signalMinute - lastSignalMinute < COOLDOWN_MINUTES) continue;
      const trade = resolve(session, signal, target, stop);
      if (!trade) continue;
      trades.push(trade);
      dailyTrades += 1;
      lastSignalMinute = signalMinute;
      availableAfterIndex = trade.exitIndex + 1;
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
  const grossLoss = Math.abs(
    losers.reduce((sum, trade) => sum + trade.netPoints, 0)
  );
  return {
    trades: trades.length,
    tradingDays: new Set(trades.map((trade) => trade.date)).size,
    wins: winners.length,
    losses: losers.length,
    targetHits: trades.filter((trade) => trade.outcome === 'TARGET').length,
    winRate: round((100 * winners.length) / Math.max(1, trades.length), 1),
    averageGrossPoints: round(
      trades.reduce((sum, trade) => sum + trade.grossPoints, 0) /
        Math.max(1, trades.length)
    ),
    averageCostPoints: round(
      trades.reduce((sum, trade) => sum + trade.costPoints, 0) /
        Math.max(1, trades.length)
    ),
    averageNetPoints: round(
      trades.reduce((sum, trade) => sum + trade.netPoints, 0) /
        Math.max(1, trades.length)
    ),
    totalNetPoints: round(
      trades.reduce((sum, trade) => sum + trade.netPoints, 0)
    ),
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
      validation: summarize(
        trades.filter(
          (trade) => trade.date > trainEnd && trade.date <= validationEnd
        )
      ),
      test: summarize(trades.filter((trade) => trade.date > validationEnd)),
      all: summarize(trades),
      trades,
    });
  }
}
variants.sort(
  (a, b) =>
    b.validation.averageNetPoints - a.validation.averageNetPoints ||
    b.training.averageNetPoints - a.training.averageNetPoints
);
const frozen = variants[0];
const byMonth = [
  ...new Set(frozen.trades.map((trade) => trade.date.slice(0, 7))),
].map((month) => ({
  month,
  ...summarize(
    frozen.trades.filter((trade) => trade.date.startsWith(month))
  ),
}));
const byLevel = ['PDH', 'PDL'].map((level) => ({
  level,
  ...summarize(frozen.trades.filter((trade) => trade.levelType === level)),
}));
const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    setup:
      'Touch/cross previous-day high or low, then directional candle closes back inside',
    maximumTradesPerDay: MAX_TRADES,
    cooldownMinutes: COOLDOWN_MINUTES,
    noOverlap: true,
    lastSignal: LAST_SIGNAL,
    forceExit: FORCE_EXIT,
    execution: 'Next one-minute open',
    targetPoints: TARGETS,
    stopPoints: STOPS,
    costs:
      'One-lot date-effective futures fees plus one point slippage per side',
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
  byLevel,
  trades: frozen.trades.map(({ exitIndex, ...trade }) => trade),
};
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(
  JSON.stringify(
    {
      outputPath,
      split: report.split,
      frozen: report.frozen,
      rankedValidation: report.rankedValidation,
      byMonth,
      byLevel,
    },
    null,
    2
  )
);
