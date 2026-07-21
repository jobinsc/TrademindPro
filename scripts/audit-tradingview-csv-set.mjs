import { promises as fs } from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide at least one CSV file');

function ist(epochSeconds) {
  const shifted = new Date((epochSeconds + 330 * 60) * 1000)
    .toISOString();
  return {
    date: shifted.slice(0, 10),
    time: shifted.slice(11, 16),
  };
}

async function readCsv(file) {
  const raw = await fs.readFile(file, 'utf8');
  const lines = raw.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((value) => value.trim());
  const indices = Object.fromEntries(
    ['time', 'open', 'high', 'low', 'close'].map((name) => [
      name,
      headers.indexOf(name),
    ])
  );
  const rows = [];
  for (const line of lines.slice(1)) {
    const values = line.split(',');
    const epoch = Number(values[indices.time]);
    const open = Number(values[indices.open]);
    const high = Number(values[indices.high]);
    const low = Number(values[indices.low]);
    const close = Number(values[indices.close]);
    if ([epoch, open, high, low, close].every(Number.isFinite)) {
      rows.push({ epoch, open, high, low, close, ...ist(epoch) });
    }
  }
  rows.sort((a, b) => a.epoch - b.epoch);
  const duplicateTimestamps = rows.length - new Set(rows.map((row) => row.epoch)).size;
  return {
    file,
    name: path.basename(file),
    rows,
    duplicateTimestamps,
  };
}

const datasets = await Promise.all(files.map(readCsv));
const base = [...datasets].sort((a, b) => b.rows.length - a.rows.length)[0];
const baseByTime = new Map(base.rows.map((row) => [row.epoch, row]));

const report = {
  generatedAt: new Date().toISOString(),
  longestFile: base.name,
  files: datasets.map((dataset) => {
    let overlapRows = 0;
    let ohlcMismatches = 0;
    let rowsOutsideLongest = 0;
    for (const row of dataset.rows) {
      const matching = baseByTime.get(row.epoch);
      if (!matching) {
        rowsOutsideLongest += 1;
        continue;
      }
      overlapRows += 1;
      if (
        row.open !== matching.open ||
        row.high !== matching.high ||
        row.low !== matching.low ||
        row.close !== matching.close
      ) {
        ohlcMismatches += 1;
      }
    }
    const dates = [...new Set(dataset.rows.map((row) => row.date))];
    return {
      name: dataset.name,
      rows: dataset.rows.length,
      firstDate: dataset.rows[0]?.date ?? null,
      firstTime: dataset.rows[0]?.time ?? null,
      lastDate: dataset.rows.at(-1)?.date ?? null,
      lastTime: dataset.rows.at(-1)?.time ?? null,
      calendarDates: dates.length,
      duplicateTimestamps: dataset.duplicateTimestamps,
      overlapRowsWithLongest: overlapRows,
      ohlcMismatchesAgainstLongest: ohlcMismatches,
      rowsOutsideLongest,
      exactTimestampSubsetOfLongest:
        rowsOutsideLongest === 0 && ohlcMismatches === 0,
    };
  }),
};

const output = path.join(
  process.cwd(),
  '.data',
  'tradingview-nifty-3m-file-audit.json'
);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ output, report }, null, 2));
