import { promises as fs } from 'node:fs';
import path from 'node:path';

const niftyPath =
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_1m_2026-02-26_to_2026-07-21.csv';
const optionPath =
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_ATM_CE_PE_1m_2026-02-26_to_2026-07-21.csv';
const outputPath = path.join(
  process.cwd(),
  '.data',
  'nifty-selective-price-action-backtest.json'
);

const OR_END = '09:44';
const SEARCH_FROM = '09:45';
const LAST_SIGNAL = '14:29';
const MIN_PULLBACK = 5;
const MAX_PULLBACK = 35;
const HORIZON = 5;
const STOP = 5;
const TARGETS = [6, 8];
const FRICTION = 1;

function round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function parseNifty(raw) {
  const grouped = new Map();
  for (const row of raw.trim().split(/\r?\n/).slice(1)) {
    const [timestamp, open, high, low, close] = row.split(',');
    const date = timestamp.slice(0, 10);
    const bars = grouped.get(date) || [];
    bars.push({
      time: timestamp.slice(11, 16),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    });
    grouped.set(date, bars);
  }
  return grouped;
}

function parseOptions(raw) {
  const grouped = new Map();
  for (const row of raw.trim().split(/\r?\n/).slice(1)) {
    const [
      date,
      expiry,
      strike,
      option,
      time,
      open,
      high,
      low,
      close,
    ] = row.split(',');
    const key = `${date}|${option}`;
    const bars = grouped.get(key) || [];
    bars.push({
      expiry,
      strike: Number(strike),
      time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    });
    grouped.set(key, bars);
  }
  for (const bars of grouped.values()) {
    bars.sort((a, b) => a.time.localeCompare(b.time));
  }
  return grouped;
}

function optionConfirmation(optionBySide, date, direction, time) {
  const selectedSide = direction === 'UP' ? 'CE' : 'PE';
  const oppositeSide = direction === 'UP' ? 'PE' : 'CE';
  const selected = optionBySide.get(`${date}|${selectedSide}`) || [];
  const opposite = optionBySide.get(`${date}|${oppositeSide}`) || [];
  const selectedIndex = selected.findIndex((bar) => bar.time === time);
  const oppositeIndex = opposite.findIndex((bar) => bar.time === time);
  if (selectedIndex < 3 || oppositeIndex < 3) return false;
  const selectedBar = selected[selectedIndex];
  const selectedPrior = selected[selectedIndex - 1];
  const selectedChange3 =
    selectedBar.close - selected[selectedIndex - 3].close;
  const oppositeChange3 =
    opposite[oppositeIndex].close - opposite[oppositeIndex - 3].close;
  return (
    selectedBar.close > selectedPrior.high &&
    selectedChange3 >= 2 &&
    oppositeChange3 <= 2
  );
}

function acceptedBreak(bars, index, direction, level) {
  if (index < 2) return false;
  if (direction === 'UP') {
    return (
      bars[index - 1].close > level &&
      bars[index].close > level &&
      bars[index - 2].close <= level
    );
  }
  return (
    bars[index - 1].close < level &&
    bars[index].close < level &&
    bars[index - 2].close >= level
  );
}

function findTrade(date, nifty, optionBySide) {
  const openingBars = nifty.filter(
    (bar) => bar.time >= '09:15' && bar.time <= OR_END
  );
  const openingHigh = Math.max(...openingBars.map((bar) => bar.high));
  const openingLow = Math.min(...openingBars.map((bar) => bar.low));
  const firstSearchIndex = nifty.findIndex((bar) => bar.time === SEARCH_FROM);
  const candidates = [];

  for (const direction of ['UP', 'DOWN']) {
    const level = direction === 'UP' ? openingHigh : openingLow;
    for (let index = firstSearchIndex; index < nifty.length - 1; index++) {
      if (nifty[index].time > LAST_SIGNAL) break;
      if (!acceptedBreak(nifty, index, direction, level)) continue;
      const acceptanceIndex = index;
      let extreme =
        direction === 'UP' ? nifty[index].high : nifty[index].low;
      let pullbackStarted = false;

      for (let scan = index + 1; scan < nifty.length - 1; scan++) {
        const bar = nifty[scan];
        if (bar.time > LAST_SIGNAL) break;
        const prior = nifty[scan - 1];
        if (
          (direction === 'UP' && bar.close <= level) ||
          (direction === 'DOWN' && bar.close >= level)
        ) {
          break;
        }
        if (direction === 'UP') {
          extreme = Math.max(extreme, bar.high);
          const retracement = extreme - bar.low;
          if (retracement > MAX_PULLBACK) break;
          if (bar.close < bar.open && retracement >= MIN_PULLBACK) {
            pullbackStarted = true;
            continue;
          }
          const continuation =
            pullbackStarted &&
            bar.close > bar.open &&
            bar.close > prior.high;
          if (
            continuation &&
            optionConfirmation(optionBySide, date, direction, bar.time)
          ) {
            candidates.push({
              date,
              direction,
              openingHigh,
              openingLow,
              acceptanceTime: nifty[acceptanceIndex].time,
              signalTime: bar.time,
              entryTime: nifty[scan + 1].time,
              pullbackPoints: round(extreme - Math.min(...nifty.slice(acceptanceIndex + 1, scan + 1).map((item) => item.low))),
            });
            break;
          }
        } else {
          extreme = Math.min(extreme, bar.low);
          const retracement = bar.high - extreme;
          if (retracement > MAX_PULLBACK) break;
          if (bar.close > bar.open && retracement >= MIN_PULLBACK) {
            pullbackStarted = true;
            continue;
          }
          const continuation =
            pullbackStarted &&
            bar.close < bar.open &&
            bar.close < prior.low;
          if (
            continuation &&
            optionConfirmation(optionBySide, date, direction, bar.time)
          ) {
            candidates.push({
              date,
              direction,
              openingHigh,
              openingLow,
              acceptanceTime: nifty[acceptanceIndex].time,
              signalTime: bar.time,
              entryTime: nifty[scan + 1].time,
              pullbackPoints: round(Math.max(...nifty.slice(acceptanceIndex + 1, scan + 1).map((item) => item.high)) - extreme),
            });
            break;
          }
        }
      }
      if (candidates.some((candidate) => candidate.direction === direction)) {
        break;
      }
    }
  }
  return candidates.sort((a, b) => a.signalTime.localeCompare(b.signalTime))[0] || null;
}

