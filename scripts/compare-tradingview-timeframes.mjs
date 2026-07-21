import { promises as fs } from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), '.data');
const onePath =
  process.argv[2] ||
  path.join(dataDir, 'tradingview-nifty-july-price-analysis.json');
const threePath =
  process.argv[3] ||
  path.join(dataDir, 'tradingview-nifty-july-price-analysis-3m.json');
const outputPath =
  process.argv[4] ||
  path.join(dataDir, 'tradingview-nifty-july-1m-vs-3m.json');

const [one, three] = await Promise.all([
  fs.readFile(onePath, 'utf8').then(JSON.parse),
  fs.readFile(threePath, 'utf8').then(JSON.parse),
]);

const threeByDate = new Map(three.days.map((day) => [day.date, day]));
const days = one.days.map((oneDay) => {
  const threeDay = threeByDate.get(oneDay.date);
  if (!threeDay) throw new Error(`3m report missing ${oneDay.date}`);
  return {
    date: oneDay.date,
    oneMinuteMoves: oneDay.moves30,
    threeMinuteMoves: threeDay.moves30,
    moveCountDifference: threeDay.moves30 - oneDay.moves30,
    oneMinuteLargest: oneDay.largestMove,
    threeMinuteLargest: threeDay.largestMove,
    largestDifference:
      Math.round((threeDay.largestMove - oneDay.largestMove) * 10) / 10,
    oneMinuteLargestDirection: oneDay.largestMoveDetail?.direction ?? null,
    threeMinuteLargestDirection: threeDay.largestMoveDetail?.direction ?? null,
    directionAgrees:
      oneDay.largestMoveDetail?.direction ===
      threeDay.largestMoveDetail?.direction,
    dayRangeAgrees: oneDay.rangePoints === threeDay.rangePoints,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  period: `${one.rules.fromDate} to ${one.rules.toDate}`,
  rules: {
    indicators: 'none',
    oneMinuteCutoff: 'last bar 15:13, closes 15:14',
    threeMinuteCutoff: 'last bar 15:09, closes 15:12',
    sessionsResetDaily: true,
    oneMinuteSource: one.sourceFile,
    threeMinuteSource: three.sourceFile,
  },
  summary: {
    sessions: days.length,
    oneMinuteCandles: one.summary.candles,
    threeMinuteCandles: three.summary.candles,
    oneMinuteMoves30: one.summary.moves30,
    threeMinuteMoves30: three.summary.moves30,
    daysWithEqualMoveCount: days.filter(
      (day) => day.oneMinuteMoves === day.threeMinuteMoves
    ).length,
    largestDirectionAgreementDays: days.filter(
      (day) => day.directionAgrees
    ).length,
    dayRangeAgreementDays: days.filter((day) => day.dayRangeAgrees).length,
    oneMinuteSameBar30: one.summary.sameBar30,
    threeMinuteSameBar30: three.summary.sameBar30,
    oneMinuteMedianSwing: one.summary.medianPoints,
    threeMinuteMedianSwing: three.summary.medianPoints,
    oneMinuteMedianMinutesTo30: one.summary.medianMinutesTo30,
    threeMinuteMedianMinutesTo30: three.summary.medianMinutesTo30,
    averageAbsoluteMoveCountDifference:
      Math.round(
        (days.reduce(
          (sum, day) => sum + Math.abs(day.moveCountDifference),
          0
        ) /
          days.length) *
          10
      ) / 10,
    averageAbsoluteLargestMoveDifference:
      Math.round(
        (days.reduce(
          (sum, day) => sum + Math.abs(day.largestDifference),
          0
        ) /
          days.length) *
          10
      ) / 10,
  },
  days,
};

await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));
