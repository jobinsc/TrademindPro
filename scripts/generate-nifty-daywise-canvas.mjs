import { promises as fs } from 'node:fs';
import path from 'node:path';

const input =
  process.argv[2] ||
  path.join(
    process.cwd(),
    '.data',
    'tradingview-nifty-3m-cb8ee-analysis.json'
  );
const output =
  process.argv[3] ||
  'C:\\Users\\jobin\\.cursor\\projects\\d-JOBIN-TrademindPro\\canvases\\nifty-3m-day-by-day-price-action.canvas.tsx';

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function dayRead(day) {
  const net = day.close - day.open;
  const range = Math.max(0.1, day.rangePoints);
  const efficiency = Math.abs(net) / range;
  const closeLocation = (day.close - day.low) / range;
  const volatile = day.moves30 >= 40 || range >= 350;

  if (net > 0 && closeLocation >= 0.72 && efficiency >= 0.35) {
    return volatile ? 'Volatile bullish close' : 'Bullish directional close';
  }
  if (net < 0 && closeLocation <= 0.28 && efficiency >= 0.35) {
    return volatile ? 'Volatile bearish close' : 'Bearish directional close';
  }
  if (volatile && efficiency < 0.3) return 'High-volatility two-way auction';
  if (net > 0 && closeLocation >= 0.65) return 'Bullish recovery / late strength';
  if (net < 0 && closeLocation <= 0.35) return 'Bearish rejection / late weakness';
  return 'Balanced or two-sided session';
}

function movementRead(day, moves) {
  const largest = [...moves].sort((a, b) => b.points - a.points)[0];
  if (!largest) return 'No completed 30-point leg';
  const sameBar = largest.startAt === largest.extremeAt;
  return `${largest.direction} ${largest.points.toFixed(1)} · ${largest.startAt}→${largest.extremeAt}${sameBar ? ' · intrabar order unknown' : ''}`;
}

function escapeText(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', ' ');
}

const report = JSON.parse(await fs.readFile(input, 'utf8'));
const intervalMinutes = report.rules?.intervalMinutes || 1;
const intervalLabel = `${intervalMinutes}-minute`;
const finerDataLabel = intervalMinutes === 1 ? 'Tick data' : 'One-minute or tick data';
const sourceName = path.basename(report.sourceFile || input);
const movesByDate = new Map();
for (const move of report.moves) {
  const moves = movesByDate.get(move.date) || [];
  moves.push(move);
  movesByDate.set(move.date, moves);
}

const rows = report.days.map((day) => {
  const moves = movesByDate.get(day.date) || [];
  const net = round(day.close - day.open);
  return {
    month: day.date.slice(0, 7),
    date: day.date,
    openClose: `${day.open.toFixed(1)}→${day.close.toFixed(1)} (${net >= 0 ? '+' : ''}${net.toFixed(1)})`,
    highLow: `${day.low.toFixed(1)}–${day.high.toFixed(1)}`,
    range: `${day.rangePoints.toFixed(1)}`,
    legs: `${day.moves30} (${day.upMoves}U/${day.downMoves}D)`,
    largest: movementRead(day, moves),
    read: dayRead(day),
  };
});

const months = [...new Set(rows.map((row) => row.month))];
const monthNames = {
  '2026-02': 'February 2026',
  '2026-03': 'March 2026',
  '2026-04': 'April 2026',
  '2026-05': 'May 2026',
  '2026-06': 'June 2026',
  '2026-07': 'July 2026',
};

const monthSections = months
  .map((month) => {
    const monthRows = rows
      .filter((row) => row.month === month)
      .map(
        (row) =>
          `            ["${escapeText(row.date)}", "${escapeText(row.openClose)}", "${escapeText(row.highLow)}", "${row.range}", "${row.legs}", "${escapeText(row.largest)}", "${escapeText(row.read)}"],`
      )
      .join('\n');
    return `      <Stack gap={10}>
        <H2>${monthNames[month] || month}</H2>
        <Table
          headers={["Date", "Open→close (net)", "Low–high", "Range", "30+ legs", "Largest reconstructed movement", "Price-action read"]}
          rows={[
${monthRows}
          ]}
          columnAlign={["left", "right", "right", "right", "right", "left", "left"]}
          striped
        />
      </Stack>`;
  })
  .join('\n\n');

const source = `import {
  Callout,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

export default function NiftyDayByDayPriceAction() {
  const theme = useHostTheme();
  return (
    <Stack
      gap={20}
      style={{
        minHeight: "100%",
        padding: 24,
        background: theme.bg.editor,
        color: theme.text.primary,
      }}
    >
      <Stack gap={8}>
        <Row align="center" justify="space-between" wrap>
          <H1>Nifty ${intervalLabel} day-by-day price action</H1>
          <Pill active>96 unique dates</Pill>
        </Row>
        <Text tone="secondary">
          26 February–21 July 2026 · each day reset at 09:15 · no overnight carry · stop at 15:14 IST
        </Text>
      </Stack>

      <Callout tone="info" title="How to read this report">
        Every row is one independent trading session. Open, high, low, close, movement balance and
        largest reconstructed movement are calculated only from that date. No level or position is
        carried from another day.
      </Callout>

      <Grid columns={4} gap={14}>
        <Stat value="${report.summary.sessions.toLocaleString('en-US')}" label="Unique complete sessions" />
        <Stat value="${report.summary.candles.toLocaleString('en-US')}" label="Accepted ${intervalLabel} candles" />
        <Stat value="${report.summary.moves30.toLocaleString('en-US')}" label="Retrospective 30+ point legs" />
        <Stat value="${report.summary.sameBar30.toLocaleString('en-US')}" label="Same-candle legs with unknown order" tone="warning" />
      </Grid>

      <Callout tone="warning" title="Exact limitation of ${intervalLabel} OHLC">
        This report shows the exact sequence of completed ${intervalLabel} candles, but it cannot know
        whether the high or low happened first inside a candle. “Intrabar order unknown” marks the
        largest movements where start and extreme occur in the same candle. ${finerDataLabel} is
        required to resolve those paths.
      </Callout>

${monthSections}

      <Callout tone="warning" title="This is market reading, not a trade list">
        A 30-point retrospective leg is not automatically an entry. The day-wise report identifies
        directional, recovery, rejection, balanced and high-volatility sessions. A causal setup
        still needs 1-minute confirmation and actual ATM CE/PE prices to test a 5–7 point scalp.
      </Callout>

      <Text size="small" tone="quaternary">
        Source: ${escapeText(sourceName)}. Each calendar date appears once. Only time and OHLC were
        used; all sessions stop at 15:14 IST.
      </Text>
    </Stack>
  );
}
`;

await fs.writeFile(output, source, 'utf8');
console.log(
  JSON.stringify(
    {
      output,
      sessions: rows.length,
      firstDate: rows[0]?.date,
      lastDate: rows.at(-1)?.date,
    },
    null,
    2
  )
);
