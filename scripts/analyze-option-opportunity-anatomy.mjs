import { promises as fs } from 'node:fs';
import path from 'node:path';

const niftyPath =
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_1m_2026-02-26_to_2026-07-21.csv';
const optionPath =
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY_ATM_CE_PE_1m_2026-02-26_to_2026-07-21.csv';
const eventPath = path.join(
  process.cwd(),
  '.data',
  'nifty-atm-option-capturability-analysis.json'
);
const outputPath = path.join(
  process.cwd(),
  '.data',
  'nifty-atm-option-opportunity-anatomy.json'
);

function round(value, digits = 2) {
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

function minuteNumber(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function phase(time) {
  if (time < '10:15') return 'OPEN';
  if (time < '12:00') return 'MORNING';
  if (time < '13:30') return 'MIDDAY';
  return 'AFTERNOON';
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

const [niftyRaw, optionRaw, baseReportRaw] = await Promise.all([
  fs.readFile(niftyPath, 'utf8'),
  fs.readFile(optionPath, 'utf8'),
  fs.readFile(eventPath, 'utf8'),
]);
const niftyByDate = parseNifty(niftyRaw);
const optionByDateSide = parseOptions(optionRaw);
const baseReport = JSON.parse(baseReportRaw);

const uniqueEvents = new Map();
for (const event of baseReport.events) {
  const key = `${event.date}|${event.entryTime}|${event.direction}`;
  const existing = uniqueEvents.get(key);
  if (existing) {
    existing.scenarios.add(event.scenario);
  } else {
    uniqueEvents.set(key, { ...event, scenarios: new Set([event.scenario]) });
  }
}

const candidates = [];
for (const event of uniqueEvents.values()) {
  const nifty = niftyByDate.get(event.date) || [];
  const signalIndex = nifty.findIndex((bar) => bar.time === event.signalTime);
  if (signalIndex < 15) continue;
  const selectedSide = event.direction === 'UP' ? 'CE' : 'PE';
  const oppositeSide = event.direction === 'UP' ? 'PE' : 'CE';
  const selected = optionByDateSide.get(`${event.date}|${selectedSide}`) || [];
  const opposite = optionByDateSide.get(`${event.date}|${oppositeSide}`) || [];
  const selectedIndex = selected.findIndex((bar) => bar.time === event.signalTime);
  const oppositeIndex = opposite.findIndex((bar) => bar.time === event.signalTime);
  if (selectedIndex < 5 || oppositeIndex < 5) continue;

  const directionSign = event.direction === 'UP' ? 1 : -1;
  const selectedChange1 =
    selected[selectedIndex].close - selected[selectedIndex - 1].close;
  const selectedChange3 =
    selected[selectedIndex].close - selected[selectedIndex - 3].close;
  const selectedChange5 =
    selected[selectedIndex].close - selected[selectedIndex - 5].close;
  const oppositeChange3 =
    opposite[oppositeIndex].close - opposite[oppositeIndex - 3].close;
  const niftyChange3 =
    directionSign *
    (nifty[signalIndex].close - nifty[signalIndex - 3].close);
  const niftyChange5 =
    directionSign *
    (nifty[signalIndex].close - nifty[signalIndex - 5].close);
  const dayMove =
    directionSign * (nifty[signalIndex].close - nifty[0].open);
  const strike = selected[selectedIndex].strike;
  const distanceFromStrike = Math.abs(nifty[signalIndex].close - strike);
  const outcome = event.target6.outcome;
  const netPoints =
    outcome === 'WIN'
      ? 5
      : outcome === 'STOP' || outcome === 'AMBIGUOUS'
        ? -6
        : event.horizonGross - 1;
  const scenarioList = [...event.scenarios];

  candidates.push({
    date: event.date,
    split: event.split,
    direction: event.direction,
    phase: phase(event.signalTime),
    signalTime: event.signalTime,
    entryTime: event.entryTime,
    outcome,
    netPoints: round(netPoints),
    scenarios: scenarioList,
    selectedChange1: round(selectedChange1),
    selectedChange3: round(selectedChange3),
    selectedChange5: round(selectedChange5),
    oppositeChange3: round(oppositeChange3),
    relativeStrength3: round(selectedChange3 - oppositeChange3),
    niftyChange3: round(niftyChange3),
    niftyChange5: round(niftyChange5),
    dayMove: round(dayMove),
    distanceFromStrike: round(distanceFromStrike),
    selectedPremium: selected[selectedIndex].close,
  });
}

function anatomy(events) {
  const wins = events.filter((event) => event.outcome === 'WIN');
  const stops = events.filter(
    (event) => event.outcome === 'STOP' || event.outcome === 'AMBIGUOUS'
  );
  const metrics = [
    'selectedChange1',
    'selectedChange3',
    'selectedChange5',
    'oppositeChange3',
    'relativeStrength3',
    'niftyChange3',
    'niftyChange5',
    'dayMove',
    'distanceFromStrike',
    'selectedPremium',
  ];
  return Object.fromEntries(
    metrics.map((metric) => [
      metric,
      {
        winnerMedian: round(median(wins.map((event) => event[metric]))),
        stopMedian: round(median(stops.map((event) => event[metric]))),
      },
    ])
  );
}

const ruleCandidates = [];
for (const niftyMinimum of [5, 10, 15]) {
  for (const optionMinimum of [2, 4, 6]) {
    for (const relativeMinimum of [4, 6, 8]) {
      for (const oppositeMaximum of [2, 0, -2]) {
        ruleCandidates.push({
          name: `DUAL_CONFIRM_N${niftyMinimum}_O${optionMinimum}_R${relativeMinimum}_X${oppositeMaximum}`,
          family: 'DUAL_CONFIRMATION',
          match: (event) =>
            event.niftyChange3 >= niftyMinimum &&
            event.selectedChange3 >= optionMinimum &&
            event.relativeStrength3 >= relativeMinimum &&
            event.oppositeChange3 <= oppositeMaximum,
        });
      }
    }
  }
}
for (const family of [
  {
    name: 'BREAKOUT_CONFIRMATION',
    scenarios: ['FIVE_BAR_BREAK', 'FIFTEEN_BAR_BREAK', 'BREAK_WITH_IMPULSE'],
  },
  {
    name: 'IMPULSE_CONFIRMATION',
    scenarios: ['IMPULSE_10', 'IMPULSE_15', 'TWO_BAR_CONTINUATION'],
  },
  {
    name: 'OPENING_RANGE_CONFIRMATION',
    scenarios: ['OPENING_RANGE_CROSS'],
  },
]) {
  for (const optionMinimum of [2, 4, 6]) {
    for (const relativeMinimum of [4, 6, 8]) {
      ruleCandidates.push({
        name: `${family.name}_O${optionMinimum}_R${relativeMinimum}`,
        family: family.name,
        match: (event) =>
          event.scenarios.some((scenario) => family.scenarios.includes(scenario)) &&
          event.selectedChange3 >= optionMinimum &&
          event.relativeStrength3 >= relativeMinimum &&
          event.niftyChange3 >= 5,
      });
    }
  }
}
for (const distance of [50, 100]) {
  for (const optionMinimum of [3, 5]) {
    ruleCandidates.push({
      name: `NEAR_ATM_D${distance}_O${optionMinimum}`,
      family: 'NEAR_ATM_CONFIRMATION',
      match: (event) =>
        event.distanceFromStrike <= distance &&
        event.niftyChange3 >= 10 &&
        event.selectedChange3 >= optionMinimum &&
        event.relativeStrength3 >= 6,
    });
  }
}

function selectTrades(events, match) {
  const selected = [];
  const lastByDateDirection = new Map();
  const countByDate = new Map();
  for (const event of events) {
    if (!match(event)) continue;
    const count = countByDate.get(event.date) || 0;
    if (count >= 2) continue;
    const key = `${event.date}|${event.direction}`;
    const lastMinute = lastByDateDirection.get(key) ?? -Infinity;
    const currentMinute = minuteNumber(event.entryTime);
    if (currentMinute - lastMinute < 15) continue;
    selected.push(event);
    countByDate.set(event.date, count + 1);
    lastByDateDirection.set(key, currentMinute);
  }
  return selected;
}

function summarize(events) {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const event of events) {
    cumulative += event.netPoints;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const wins = events.filter((event) => event.outcome === 'WIN').length;
  return {
    signals: events.length,
    days: new Set(events.map((event) => event.date)).size,
    wins,
    winRate: round(100 * wins / Math.max(1, events.length), 1),
    averageNetPoints: round(
      events.reduce((sum, event) => sum + event.netPoints, 0) /
        Math.max(1, events.length)
    ),
    totalNetPoints: round(
      events.reduce((sum, event) => sum + event.netPoints, 0)
    ),
    maxDrawdownPoints: round(maxDrawdown),
  };
}

const trainingCandidates = candidates.filter((event) => event.split === 'TRAIN');
const testCandidates = candidates.filter((event) => event.split === 'TEST');
const evaluatedRules = ruleCandidates
  .map((rule) => {
    const training = selectTrades(trainingCandidates, rule.match);
    const test = selectTrades(testCandidates, rule.match);
    return {
      name: rule.name,
      family: rule.family,
      training: summarize(training),
      test: summarize(test),
    };
  })
  .filter((rule) => rule.training.signals >= 40)
  .sort(
    (a, b) =>
      b.training.averageNetPoints - a.training.averageNetPoints ||
      b.training.signals - a.training.signals
  );
const frozenTopRules = evaluatedRules.slice(0, 10);
const primaryFrozenRule = frozenTopRules[0] || null;
const positiveOnTest = frozenTopRules.filter(
  (rule) => rule.test.averageNetPoints > 0 && rule.test.signals >= 15
);

const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    target: '+6 gross approximating +5 after friction',
    stop: '-5 gross; ambiguous same-candle outcomes treated as -6 net',
    selection: 'Rules ranked on first 64 sessions only',
    frequency: 'Maximum two trades per day; 15-minute same-direction cooldown',
    warning:
      'The final 32 sessions were already viewed in an earlier broad test, so this is research validation rather than a pristine final holdout.',
  },
  candidateSummary: {
    uniqueCandidates: candidates.length,
    trainingCandidates: trainingCandidates.length,
    testCandidates: testCandidates.length,
  },
  trainingAnatomy: anatomy(trainingCandidates),
  primaryFrozenRule,
  frozenTopRules,
  positiveFrozenRulesOnTest: positiveOnTest,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(
  JSON.stringify(
    {
      outputPath,
      candidateSummary: report.candidateSummary,
      trainingAnatomy: report.trainingAnatomy,
      primaryFrozenRule,
      positiveFrozenRulesOnTest: positiveOnTest,
    },
    null,
    2
  )
);
