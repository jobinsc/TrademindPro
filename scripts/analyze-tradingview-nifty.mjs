import { promises as fs } from 'node:fs';
import path from 'node:path';

const input =
  process.argv[2] ||
  'C:\\Users\\jobin\\Downloads\\NSE_NIFTY, 1_0b635.csv';
const intervalMinutes = Math.max(1, Number(process.argv[3] || 1));
const fromDate = process.argv[4] || '2026-07-01';
const toDate = process.argv[5] || '2026-07-21';
const outputName = process.argv[6] || null;
const customRange = process.argv[4] || process.argv[5];
const rangeSuffix = customRange ? `-${fromDate}-to-${toDate}` : '-july';
const output = path.join(
  process.cwd(),
  '.data',
  outputName ||
    (intervalMinutes === 1
      ? `tradingview-nifty${rangeSuffix}-price-analysis.json`
      : `tradingview-nifty${rangeSuffix}-price-analysis-${intervalMinutes}m.json`)
);
const threshold = 30;
const sessionOpenMinute = 9 * 60 + 15;
// Only include bars that are fully closed by the 15:14 hard stop.
const latestPossibleStart = 15 * 60 + 14 - intervalMinutes;
const lastAlignedStart =
  sessionOpenMinute +
  Math.floor((latestPossibleStart - sessionOpenMinute) / intervalMinutes) *
    intervalMinutes;

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function minuteLabel(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function istParts(epochSeconds) {
  const shifted = new Date((epochSeconds + 330 * 60) * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    iso: new Date(epochSeconds * 1000).toISOString(),
  };
}

function parseCsv(raw) {
  const lines = raw.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((value) => value.trim());
  const indices = Object.fromEntries(
    ['time', 'open', 'high', 'low', 'close'].map((name) => [
      name,
      headers.indexOf(name),
    ])
  );
  for (const [name, index] of Object.entries(indices)) {
    if (index < 0) throw new Error(`CSV is missing required ${name} column`);
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = line.split(',');
    const rawTime = values[indices.time]?.trim();
    const numericTime = Number(rawTime);
    const epoch = Number.isFinite(numericTime) && numericTime > 0
      ? numericTime
      : Date.parse(`${rawTime.replace(' ', 'T')}+05:30`) / 1000;
    const open = Number(values[indices.open]);
    const high = Number(values[indices.high]);
    const low = Number(values[indices.low]);
    const close = Number(values[indices.close]);
    if (
      !Number.isFinite(epoch) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    const ist = istParts(epoch);
    if (
      ist.date < fromDate ||
      ist.date > toDate ||
      ist.minute < sessionOpenMinute ||
      ist.minute > latestPossibleStart
    ) {
      continue;
    }
    rows.push({
      epoch,
      t: ist.iso,
      date: ist.date,
      time: ist.time,
      minute: ist.minute,
      open,
      high,
      low,
      close,
    });
  }
  rows.sort((a, b) => a.epoch - b.epoch);
  return [...new Map(rows.map((row) => [row.epoch, row])).values()];
}

function phase(minute) {
  if (minute < 10 * 60 + 15) return 'OPEN';
  if (minute < 12 * 60) return 'MORNING';
  if (minute < 13 * 60 + 30) return 'MIDDAY';
  return 'AFTERNOON';
}

function rawContext(bars, startIndex, direction) {
  const prior = bars.slice(Math.max(0, startIndex - 10), startIndex);
  if (!prior.length) return 'SESSION_OPEN';
  const high = Math.max(...prior.map((bar) => bar.high));
  const low = Math.min(...prior.map((bar) => bar.low));
  const width = Math.max(0.05, high - low);
  const price =
    direction === 'UP' ? bars[startIndex].low : bars[startIndex].high;
  const position = (price - low) / width;
  if (position <= 0.2) return 'PRIOR_RANGE_LOW';
  if (position >= 0.8) return 'PRIOR_RANGE_HIGH';
  return 'PRIOR_RANGE_MIDDLE';
}

function decorateMove(bars, direction, start, end, confirmedIndex, sequence) {
  const points =
    direction === 'UP' ? end.price - start.price : start.price - end.price;
  let reachedIndex = end.index;
  for (let index = start.index; index <= end.index; index++) {
    const reached =
      direction === 'UP'
        ? bars[index].high - start.price >= threshold
        : start.price - bars[index].low >= threshold;
    if (reached) {
      reachedIndex = index;
      break;
    }
  }
  return {
    id: `${bars[0].date}-${String(sequence).padStart(2, '0')}`,
    date: bars[0].date,
    sequence,
    direction,
    startAt: bars[start.index].time,
    reached30At: bars[reachedIndex].time,
    extremeAt: bars[end.index].time,
    confirmedAt: bars[Math.min(confirmedIndex, bars.length - 1)].time,
    startPrice: round(start.price, 2),
    extremePrice: round(end.price, 2),
    points: round(points),
    minutesTo30: (reachedIndex - start.index) * intervalMinutes,
    minutesToExtreme: (end.index - start.index) * intervalMinutes,
    confirmationLagMinutes:
      Math.max(0, confirmedIndex - end.index) * intervalMinutes,
    phase: phase(bars[start.index].minute),
    startContext: rawContext(bars, start.index, direction),
  };
}

/**
 * A price-only 30-point reversal map. Turning extremes are confirmed only
 * after price reverses by 30 points; unfinished final legs are closed at EOD.
 */
function detectMoves(bars) {
  if (!bars.length) return [];
  let highest = { price: bars[0].high, index: 0 };
  let lowest = { price: bars[0].low, index: 0 };
  let direction = null;
  let pivot = null;
  let extreme = null;
  const moves = [];

  for (let index = 1; index < bars.length; index++) {
    const bar = bars[index];
    if (!direction) {
      if (bar.high > highest.price) highest = { price: bar.high, index };
      if (bar.low < lowest.price) lowest = { price: bar.low, index };
      if (highest.price - lowest.price < threshold) continue;
      if (lowest.index <= highest.index) {
        direction = 'UP';
        pivot = lowest;
        extreme = highest;
      } else {
        direction = 'DOWN';
        pivot = highest;
        extreme = lowest;
      }
      continue;
    }

    if (direction === 'UP') {
      if (bar.high > extreme.price) extreme = { price: bar.high, index };
      if (extreme.price - bar.low >= threshold) {
        moves.push(
          decorateMove(
            bars,
            'UP',
            pivot,
            extreme,
            index,
            moves.length + 1
          )
        );
        direction = 'DOWN';
        pivot = extreme;
        extreme = { price: bar.low, index };
      }
    } else {
      if (bar.low < extreme.price) extreme = { price: bar.low, index };
      if (bar.high - extreme.price >= threshold) {
        moves.push(
          decorateMove(
            bars,
            'DOWN',
            pivot,
            extreme,
            index,
            moves.length + 1
          )
        );
        direction = 'UP';
        pivot = extreme;
        extreme = { price: bar.high, index };
      }
    }
  }

  if (direction && pivot && extreme) {
    const finalPoints =
      direction === 'UP'
        ? extreme.price - pivot.price
        : pivot.price - extreme.price;
    if (finalPoints >= threshold) {
      moves.push(
        decorateMove(
          bars,
          direction,
          pivot,
          extreme,
          bars.length - 1,
          moves.length + 1
        )
      );
    }
  }
  return moves;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const raw = await fs.readFile(input, 'utf8');
const candles = parseCsv(raw);
const rawGrouped = new Map();
for (const candle of candles) {
  const bars = rawGrouped.get(candle.date) || [];
  bars.push(candle);
  rawGrouped.set(candle.date, bars);
}
const expectedCandles =
  Math.floor((lastAlignedStart - sessionOpenMinute) / intervalMinutes) + 1;
const incompleteSessions = [];
const grouped = new Map();
for (const [date, bars] of rawGrouped) {
  const complete =
    bars[0]?.minute === sessionOpenMinute &&
    bars[bars.length - 1]?.minute === lastAlignedStart &&
    bars.length === expectedCandles;
  if (complete) {
    grouped.set(date, bars);
  } else {
    incompleteSessions.push({
      date,
      candles: bars.length,
      expectedCandles,
      firstAt: bars[0]?.time ?? null,
      lastAt: bars[bars.length - 1]?.time ?? null,
    });
  }
}

const days = [];
const allMoves = [];
for (const [date, bars] of grouped) {
  const moves = detectMoves(bars);
  allMoves.push(...moves);
  const largestMove = [...moves].sort((a, b) => b.points - a.points)[0] || null;
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  days.push({
    date,
    candles: bars.length,
    firstAt: bars[0].time,
    lastAt: bars[bars.length - 1].time,
    open: round(bars[0].open, 2),
    high: round(high, 2),
    low: round(low, 2),
    close: round(bars[bars.length - 1].close, 2),
    rangePoints: round(high - low),
    moves30: moves.length,
    upMoves: moves.filter((move) => move.direction === 'UP').length,
    downMoves: moves.filter((move) => move.direction === 'DOWN').length,
    largestMove: largestMove?.points ?? 0,
    largestMoveDetail: largestMove
      ? {
          direction: largestMove.direction,
          startAt: largestMove.startAt,
          extremeAt: largestMove.extremeAt,
          points: largestMove.points,
        }
      : null,
  });
}

const byPhase = ['OPEN', 'MORNING', 'MIDDAY', 'AFTERNOON'].map((name) => ({
  phase: name,
  count: allMoves.filter((move) => move.phase === name).length,
}));
const byContext = [
  'SESSION_OPEN',
  'PRIOR_RANGE_LOW',
  'PRIOR_RANGE_HIGH',
  'PRIOR_RANGE_MIDDLE',
].map((name) => ({
  context: name,
  count: allMoves.filter((move) => move.startContext === name).length,
}));
const byMonth = [...new Set(days.map((day) => day.date.slice(0, 7)))].map(
  (month) => {
    const monthDays = days.filter((day) => day.date.startsWith(month));
    const monthMoves = allMoves.filter((move) => move.date.startsWith(month));
    return {
      month,
      sessions: monthDays.length,
      moves30: monthMoves.length,
      averageMovesPerSession: round(
        monthMoves.length / Math.max(1, monthDays.length)
      ),
      moves50: monthMoves.filter((move) => move.points >= 50).length,
      moves75: monthMoves.filter((move) => move.points >= 75).length,
      sameBar30: monthMoves.filter((move) => move.minutesTo30 === 0).length,
      largestMove: round(
        Math.max(0, ...monthMoves.map((move) => move.points))
      ),
    };
  }
);

const report = {
  generatedAt: new Date().toISOString(),
  sourceFile: input,
  rules: {
    sourceFields: ['time', 'open', 'high', 'low', 'close'],
    ignoredFields: ['CCI', 'CCI-based MA'],
    fromDate,
    toDate,
    session: `09:15–${minuteLabel(lastAlignedStart)} bar timestamps; stop and force flat at 15:14`,
    intervalMinutes,
    thresholdPoints: threshold,
    method:
      'Price-only directional swing; an extreme is confirmed after a 30-point reversal. Each session resets independently.',
  },
  summary: {
    candles: [...grouped.values()].reduce((sum, bars) => sum + bars.length, 0),
    sessions: days.length,
    droppedIncompleteSessions: incompleteSessions.length,
    moves30: allMoves.length,
    upMoves: allMoves.filter((move) => move.direction === 'UP').length,
    downMoves: allMoves.filter((move) => move.direction === 'DOWN').length,
    sessionsWithMove: days.filter((day) => day.moves30 > 0).length,
    moves50: allMoves.filter((move) => move.points >= 50).length,
    moves75: allMoves.filter((move) => move.points >= 75).length,
    averagePoints: round(
      allMoves.reduce((sum, move) => sum + move.points, 0) /
        Math.max(1, allMoves.length)
    ),
    medianPoints: round(median(allMoves.map((move) => move.points))),
    medianMinutesTo30: round(
      median(allMoves.map((move) => move.minutesTo30))
    ),
    sameBar30: allMoves.filter((move) => move.minutesTo30 === 0).length,
    within5Minutes: allMoves.filter((move) => move.minutesTo30 <= 5).length,
    largestMove: round(Math.max(0, ...allMoves.map((move) => move.points))),
  },
  byPhase,
  byContext,
  byMonth,
  incompleteSessions,
  days,
  topDays: [...days]
    .sort(
      (a, b) =>
        b.moves30 - a.moves30 ||
        b.largestMove - a.largestMove
    )
    .slice(0, 15),
  topMoves: [...allMoves]
    .sort((a, b) => b.points - a.points)
    .slice(0, 20),
  fastestMoves: [...allMoves]
    .sort(
      (a, b) =>
        a.minutesTo30 - b.minutesTo30 ||
        b.points - a.points
    )
    .slice(0, 20),
  moves: allMoves,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