function evaluate(entry, future, target) {
  let targetIndex = -1;
  let stopIndex = -1;
  for (let index = 0; index < future.length; index++) {
    if (targetIndex < 0 && future[index].high >= entry + target) targetIndex = index;
    if (stopIndex < 0 && future[index].low <= entry - STOP) stopIndex = index;
  }
  if (targetIndex >= 0 && stopIndex >= 0 && targetIndex === stopIndex) {
    return { outcome: 'AMBIGUOUS', grossPoints: -STOP };
  }
  if (targetIndex >= 0 && (stopIndex < 0 || targetIndex < stopIndex)) {
    return { outcome: 'WIN', grossPoints: target };
  }
  if (stopIndex >= 0 && (targetIndex < 0 || stopIndex < targetIndex)) {
    return { outcome: 'STOP', grossPoints: -STOP };
  }
  return {
    outcome: 'TIME_EXIT',
    grossPoints: future.at(-1).close - entry,
  };
}

function summarize(trades, resultKey) {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const netResults = trades.map((trade) => trade[resultKey].netPoints);
  for (const result of netResults) {
    cumulative += result;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const wins = trades.filter((trade) => trade[resultKey].outcome === 'WIN').length;
  return {
    trades: trades.length,
    wins,
    stops: trades.filter(
      (trade) =>
        trade[resultKey].outcome === 'STOP' ||
        trade[resultKey].outcome === 'AMBIGUOUS'
    ).length,
    timeExits: trades.filter(
      (trade) => trade[resultKey].outcome === 'TIME_EXIT'
    ).length,
    winRate: round(100 * wins / Math.max(1, trades.length), 1),
    averageNetPoints: round(
      netResults.reduce((sum, value) => sum + value, 0) /
        Math.max(1, netResults.length)
    ),
    totalNetPoints: round(netResults.reduce((sum, value) => sum + value, 0)),
    maxDrawdownPoints: round(maxDrawdown),
  };
}

const [niftyRaw, optionRaw] = await Promise.all([
  fs.readFile(niftyPath, 'utf8'),
  fs.readFile(optionPath, 'utf8'),
]);
const niftyByDate = parseNifty(niftyRaw);
const optionBySide = parseOptions(optionRaw);
const dates = [...niftyByDate.keys()].sort();
const splitIndex = 64;
const trades = [];

for (const date of dates) {
  const setup = findTrade(date, niftyByDate.get(date) || [], optionBySide);
  if (!setup) continue;
  const side = setup.direction === 'UP' ? 'CE' : 'PE';
  const optionBars = optionBySide.get(`${date}|${side}`) || [];
  const entryIndex = optionBars.findIndex((bar) => bar.time === setup.entryTime);
  if (entryIndex < 0) continue;
  const future = optionBars.slice(entryIndex, entryIndex + HORIZON);
  if (future.length < HORIZON) continue;
  const entry = future[0].open;
  const target6 = evaluate(entry, future, 6);
  const target8 = evaluate(entry, future, 8);
  trades.push({
    ...setup,
    split: dates.indexOf(date) < splitIndex ? 'TRAIN' : 'TEST',
    option: side,
    expiry: future[0].expiry,
    strike: future[0].strike,
    entry: round(entry),
    target6: {
      outcome: target6.outcome,
      grossPoints: round(target6.grossPoints),
      netPoints: round(target6.grossPoints - FRICTION),
    },
    target8: {
      outcome: target8.outcome,
      grossPoints: round(target8.grossPoints),
      netPoints: round(target8.grossPoints - FRICTION),
    },
  });
}

const training = trades.filter((trade) => trade.split === 'TRAIN');
const test = trades.filter((trade) => trade.split === 'TEST');
const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    openingRange: '09:15–09:44',
    acceptance: 'Two consecutive closes outside opening range',
    controlledPullback: `${MIN_PULLBACK}–${MAX_PULLBACK} Nifty points without a close back inside`,
    continuation: 'Direction candle closes through prior candle extreme',
    optionConfirmation:
      'Selected option closes through prior high, gains at least 2 points over 3 minutes, opposite option gains no more than 2',
    execution: 'Next one-minute option open',
    maximumTrades: 'One per day; earliest qualifying direction',
    lastSignal: LAST_SIGNAL,
    outcome: `Five-minute horizon, ${STOP}-point stop, +6/+8 gross targets, ${FRICTION}-point friction`,
  },
  sessions: {
    total: dates.length,
    withTrade: trades.length,
    skipped: dates.length - trades.length,
    training: 64,
    test: 32,
  },
  all: {
    net5: summarize(trades, 'target6'),
    net7: summarize(trades, 'target8'),
  },
  training: {
    net5: summarize(training, 'target6'),
    net7: summarize(training, 'target8'),
  },
  test: {
    net5: summarize(test, 'target6'),
    net7: summarize(test, 'target8'),
  },
  trades,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ outputPath, ...report }, null, 2));
