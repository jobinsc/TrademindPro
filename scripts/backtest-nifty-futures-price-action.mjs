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
  'nifty-futures-price-action-backtest.json'
);
const TARGET = 30;
const STOPS = [15, 20, 30];
const LAST_SIGNAL = '14:30';
const FORCE_EXIT = '15:13';

function round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function methodSignal(method, sessions, sessionIndex) {
  const session = sessions[sessionIndex];
  const bars = session.bars;
  const start = bars.findIndex((bar) => bar.time >= '09:30');
  if (start < 0) return null;

  if (method === 'OR15_ACCEPTANCE') {
    const opening = bars.filter((bar) => bar.time >= '09:15' && bar.time <= '09:29');
    const high = Math.max(...opening.map((bar) => bar.high));
    const low = Math.min(...opening.map((bar) => bar.low));
    for (let index = start + 1; index < bars.length - 1; index++) {
      if (bars[index].time > LAST_SIGNAL) break;
      if (
        bars[index - 2].close <= high &&
        bars[index - 1].close > high &&
        bars[index].close > high
      ) return { direction: 'LONG', signalIndex: index, context: { high, low } };
      if (
        bars[index - 2].close >= low &&
        bars[index - 1].close < low &&
        bars[index].close < low
      ) return { direction: 'SHORT', signalIndex: index, context: { high, low } };
    }
  }

  if (method === 'OR30_PULLBACK') {
    const opening = bars.filter((bar) => bar.time >= '09:15' && bar.time <= '09:44');
    const high = Math.max(...opening.map((bar) => bar.high));
    const low = Math.min(...opening.map((bar) => bar.low));
    const search = bars.findIndex((bar) => bar.time === '09:45');
    const candidates = [];
    for (const direction of ['LONG', 'SHORT']) {
      const level = direction === 'LONG' ? high : low;
      for (let index = search + 1; index < bars.length - 1; index++) {
        if (bars[index].time > LAST_SIGNAL) break;
        const accepted =
          direction === 'LONG'
            ? bars[index - 2].close <= level &&
              bars[index - 1].close > level &&
              bars[index].close > level
            : bars[index - 2].close >= level &&
              bars[index - 1].close < level &&
              bars[index].close < level;
        if (!accepted) continue;
        let extreme = direction === 'LONG' ? bars[index].high : bars[index].low;
        let pullback = false;
        for (let scan = index + 1; scan < bars.length - 1; scan++) {
          const bar = bars[scan];
          const prior = bars[scan - 1];
          if (bar.time > LAST_SIGNAL) break;
          if (
            (direction === 'LONG' && bar.close <= level) ||
            (direction === 'SHORT' && bar.close >= level)
          ) break;
          if (direction === 'LONG') {
            extreme = Math.max(extreme, bar.high);
            const retracement = extreme - bar.low;
            if (retracement > 40) break;
            if (bar.close < bar.open && retracement >= 8) pullback = true;
            else if (pullback && bar.close > bar.open && bar.close > prior.high) {
              candidates.push({ direction, signalIndex: scan, context: { high, low } });
              break;
            }
          } else {
            extreme = Math.min(extreme, bar.low);
            const retracement = bar.high - extreme;
            if (retracement > 40) break;
            if (bar.close > bar.open && retracement >= 8) pullback = true;
            else if (pullback && bar.close < bar.open && bar.close < prior.low) {
              candidates.push({ direction, signalIndex: scan, context: { high, low } });
              break;
            }
          }
        }
        if (candidates.some((candidate) => candidate.direction === direction)) break;
      }
    }
    return candidates.sort(
      (a, b) => a.signalIndex - b.signalIndex
    )[0] || null;
  }

  if (method === 'PRIOR_DAY_BREAK') {
    if (sessionIndex < 1) return null;
    const previous = sessions[sessionIndex - 1];
    if (previous.instrumentKey !== session.instrumentKey) return null;
    const previousHigh = Math.max(...previous.bars.map((bar) => bar.high));
    const previousLow = Math.min(...previous.bars.map((bar) => bar.low));
    for (let index = start; index < bars.length - 1; index++) {
      if (bars[index].time > LAST_SIGNAL) break;
      const bar = bars[index];
      const prior = bars[index - 1];
      if (bar.close > previousHigh && prior.close <= previousHigh && bar.close > bar.open) {
        return {
          direction: 'LONG',
          signalIndex: index,
          context: { previousHigh, previousLow },
        };
      }
      if (bar.close < previousLow && prior.close >= previousLow && bar.close < bar.open) {
        return {
          direction: 'SHORT',
          signalIndex: index,
          context: { previousHigh, previousLow },
        };
      }
    }
  }

  if (method === 'COMPRESSION_BREAK') {
    for (let index = Math.max(start, 10); index < bars.length - 1; index++) {
      if (bars[index].time > LAST_SIGNAL) break;
      const range = bars.slice(index - 10, index);
      const high = Math.max(...range.map((bar) => bar.high));
      const low = Math.min(...range.map((bar) => bar.low));
      if (high - low > 45) continue;
      const body = bars[index].close - bars[index].open;
      if (body >= 5 && bars[index].close > high) {
        return { direction: 'LONG', signalIndex: index, context: { high, low } };
      }
      if (body <= -5 && bars[index].close < low) {
        return { direction: 'SHORT', signalIndex: index, context: { high, low } };
      }
    }
  }

  if (method === 'STRUCTURE_PULLBACK') {
    for (let index = Math.max(start, 11); index < bars.length - 1; index++) {
      if (bars[index].time > LAST_SIGNAL) break;
      const old = bars.slice(index - 10, index - 5);
      const recent = bars.slice(index - 5, index);
      const oldHigh = Math.max(...old.map((bar) => bar.high));
      const oldLow = Math.min(...old.map((bar) => bar.low));
      const recentHigh = Math.max(...recent.map((bar) => bar.high));
      const recentLow = Math.min(...recent.map((bar) => bar.low));
      const bar = bars[index];
      const prior = bars[index - 1];
      if (
        recentHigh > oldHigh &&
        recentLow > oldLow &&
        prior.close < prior.open &&
        bar.close > bar.open &&
        bar.close > prior.high
      ) return { direction: 'LONG', signalIndex: index, context: {} };
      if (
        recentHigh < oldHigh &&
        recentLow < oldLow &&
        prior.close > prior.open &&
        bar.close < bar.open &&
        bar.close < prior.low
      ) return { direction: 'SHORT', signalIndex: index, context: {} };
    }
  }
  return null;
}

