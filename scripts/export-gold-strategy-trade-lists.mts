import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_BT_PARAMS,
  fetchGoldPulseCandles,
  goldTradeOpenDay,
  runGoldPulseBacktest,
  sliceGoldBacktestByOpenDateRange,
  type GoldBacktestParams,
  type GoldBacktestResult,
  type GoldBacktestTrade,
} from '../src/lib/gold-pulse/backtest.ts';
import { GOLD_PULSE_RULES } from '../src/lib/gold-pulse/rules.ts';
import { exitReasonLabel } from '../src/lib/gold-pulse/signals.ts';

const V12_MAX: Partial<GoldBacktestParams> = {
  ...DEFAULT_BT_PARAMS,
  useTrail: false,
  disableEntryFlipExit: true,
  useStopLoss: false,
  roundTripCostUsd: 5,
  maxTradesPerDay: GOLD_PULSE_RULES.maxTradesPerDay,
  reentryCooldownMs: GOLD_PULSE_RULES.reentryCooldownMs,
  minEntryRangeUsd: GOLD_PULSE_RULES.minEntryRangeUsd,
  entryRangeLookback: GOLD_PULSE_RULES.entryRangeLookback,
  entryUtcHourMin: GOLD_PULSE_RULES.entryUtcHourMin,
  entryUtcHourMax: GOLD_PULSE_RULES.entryUtcHourMax,
};

const SWEEP_PEAK: Partial<GoldBacktestParams> = {
  ...DEFAULT_BT_PARAMS,
  useTrail: false,
  disableEntryFlipExit: true,
  useStopLoss: false,
  roundTripCostUsd: 5,
  maxTradesPerDay: 5,
  reentryCooldownMs: 0,
  minEntryRangeUsd: 10,
  entryRangeLookback: 3,
  entryUtcHourMin: null,
  entryUtcHourMax: null,
  requireHtfStable: false,
};

function utcHm(iso: string): string {
  return iso.slice(11, 16);
}

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

type DayBlock = {
  date: string;
  tradeCount: number;
  dayGross: number;
  dayCost: number;
  dayNet: number;
  trades: Array<{
    id: number;
    side: string;
    openedAt: string;
    closedAt: string;
    openUtc: string;
    closeUtc: string;
    entryPrice: number;
    exitPrice: number;
    exitReason: string;
    exitLabel: string;
    grossPnl: number;
    costUsd: number;
    netPnl: number;
    mfe: number;
    mae: number;
    barsHeld: number;
  }>;
};

function buildDayBlocks(trades: GoldBacktestTrade[], cost: number): DayBlock[] {
  const byDay = new Map<string, GoldBacktestTrade[]>();
  for (const t of trades) {
    const d = goldTradeOpenDay(t.openedAt);
    const list = byDay.get(d) || [];
    list.push(t);
    byDay.set(d, list);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayTrades]) => {
      const sorted = [...dayTrades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
      const dayGross = sorted.reduce((s, t) => s + t.grossPnl, 0);
      const dayCost = sorted.length * cost;
      const dayNet = sorted.reduce((s, t) => s + t.netPnl, 0);
      return {
        date,
        tradeCount: sorted.length,
        dayGross: Math.round(dayGross * 100) / 100,
        dayCost,
        dayNet: Math.round(dayNet * 100) / 100,
        trades: sorted.map((t) => ({
          id: t.id,
          side: t.side,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          openUtc: `${utcDate(t.openedAt)} ${utcHm(t.openedAt)}`,
          closeUtc: `${utcDate(t.closedAt)} ${utcHm(t.closedAt)}`,
          entryPrice: Math.round(t.entryPrice * 100) / 100,
          exitPrice: Math.round(t.exitPrice * 100) / 100,
          exitReason: t.exitReason,
          exitLabel: exitReasonLabel(t.exitReason),
          grossPnl: t.grossPnl,
          costUsd: cost,
          netPnl: t.netPnl,
          mfe: t.mfe,
          mae: t.mae,
          barsHeld: t.barsHeld,
        })),
      };
    });
}

