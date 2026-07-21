import { promises as fs } from 'node:fs';
import path from 'node:path';

const inputPath = path.join(process.cwd(), '.data', 'nifty-futures-1m-2025-07-22-to-2026-07-21.json');
const outputPath = path.join(process.cwd(), '.data', 'nifty-futures-causal-chart-structure.json');
const TARGETS = [30, 60, 90];
const SETUP_GROUPS = [
  ['BREAKOUT_RETEST'],
  ['FAILED_BREAK'],
  ['SWEEP_RECLAIM'],
  ['BREAKOUT_RETEST', 'FAILED_BREAK'],
  ['BREAKOUT_RETEST', 'FAILED_BREAK', 'SWEEP_RECLAIM'],
];
const DAILY_CAPS = [1, 2];
const LAST_SIGNAL = '14:30';
const FORCE_EXIT = '15:13';
const PIVOT_BUFFER = 2;
const MIN_STRUCTURE_RISK = 8;
const MAX_STRUCTURE_RISK = 35;

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

function fiveMinuteBars(session) {
  const result = [];
  for (let start = 0; start + 4 < session.bars.length; start += 5) {
    const source = session.bars.slice(start, start + 5);
    result.push({
      open: source[0].open,
      high: Math.max(...source.map((bar) => bar.high)),
      low: Math.min(...source.map((bar) => bar.low)),
      close: source.at(-1).close,
      time: source.at(-1).time,
      startIndex: start,
      endIndex: start + 4,
    });
  }
  return result;
}

function closeLocation(bar) {
  return (bar.close - bar.low) / Math.max(0.01, bar.high - bar.low);
}

function confirmedPivot(bars, confirmationIndex, type) {
  const pivotIndex = confirmationIndex - 2;
  if (pivotIndex < 2) return null;
  const window = bars.slice(pivotIndex - 2, pivotIndex + 3);
  const pivot = bars[pivotIndex];
  if (type === 'HIGH' && pivot.high === Math.max(...window.map((bar) => bar.high))) {
    return { type, price: pivot.high, pivotIndex, confirmedIndex: confirmationIndex };
  }
  if (type === 'LOW' && pivot.low === Math.min(...window.map((bar) => bar.low))) {
    return { type, price: pivot.low, pivotIndex, confirmedIndex: confirmationIndex };
  }
  return null;
}

function dedupeLevels(levels) {
  return levels
    .sort((a, b) => b.priority - a.priority)
    .filter((level, index, all) =>
      all.slice(0, index).every((accepted) => Math.abs(accepted.price - level.price) > 8)
    );
}