function feesInPoints(date, entryPrice, exitPrice, lotSize) {
  const buyTurnover = entryPrice * lotSize;
  const sellTurnover = exitPrice * lotSize;
  const totalTurnover = buyTurnover + sellTurnover;
  const brokerage = 40;
  const sttRate = date >= '2026-04-01' ? 0.0005 : 0.0002;
  const stt = sellTurnover * sttRate;
  const exchange = totalTurnover * 0.0000173;
  const sebi = totalTurnover * 0.000001;
  const stamp = buyTurnover * 0.00002;
  const gst = 0.18 * (brokerage + exchange + sebi);
  const fees = brokerage + stt + exchange + sebi + stamp + gst;
  const slippage = 2;
  return round(fees / lotSize + slippage);
}

function resolveTrade(session, signal, stop) {
  const bars = session.bars;
  const entryIndex = signal.signalIndex + 1;
  const entryBar = bars[entryIndex];
  if (!entryBar) return null;
  const entry = entryBar.open;
  let outcome = 'TIME_EXIT';
  let grossPoints = 0;
  let exitTime = FORCE_EXIT;
  let exitPrice = bars.at(-1).close;
  for (let index = entryIndex; index < bars.length; index++) {
    const bar = bars[index];
    if (bar.time > FORCE_EXIT) break;
    const targetHit =
      signal.direction === 'LONG'
        ? bar.high >= entry + TARGET
        : bar.low <= entry - TARGET;
    const stopHit =
      signal.direction === 'LONG'
        ? bar.low <= entry - stop
        : bar.high >= entry + stop;
    if (stopHit) {
      outcome = targetHit ? 'AMBIGUOUS_STOP' : 'STOP';
      exitTime = bar.time;
      if (signal.direction === 'LONG') {
        exitPrice = bar.open <= entry - stop ? bar.open : entry - stop;
        grossPoints = exitPrice - entry;
      } else {
        exitPrice = bar.open >= entry + stop ? bar.open : entry + stop;
        grossPoints = entry - exitPrice;
      }
      break;
    }
    if (targetHit) {
      outcome = 'TARGET';
      exitTime = bar.time;
      exitPrice = signal.direction === 'LONG' ? entry + TARGET : entry - TARGET;
      grossPoints = TARGET;
      break;
    }
  }
  if (outcome === 'TIME_EXIT') {
    const last = bars.find((bar) => bar.time === FORCE_EXIT) || bars.at(-1);
    exitPrice = last.close;
    exitTime = last.time;
    grossPoints =
      signal.direction === 'LONG' ? exitPrice - entry : entry - exitPrice;
  }
  const costPoints = feesInPoints(
    session.date,
    Math.min(entry, exitPrice),
    Math.max(entry, exitPrice),
    session.lotSize
  );
  const netPoints = grossPoints - costPoints;
  return {
    date: session.date,
    method: signal.method,
    stop,
    direction: signal.direction,
    signalTime: bars[signal.signalIndex].time,
    entryTime: entryBar.time,
    exitTime,
    entry: round(entry),
    exit: round(exitPrice),
    outcome,
    grossPoints: round(grossPoints),
    costPoints,
    netPoints: round(netPoints),
    netInr: round(netPoints * session.lotSize),
    lotSize: session.lotSize,
    expiry: session.expiry,
    instrumentKey: session.instrumentKey,
  };
}