function summarize(name: string, params: Partial<GoldBacktestParams>, result: GoldBacktestResult) {
  const cost = params.roundTripCostUsd ?? 5;
  const days = buildDayBlocks(result.trades, cost);
  const net = result.trades.reduce((s, t) => s + t.netPnl, 0);
  return {
    strategy: name,
    params: {
      maxTradesPerDay: params.maxTradesPerDay,
      reentryCooldownMs: params.reentryCooldownMs,
      minEntryRangeUsd: params.minEntryRangeUsd,
      entryUtcHourMin: params.entryUtcHourMin,
      entryUtcHourMax: params.entryUtcHourMax,
      useTrail: params.useTrail,
      disableEntryFlipExit: params.disableEntryFlipExit,
    },
    window: { from: result.from, to: result.to },
    totals: {
      tradeCount: result.tradeCount,
      wins: result.wins,
      losses: result.losses,
      winRate: result.winRate,
      grossPnl: result.grossPnl,
      costTotal: result.tradeCount * cost,
      netPnl: Math.round(net * 100) / 100,
      maxDrawdown: result.maxDrawdown,
      exitMix: result.exitMix,
    },
    days,
  };
}

function toMarkdown(report: ReturnType<typeof summarize>): string {
  const lines: string[] = [];
  lines.push(`# ${report.strategy}`);
  lines.push('');
  lines.push('## Rules snapshot');
  lines.push('```json');
  lines.push(JSON.stringify(report.params, null, 2));
  lines.push('```');
  lines.push('');
  lines.push(`## Totals (${report.window.from?.slice(0, 10)} → ${report.window.to?.slice(0, 10)} UTC sample)`);
  lines.push(`- Trades: **${report.totals.tradeCount}** (${report.totals.wins} W / ${report.totals.losses} L, ${report.totals.winRate}% win)`);
  lines.push(`- Gross: **$${report.totals.grossPnl}** · Cost: **$${report.totals.costTotal}** · **Net: $${report.totals.netPnl}**`);
  lines.push(`- Max drawdown: **$${report.totals.maxDrawdown}**`);
  lines.push(`- Exits: ${Object.entries(report.totals.exitMix).map(([k, n]) => `${k}×${n}`).join(', ')}`);
  lines.push('');
  lines.push('## By day (UTC open date)');
  for (const d of report.days) {
    lines.push('');
    lines.push(`### ${d.date} — ${d.tradeCount} trade(s) · gross $${d.dayGross} · cost $${d.dayCost} · **net $${d.dayNet}**`);
    lines.push('');
    lines.push('| # | Side | Open (UTC) | Close (UTC) | In → Out | Exit | Gross | Cost | Net | MFE | MAE | Bars |');
    lines.push('|---|------|------------|-------------|----------|------|-------|------|-----|-----|-----|------|');
    for (const t of d.trades) {
      lines.push(
        `| ${t.id} | ${t.side} | ${t.openUtc} | ${t.closeUtc} | ${t.entryPrice} → ${t.exitPrice} | ${t.exitLabel} | ${t.grossPnl >= 0 ? '+' : ''}${t.grossPnl} | -${t.costUsd} | **${t.netPnl >= 0 ? '+' : ''}${t.netPnl}** | +${t.mfe} | -${t.mae} | ${t.barsHeld} |`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

const data = await fetchGoldPulseCandles();
if (!data.ok) {
  console.error(data.error);
  process.exit(1);
}

function runSlice(params: Partial<GoldBacktestParams>) {
  const full = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params,
  });
  const from = full.from!.slice(0, 10);
  const to = full.to!.slice(0, 10);
  return sliceGoldBacktestByOpenDateRange(full, from, to);
}

const v12Result = runSlice(V12_MAX);
const peakResult = runSlice(SWEEP_PEAK);

const v12Report = summarize('Gold Sector 7 Max (v12 locked)', V12_MAX, v12Result);
const peakReport = summarize('Sweep peak (24h, 5/day, no cooldown, $10 range)', SWEEP_PEAK, peakResult);

const outDir = path.join(process.cwd(), '.data', 'gold-pulse', 'reports');
await fs.mkdir(outDir, { recursive: true });

const jsonPath = path.join(outDir, 'GoldPulse-v12-vs-sweep-peak-trades.json');
const mdPath = path.join(outDir, 'GoldPulse-v12-vs-sweep-peak-trades.md');

await fs.writeFile(
  jsonPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      yahooSymbol: 'GC=F',
      entryTf: '15m',
      htfTf: '30m',
      strategies: [v12Report, peakReport],
    },
    null,
    2
  ),
  'utf8'
);

const md = [
  '# GoldPulse — detailed trade lists (two strategies)',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '---',
  '',
  toMarkdown(v12Report),
  '',
  '---',
  '',
  toMarkdown(peakReport),
].join('\n');

await fs.writeFile(mdPath, md, 'utf8');

console.log('Written:', jsonPath);
console.log('Written:', mdPath);
console.log('v12:', v12Report.totals.tradeCount, 'trades net', v12Report.totals.netPnl);
console.log('peak:', peakReport.totals.tradeCount, 'trades net', peakReport.totals.netPnl);
