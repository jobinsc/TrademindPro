import { promises as fs } from 'node:fs';
import path from 'node:path';

const niftyPath =
  process.argv[2] ||
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_1m_2026-02-26_to_2026-07-21.csv';
const optionPath =
  process.argv[3] ||
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_ATM_CE_PE_1m_2026-02-26_to_2026-07-21.csv';
const outputPath =
  process.argv[4] ||
  path.join(
    process.cwd(),
    '.data',
    'nifty-atm-option-capturability-analysis.json'
  );

const TARGETS = [6, 8];
const STOP = 5;
const HORIZON = 5;
const ENTRY_CUTOFF = '14:30';
const COOLDOWN = 5;

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseNifty(raw) {
  const rows = raw.trim().split(/\r?\n/).slice(1);
  const grouped = new Map();
  for (const row of rows) {
    const [timestamp, open, high, low, close] = row.split(',');
    const date = timestamp.slice(0, 10);
    const bars = grouped.get(date) || [];
    bars.push({
      date,
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
  const rows = raw.trim().split(/\r?\n/).slice(1);
  const grouped = new Map();
  for (const row of rows) {
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
      date,
      expiry,
      strike: Number(strike),
      option,
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

function directionsForBar(name, bars, index, openingRange) {
  const bar = bars[index];
  const prior = bars[index - 1];
  const body = bar.close - bar.open;
  const directions = [];
  const add = (direction) => {
    if (!directions.includes(direction)) directions.push(direction);
  };

  if (name === 'IMPULSE_10') {
    if (body >= 10) add('UP');
    if (body <= -10) add('DOWN');
  } else if (name === 'IMPULSE_15') {
    if (body >= 15) add('UP');
    if (body <= -15) add('DOWN');
  } else if (name === 'TWO_BAR_CONTINUATION') {
    const priorBody = prior.close - prior.open;
    const change = bar.close - bars[index - 2].close;
    if (body > 0 && priorBody > 0 && change >= 15) add('UP');
    if (body < 0 && priorBody < 0 && change <= -15) add('DOWN');
  } else if (name === 'THREE_CLOSE_TREND') {
    const a = bars[index - 2].close;
    const b = prior.close;
    const c = bar.close;
    if (a < b && b < c && c - a >= 15) add('UP');
    if (a > b && b > c && a - c >= 15) add('DOWN');
  } else if (name === 'FIVE_BAR_BREAK') {
    const lookback = bars.slice(index - 5, index);
    if (body > 0 && bar.close > Math.max(...lookback.map((item) => item.high))) add('UP');
    if (body < 0 && bar.close < Math.min(...lookback.map((item) => item.low))) add('DOWN');
  } else if (name === 'FIFTEEN_BAR_BREAK') {
    const lookback = bars.slice(index - 15, index);
    if (body > 0 && bar.close > Math.max(...lookback.map((item) => item.high))) add('UP');
    if (body < 0 && bar.close < Math.min(...lookback.map((item) => item.low))) add('DOWN');
  } else if (name === 'BREAK_WITH_IMPULSE') {
    const lookback = bars.slice(index - 5, index);
    if (body >= 8 && bar.close > Math.max(...lookback.map((item) => item.high))) add('UP');
    if (body <= -8 && bar.close < Math.min(...lookback.map((item) => item.low))) add('DOWN');
  } else if (name === 'OPENING_RANGE_CROSS') {
    if (
      bar.time >= '09:30' &&
      prior.close <= openingRange.high &&
      bar.close > openingRange.high
    ) add('UP');
    if (
      bar.time >= '09:30' &&
      prior.close >= openingRange.low &&
      bar.close < openingRange.low
    ) add('DOWN');
  } else if (name === 'FAILED_FIVE_BAR_BREAK') {
    const lookback = bars.slice(index - 5, index);
    const priorHigh = Math.max(...lookback.map((item) => item.high));
    const priorLow = Math.min(...lookback.map((item) => item.low));
    if (bar.high > priorHigh && body < 0 && bar.close < priorHigh) add('DOWN');
    if (bar.low < priorLow && body > 0 && bar.close > priorLow) add('UP');
  }
  return directions;
}

function evaluateTarget(entry, future, target) {
  let targetIndex = -1;
  let stopIndex = -1;
  for (let index = 0; index < future.length; index++) {
    if (targetIndex < 0 && future[index].high >= entry + target) targetIndex = index;
    if (stopIndex < 0 && future[index].low <= entry - STOP) stopIndex = index;
  }
  if (targetIndex >= 0 && stopIndex >= 0 && targetIndex === stopIndex) {
    return { outcome: 'AMBIGUOUS', bars: targetIndex + 1 };
  }
  if (targetIndex >= 0 && (stopIndex < 0 || targetIndex < stopIndex)) {
    return { outcome: 'WIN', bars: targetIndex + 1 };
  }
  if (stopIndex >= 0 && (targetIndex < 0 || stopIndex < targetIndex)) {
    return { outcome: 'STOP', bars: stopIndex + 1 };
  }
  return { outcome: 'NO_TARGET', bars: HORIZON };
}

const [niftyRaw, optionRaw] = await Promise.all([
  fs.readFile(niftyPath, 'utf8'),
  fs.readFile(optionPath, 'utf8'),
]);
const niftyByDate = parseNifty(niftyRaw);
const optionByDateSide = parseOptions(optionRaw);
const dates = [...niftyByDate.keys()].sort();
const splitIndex = Math.floor(dates.length * 2 / 3);
const trainingDates = new Set(dates.slice(0, splitIndex));
const testDates = new Set(dates.slice(splitIndex));
const scenarioNames = [
  'IMPULSE_10',
  'IMPULSE_15',
  'TWO_BAR_CONTINUATION',
  'THREE_CLOSE_TREND',
  'FIVE_BAR_BREAK',
  'FIFTEEN_BAR_BREAK',
  'BREAK_WITH_IMPULSE',
  'OPENING_RANGE_CROSS',
  'FAILED_FIVE_BAR_BREAK',
];
const events = [];

for (const date of dates) {
  const nifty = niftyByDate.get(date) || [];
  const optionMaps = {
    UP: new Map((optionByDateSide.get(`${date}|CE`) || []).map((bar) => [bar.time, bar])),
    DOWN: new Map((optionByDateSide.get(`${date}|PE`) || []).map((bar) => [bar.time, bar])),
  };
  const openingBars = nifty.filter((bar) => bar.time >= '09:15' && bar.time <= '09:29');
  const openingRange = {
    high: Math.max(...openingBars.map((bar) => bar.high)),
    low: Math.min(...openingBars.map((bar) => bar.low)),
  };
  const lastSignal = new Map();

  for (let index = 15; index < nifty.length - 1; index++) {
    const signalBar = nifty[index];
    if (signalBar.time > ENTRY_CUTOFF) break;
    const entryTime = nifty[index + 1].time;
    for (const scenario of scenarioNames) {
      const directions = directionsForBar(
        scenario,
        nifty,
        index,
        openingRange
      );
      for (const direction of directions) {
        const cooldownKey = `${scenario}|${direction}`;
        const previousIndex = lastSignal.get(cooldownKey) ?? -Infinity;
        if (index - previousIndex < COOLDOWN) continue;
        const optionMap = optionMaps[direction];
        const entryBar = optionMap.get(entryTime);
        if (!entryBar) continue;
        const optionBars = [...optionMap.values()];
        const optionIndex = optionBars.findIndex((bar) => bar.time === entryTime);
        const future = optionBars.slice(optionIndex, optionIndex + HORIZON);
        if (future.length < HORIZON) continue;
        const entry = entryBar.open;
        const mfe = Math.max(...future.map((bar) => bar.high)) - entry;
        const mae = entry - Math.min(...future.map((bar) => bar.low));
        const horizonGross = future.at(-1).close - entry;
        const results = Object.fromEntries(
          TARGETS.map((target) => [
            target,
            evaluateTarget(entry, future, target),
          ])
        );
        events.push({
          date,
          split: trainingDates.has(date) ? 'TRAIN' : 'TEST',
          scenario,
          direction,
          signalTime: signalBar.time,
          entryTime,
          entry,
          mfe: round(mfe, 2),
          mae: round(mae, 2),
          horizonGross: round(horizonGross, 2),
          target6: results[6],
          target8: results[8],
        });
        lastSignal.set(cooldownKey, index);
      }
    }
  }
}

function summarize(eventsForScenario, target) {
  const key = target === 6 ? 'target6' : 'target8';
  const outcomes = eventsForScenario.map((event) => event[key].outcome);
  const wins = outcomes.filter((outcome) => outcome === 'WIN').length;
  const stops = outcomes.filter((outcome) => outcome === 'STOP').length;
  const ambiguous = outcomes.filter((outcome) => outcome === 'AMBIGUOUS').length;
  const noTarget = outcomes.filter((outcome) => outcome === 'NO_TARGET').length;
  const netResults = eventsForScenario.map((event) => {
    const outcome = event[key].outcome;
    if (outcome === 'WIN') return target - 1;
    if (outcome === 'STOP' || outcome === 'AMBIGUOUS') return -STOP - 1;
    return event.horizonGross - 1;
  });
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const result of netResults) {
    cumulative += result;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  return {
    signals: eventsForScenario.length,
    wins,
    stops,
    ambiguous,
    noTarget,
    strictWinRate: round(100 * wins / Math.max(1, eventsForScenario.length)),
    resolvedWinRate: round(100 * wins / Math.max(1, wins + stops)),
    medianMfe: round(median(eventsForScenario.map((event) => event.mfe))),
    medianMae: round(median(eventsForScenario.map((event) => event.mae))),
    medianBarsToWin: round(
      median(
        eventsForScenario
          .filter((event) => event[key].outcome === 'WIN')
          .map((event) => event[key].bars)
      )
    ),
    averageNetPoints: round(
      netResults.reduce((sum, result) => sum + result, 0) /
        Math.max(1, netResults.length),
      2
    ),
    totalNetPoints: round(
      netResults.reduce((sum, result) => sum + result, 0),
      2
    ),
    maxDrawdownPoints: round(maxDrawdown, 2),
  };
}

function phase(time) {
  if (time < '10:15') return 'OPEN';
  if (time < '12:00') return 'MORNING';
  if (time < '13:30') return 'MIDDAY';
  return 'AFTERNOON';
}

const scenarios = scenarioNames.map((scenario) => {
  const matching = events.filter((event) => event.scenario === scenario);
  const train = matching.filter((event) => event.split === 'TRAIN');
  const test = matching.filter((event) => event.split === 'TEST');
  return {
    scenario,
    training: {
      target6: summarize(train, 6),
      target8: summarize(train, 8),
    },
    test: {
      target6: summarize(test, 6),
      target8: summarize(test, 8),
    },
  };
});

const rankedTest = [...scenarios].sort(
  (a, b) =>
    b.test.target6.strictWinRate - a.test.target6.strictWinRate ||
    b.test.target6.signals - a.test.target6.signals
);
const subgroupKeys = [
  ...new Set(
    events.map(
      (event) =>
        `${event.scenario}|${event.direction}|${phase(event.signalTime)}`
    )
  ),
];
const selectedSubgroups = subgroupKeys
  .map((key) => {
    const [scenario, direction, sessionPhase] = key.split('|');
    const matching = events.filter(
      (event) =>
        event.scenario === scenario &&
        event.direction === direction &&
        phase(event.signalTime) === sessionPhase
    );
    const train = matching.filter((event) => event.split === 'TRAIN');
    const test = matching.filter((event) => event.split === 'TEST');
    return {
      scenario,
      direction,
      phase: sessionPhase,
      training: {
        target6: summarize(train, 6),
        target8: summarize(train, 8),
      },
      test: {
        target6: summarize(test, 6),
        target8: summarize(test, 8),
      },
    };
  })
  .filter((group) => group.training.target6.signals >= 50)
  .sort(
    (a, b) =>
      b.training.target6.strictWinRate -
        a.training.target6.strictWinRate ||
      b.training.target6.signals - a.training.target6.signals
  )
  .slice(0, 15);
const rankedExpectancyTest = [...scenarios].sort(
  (a, b) =>
    b.test.target6.averageNetPoints - a.test.target6.averageNetPoints
);
const bestSelectedSubgroupOnTest = [...selectedSubgroups].sort(
  (a, b) =>
    b.test.target6.averageNetPoints - a.test.target6.averageNetPoints
)[0] || null;
const report = {
  generatedAt: new Date().toISOString(),
  sources: { niftyPath, optionPath },
  rules: {
    indicators: 'none',
    signalData: 'Nifty OHLC available at signal candle close only',
    execution: 'Buy locked ATM CE for UP or PE for DOWN at next one-minute open',
    optionLock: '09:15 Nifty close; option evaluation starts 09:16',
    entryCutoff: ENTRY_CUTOFF,
    horizonMinutes: HORIZON,
    stopPoints: STOP,
    grossTargets: TARGETS,
    frictionInterpretation:
      '+6/+8 gross approximates +5/+7 after one option point round-trip friction',
    ambiguity:
      'If target and stop occur in the same one-minute candle, outcome is AMBIGUOUS and not counted as a win',
    cooldownMinutes: COOLDOWN,
  },
  split: {
    trainingSessions: trainingDates.size,
    trainingFrom: dates[0],
    trainingTo: dates[splitIndex - 1],
    testSessions: testDates.size,
    testFrom: dates[splitIndex],
    testTo: dates.at(-1),
  },
  summary: {
    sessions: dates.length,
    events: events.length,
    bestTestScenario: rankedTest[0]?.scenario || null,
    bestTestTarget6: rankedTest[0]?.test.target6 || null,
    bestTestTarget8: rankedTest[0]?.test.target8 || null,
    bestTestExpectancyScenario: rankedExpectancyTest[0]?.scenario || null,
    bestTestExpectancyTarget6:
      rankedExpectancyTest[0]?.test.target6 || null,
    bestSelectedSubgroupOnTest,
  },
  scenarios,
  rankedTest,
  rankedExpectancyTest,
  selectedSubgroups,
  events,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(
  JSON.stringify(
    {
      outputPath,
      split: report.split,
      summary: report.summary,
      rankedTest: rankedTest.map((item) => ({
        scenario: item.scenario,
        target6: item.test.target6,
        target8: item.test.target8,
      })),
      bestSelectedSubgroupOnTest,
    },
    null,
    2
  )
);