function summarize(trades) {
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  for (const trade of trades) {
    cumulative += trade.netPoints;
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, peak - cumulative);
  }
  const wins = trades.filter((trade) => trade.netPoints > 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netPoints > 0)
    .reduce((sum, trade) => sum + trade.netPoints, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.netPoints <= 0)
      .reduce((sum, trade) => sum + trade.netPoints, 0)
  );
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    targetHits: trades.filter((trade) => trade.outcome === 'TARGET').length,
    winRate: round((100 * wins) / Math.max(1, trades.length), 1),
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
    maxDrawdownPoints: round(drawdown),
  };
}

function breakdown(trades, keyForTrade) {
  const keys = [...new Set(trades.map(keyForTrade))].sort();
  return keys.map((key) => ({
    key,
    ...summarize(trades.filter((trade) => keyForTrade(trade) === key)),
  }));
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const methods = [
  'OR15_ACCEPTANCE',
  'OR30_PULLBACK',
  'PRIOR_DAY_BREAK',
  'COMPRESSION_BREAK',
  'STRUCTURE_PULLBACK',
];

function runSeries(sessions, method, stop) {
  const trades = [];
  for (let index = 0; index < sessions.length; index++) {
    const rawSignal = methodSignal(method, sessions, index);
    if (!rawSignal) continue;
    const trade = resolveTrade(
      sessions[index],
      { ...rawSignal, method },
      stop
    );
    if (trade) trades.push(trade);
  }
  return trades;
}

const dates = dataset.primary.map((session) => session.date);
const trainEnd = dates[Math.floor(dates.length * 0.5) - 1];
const validationEnd = dates[Math.floor(dates.length * 0.75) - 1];
const variants = [];
for (const method of methods) {
  for (const stop of STOPS) {
    const trades = runSeries(dataset.primary, method, stop);
    variants.push({
      method,
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
const eligible = variants.filter(
  (variant) =>
    variant.training.trades >= 25 &&
    variant.validation.trades >= 12
);
eligible.sort(
  (a, b) =>
    b.validation.averageNetPoints - a.validation.averageNetPoints ||
    b.training.averageNetPoints - a.training.averageNetPoints
);
const frozen = eligible[0] || null;
const rollSensitivity = frozen
  ? {
      roll3: summarize(runSeries(dataset.roll3, frozen.method, frozen.stop)),
      roll5: frozen.all,
      roll7: summarize(runSeries(dataset.roll7, frozen.method, frozen.stop)),
    }
  : null;
const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    targetPoints: TARGET,
    stopsTested: STOPS,
    maximumTrades: 'One per method per day',
    execution: 'Signal at completed candle; entry at next one-minute open',
    lastSignal: LAST_SIGNAL,
    forceExit: FORCE_EXIT,
    ambiguity: 'Stop-first when target and stop share a candle',
    costs:
      'Date-effective one-lot brokerage, STT, exchange, SEBI, GST, stamp duty plus one point slippage per side',
  },
  split: {
    training: `${dates[0]} to ${trainEnd}`,
    validation: `${dates[dates.indexOf(trainEnd) + 1]} to ${validationEnd}`,
    test: `${dates[dates.indexOf(validationEnd) + 1]} to ${dates.at(-1)}`,
  },
  sessions: dates.length,
  rankedValidation: eligible.map(({ trades, ...variant }) => variant),
  frozen: frozen
    ? {
        method: frozen.method,
        stop: frozen.stop,
        training: frozen.training,
        validation: frozen.validation,
        test: frozen.test,
        all: frozen.all,
      }
    : null,
  rollSensitivity,
  byMonth: frozen
    ? breakdown(frozen.trades, (trade) => trade.date.slice(0, 7))
    : [],
  byDirection: frozen
    ? breakdown(frozen.trades, (trade) => trade.direction)
    : [],
  trades: frozen?.trades || [],
};
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(
  JSON.stringify(
    {
      outputPath,
      split: report.split,
      sessions: report.sessions,
      frozen: report.frozen,
      rollSensitivity,
      byMonth: report.byMonth,
      byDirection: report.byDirection,
      topValidation: report.rankedValidation.slice(0, 8),
    },
    null,
    2
  )
);