function buildSignals(sessions, dayIndex) {
  const session = sessions[dayIndex];
  const bars = fiveMinuteBars(session);
  if (bars.length < 10) return [];
  const previous = sessions[dayIndex - 1];
  const sameContractPrevious = previous?.instrumentKey === session.instrumentKey;
  const fixedLevels = [];
  if (sameContractPrevious) {
    fixedLevels.push(
      { name: 'PDH', price: Math.max(...previous.bars.map((bar) => bar.high)), priority: 4 },
      { name: 'PDL', price: Math.min(...previous.bars.map((bar) => bar.low)), priority: 4 }
    );
  }
  fixedLevels.push(
    { name: 'ORH', price: Math.max(...bars.slice(0, 3).map((bar) => bar.high)), priority: 3 },
    { name: 'ORL', price: Math.min(...bars.slice(0, 3).map((bar) => bar.low)), priority: 3 }
  );

  const activePivots = [];
  const pending = [];
  const signals = [];
  let sessionHigh = Math.max(...bars.slice(0, 3).map((bar) => bar.high));
  let sessionLow = Math.min(...bars.slice(0, 3).map((bar) => bar.low));

  for (let i = 3; i < bars.length - 1; i++) {
    const bar = bars[i];
    const prior = bars[i - 1];
    if (bar.time > LAST_SIGNAL) break;
    sessionHigh = Math.max(sessionHigh, bar.high);
    sessionLow = Math.min(sessionLow, bar.low);

    for (const type of ['HIGH', 'LOW']) {
      const pivot = confirmedPivot(bars, i, type);
      if (pivot) {
        activePivots.push({
          name: type === 'HIGH' ? 'SWING_HIGH' : 'SWING_LOW',
          price: pivot.price,
          priority: 2,
          confirmedIndex: i,
        });
      }
    }

    const range = Math.max(1, sessionHigh - sessionLow);
    const levels = dedupeLevels([
      ...fixedLevels,
      ...activePivots
        .filter((level) => i - level.confirmedIndex <= 18)
        .filter((level) =>
          level.price >= sessionHigh - range * 0.25 ||
          level.price <= sessionLow + range * 0.25
        ),
    ]);
    const candidates = [];

    for (const breakout of pending.filter((item) => i - item.breakoutIndex <= 3)) {
      const segment = bars.slice(breakout.breakoutIndex, i + 1);
      if (
        breakout.direction === 'LONG' &&
        bar.low <= breakout.level.price + 3 &&
        bar.close >= breakout.level.price + 3 &&
        bar.close > bar.open &&
        closeLocation(bar) >= 0.65
      ) {
        candidates.push({
          setup: 'BREAKOUT_RETEST',
          direction: 'LONG',
          level: breakout.level,
          signalIndex: i,
          stopReference: Math.min(...segment.map((item) => item.low)) - PIVOT_BUFFER,
          score: 20 + breakout.level.priority,
        });
      } else if (
        breakout.direction === 'LONG' &&
        bar.close <= breakout.level.price - 2 &&
        bar.close < bar.open &&
        closeLocation(bar) <= 0.35
      ) {
        candidates.push({
          setup: 'FAILED_BREAK',
          direction: 'SHORT',
          level: breakout.level,
          signalIndex: i,
          stopReference: Math.max(...segment.map((item) => item.high)) + PIVOT_BUFFER,
          score: 30 + breakout.level.priority,
        });
      } else if (
        breakout.direction === 'SHORT' &&
        bar.high >= breakout.level.price - 3 &&
        bar.close <= breakout.level.price - 3 &&
        bar.close < bar.open &&
        closeLocation(bar) <= 0.35
      ) {
        candidates.push({
          setup: 'BREAKOUT_RETEST',
          direction: 'SHORT',
          level: breakout.level,
          signalIndex: i,
          stopReference: Math.max(...segment.map((item) => item.high)) + PIVOT_BUFFER,
          score: 20 + breakout.level.priority,
        });
      } else if (
        breakout.direction === 'SHORT' &&
        bar.close >= breakout.level.price + 2 &&
        bar.close > bar.open &&
        closeLocation(bar) >= 0.65
      ) {
        candidates.push({
          setup: 'FAILED_BREAK',
          direction: 'LONG',
          level: breakout.level,
          signalIndex: i,
          stopReference: Math.min(...segment.map((item) => item.low)) - PIVOT_BUFFER,
          score: 30 + breakout.level.priority,
        });
      }
    }

    for (const level of levels) {
      const longSweep =
        prior.close >= level.price &&
        bar.low <= level.price - 2 &&
        bar.close >= level.price + 2 &&
        bar.close > bar.open &&
        closeLocation(bar) >= 0.7;
      const shortSweep =
        prior.close <= level.price &&
        bar.high >= level.price + 2 &&
        bar.close <= level.price - 2 &&
        bar.close < bar.open &&
        closeLocation(bar) <= 0.3;
      if (longSweep) {
        candidates.push({
          setup: 'SWEEP_RECLAIM',
          direction: 'LONG',
          level,
          signalIndex: i,
          stopReference: bar.low - PIVOT_BUFFER,
          score: 10 + level.priority,
        });
      }
      if (shortSweep) {
        candidates.push({
          setup: 'SWEEP_RECLAIM',
          direction: 'SHORT',
          level,
          signalIndex: i,
          stopReference: bar.high + PIVOT_BUFFER,
          score: 10 + level.priority,
        });
      }

      if (bar.close >= level.price + 3 && prior.close <= level.price) {
        pending.push({ direction: 'LONG', level, breakoutIndex: i });
      }
      if (bar.close <= level.price - 3 && prior.close >= level.price) {
        pending.push({ direction: 'SHORT', level, breakoutIndex: i });
      }
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      const selected = candidates[0];
      signals.push({
        ...selected,
        entryIndex: bar.endIndex + 1,
        signalTime: bar.time,
        fiveMinuteIndex: i,
      });
      for (let index = pending.length - 1; index >= 0; index--) {
        if (pending[index].level.name === selected.level.name) pending.splice(index, 1);
      }
    }

    for (let index = pending.length - 1; index >= 0; index--) {
      if (i - pending[index].breakoutIndex > 3) pending.splice(index, 1);
    }
  }
  return { bars, signals };
}

function resolve(session, structure, signal, target) {
  const bars = session.bars;
  const entryBar = bars[signal.entryIndex];
  if (!entryBar) return null;
  const entry = entryBar.open;
  const initialRisk =
    signal.direction === 'LONG' ? entry - signal.stopReference : signal.stopReference - entry;
  if (initialRisk < MIN_STRUCTURE_RISK || initialRisk > MAX_STRUCTURE_RISK) return null;
  let effectiveStop = signal.stopReference;
  let exitIndex = bars.findIndex((bar) => bar.time === FORCE_EXIT);
  if (exitIndex < signal.entryIndex) exitIndex = bars.length - 1;
  let exitPrice = bars[exitIndex].close;
  let outcome = 'TIME_EXIT';
  let fiveIndex = signal.fiveMinuteIndex + 1;

  for (let i = signal.entryIndex; i <= exitIndex; i++) {
    const bar = bars[i];
    const targetHit =
      signal.direction === 'LONG' ? bar.high >= entry + target : bar.low <= entry - target;
    const stopHit =
      signal.direction === 'LONG' ? bar.low <= effectiveStop : bar.high >= effectiveStop;
    if (stopHit) {
      outcome = targetHit ? 'AMBIGUOUS_STOP' : effectiveStop === signal.stopReference ? 'STRUCTURE_STOP' : 'SWING_TRAIL';
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

    if (fiveIndex < structure.bars.length && i === structure.bars[fiveIndex].endIndex) {
      const pivotType = signal.direction === 'LONG' ? 'LOW' : 'HIGH';
      const pivot = confirmedPivot(structure.bars, fiveIndex, pivotType);
      if (pivot) {
        const candidate =
          signal.direction === 'LONG' ? pivot.price - PIVOT_BUFFER : pivot.price + PIVOT_BUFFER;
        if (signal.direction === 'LONG' && candidate > effectiveStop && candidate < bar.close) {
          effectiveStop = candidate;
        }
        if (signal.direction === 'SHORT' && candidate < effectiveStop && candidate > bar.close) {
          effectiveStop = candidate;
        }
      }
      fiveIndex += 1;
    }
  }

  const grossPoints = signal.direction === 'LONG' ? exitPrice - entry : entry - exitPrice;
  const costPoints = feesInPoints(session.date, entry, exitPrice, session.lotSize);
  return {
    date: session.date,
    setup: signal.setup,
    direction: signal.direction,
    levelType: signal.level.name,
    level: round(signal.level.price),
    signalTime: signal.signalTime,
    entryTime: entryBar.time,
    exitTime: bars[exitIndex].time,
    entry: round(entry),
    initialRisk: round(initialRisk),
    exit: round(exitPrice),
    outcome,
    grossPoints: round(grossPoints),
    costPoints,
    netPoints: round(grossPoints - costPoints),
    netInr: round((grossPoints - costPoints) * session.lotSize),
    lotSize: session.lotSize,
    exitIndex,
  };
}

function runVariant(sessions, structures, target, allowedSetups, dailyCap) {
  const trades = [];
  for (let day = 0; day < sessions.length; day++) {
    const session = sessions[day];
    const structure = structures[day];
    if (!structure) continue;
    const usedDirections = new Set();
    let availableAfter = 0;
    for (const signal of structure.signals) {
      if (usedDirections.size >= dailyCap) break;
      if (!allowedSetups.includes(signal.setup)) continue;
      if (usedDirections.has(signal.direction) || signal.entryIndex <= availableAfter) continue;
      const trade = resolve(session, structure, signal, target);
      if (!trade) continue;
      trades.push(trade);
      usedDirections.add(signal.direction);
      availableAfter = trade.exitIndex;
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
  const profit = winners.reduce((sum, trade) => sum + trade.netPoints, 0);
  const loss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPoints, 0));
  const count = Math.max(1, trades.length);
  return {
    trades: trades.length,
    tradingDays: new Set(trades.map((trade) => trade.date)).size,
    wins: winners.length,
    losses: losers.length,
    winRate: round((100 * winners.length) / count, 1),
    targets: trades.filter((trade) => trade.outcome === 'TARGET').length,
    structureStops: trades.filter((trade) => trade.outcome === 'STRUCTURE_STOP').length,
    swingTrails: trades.filter((trade) => trade.outcome === 'SWING_TRAIL').length,
    averageInitialRisk: round(trades.reduce((sum, trade) => sum + trade.initialRisk, 0) / count),
    averageGrossPoints: round(trades.reduce((sum, trade) => sum + trade.grossPoints, 0) / count),
    averageCostPoints: round(trades.reduce((sum, trade) => sum + trade.costPoints, 0) / count),
    averageNetPoints: round(trades.reduce((sum, trade) => sum + trade.netPoints, 0) / count),
    totalNetPoints: round(trades.reduce((sum, trade) => sum + trade.netPoints, 0)),
    totalNetInr: round(trades.reduce((sum, trade) => sum + trade.netInr, 0)),
    profitFactor: round(profit / Math.max(0.01, loss)),
    maxDrawdownPoints: round(maxDrawdown),
  };
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const sessions = dataset.primary;
const structures = sessions.map((_, index) => buildSignals(sessions, index));
const dates = sessions.map((session) => session.date);
const trainEnd = dates[Math.floor(dates.length * 0.5) - 1];
const validationEnd = dates[Math.floor(dates.length * 0.75) - 1];
const variants = [];
for (const setups of SETUP_GROUPS) {
  for (const dailyCap of DAILY_CAPS) {
    for (const target of TARGETS) {
      const trades = runVariant(sessions, structures, target, setups, dailyCap);
      variants.push({
        target,
        setups,
        dailyCap,
        training: summarize(trades.filter((trade) => trade.date <= trainEnd)),
        validation: summarize(trades.filter((trade) => trade.date > trainEnd && trade.date <= validationEnd)),
        test: summarize(trades.filter((trade) => trade.date > validationEnd)),
        all: summarize(trades),
        trades,
      });
    }
  }
}
variants.sort((a, b) =>
  b.validation.averageNetPoints - a.validation.averageNetPoints ||
  b.training.averageNetPoints - a.training.averageNetPoints
);

const frozen = variants.find((variant) => variant.validation.trades >= 20 && variant.training.trades >= 40);
const bySetup = ['BREAKOUT_RETEST', 'FAILED_BREAK', 'SWEEP_RECLAIM'].map((setup) => ({
  setup,
  ...summarize(frozen.trades.filter((trade) => trade.setup === setup)),
}));
const byDirection = ['LONG', 'SHORT'].map((direction) => ({
  direction,
  ...summarize(frozen.trades.filter((trade) => trade.direction === direction)),
}));
const byMonth = [...new Set(frozen.trades.map((trade) => trade.date.slice(0, 7)))].map((month) => ({
  month,
  ...summarize(frozen.trades.filter((trade) => trade.date.startsWith(month))),
}));

const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    structureTimeframe: '5-minute',
    executionTimeframe: '1-minute next-open',
    setups: ['BREAKOUT_RETEST', 'FAILED_BREAK', 'SWEEP_RECLAIM'],
    levels: ['previous-day high/low', 'first 15-minute high/low', 'causally confirmed 5-minute pivots'],
    structureRiskRange: [MIN_STRUCTURE_RISK, MAX_STRUCTURE_RISK],
    targetPoints: TARGETS,
    trailing: 'Two-left/two-right confirmed 5-minute swing plus two-point buffer',
    maximumTradesPerDay: 2,
    maximumPerDirectionPerDay: 1,
    noOverlap: true,
    lastSignal: LAST_SIGNAL,
    forceExit: FORCE_EXIT,
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
    setups: frozen.setups,
    dailyCap: frozen.dailyCap,
    training: frozen.training,
    validation: frozen.validation,
    test: frozen.test,
    all: frozen.all,
  },
  bySetup,
  byDirection,
  byMonth,
  trades: frozen.trades.map(({ exitIndex, ...trade }) => trade),
};

await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  outputPath,
  split: report.split,
  frozen: report.frozen,
  rankedValidation: report.rankedValidation,
  bySetup,
  byDirection,
  byMonth,
}, null, 2));
