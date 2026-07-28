/**
 * GoldPulse study / daily report — same engine as paper desk (Yahoo GC=F).
 */

import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_BT_PARAMS,
  fetchGoldPulseCandles,
  goldStudyRangeId,
  isValidGoldStudyDay,
  runGoldPulseBacktest,
  sliceGoldBacktestByOpenDateRange,
  type GoldBacktestResult,
  type GoldBacktestTrade,
} from '@/lib/gold-pulse/backtest';
import {
  GOLD_PULSE_NAME,
  GOLD_PULSE_RULES,
  GOLD_PULSE_VERSION,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_SYMBOL,
} from '@/lib/gold-pulse/rules';
import {
  getGoldStrategy,
  goldStrategyParams,
  goldStrategyReportKey,
  isGoldStrategyId,
  type GoldStrategyId,
} from '@/lib/gold-pulse/strategies';
import { exitReasonLabel } from '@/lib/gold-pulse/signals';
import { goldTradeOpenDay } from '@/lib/gold-pulse/backtest';

export type GoldStudyReportMeta = {
  agent: 'GoldPulse';
  date: string;
  title: string;
  generatedAt: string;
  reportSource: 'yahoo_study_replay';
  reportKind?: 'day' | 'end_study' | 'range_study' | 'detailed_strategy';
  version: string;
  strategyId?: GoldStrategyId;
  /** Per-day breakdown for detailed strategy reports */
  dailyDetails?: Array<{
    date: string;
    tradeCount: number;
    dayGross: number;
    dayCost: number;
    dayNet: number;
    trades: Array<{
      id: number;
      side: string;
      openUtc: string;
      closeUtc: string;
      entryPrice: number;
      exitPrice: number;
      exitLabel: string;
      grossPnl: number;
      netPnl: number;
      mfe: number;
      mae: number;
      barsHeld: number;
    }>;
  }>;
  /** User-selected UTC open-day range for this report. */
  studyRange?: { from: string; to: string };
  summary: {
    tradeCount: number;
    wins: number;
    losses: number;
    winRate: number;
    gross: number;
    brokerage: number;
    netAfterCost: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown?: number;
  };
  sections: {
    opening: string[];
    market: string[];
    calc: string[];
    tradeBlocks: string[][];
    deskSummary: string[];
    suggestions: string[];
  };
  simpleStory: string[];
  studyWindow?: { from: string | null; to: string | null };
};

export const GOLD_END_STUDY_DATE = 'end-study';

const OUT_DIR = path.join(process.cwd(), '.data', 'gold-pulse', 'reports', 'daily');
const END_STUDY_PATH = path.join(OUT_DIR, 'GoldPulse-End-Study.meta.json');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');

export function isValidGoldReportKey(key: string): boolean {
  if (key === GOLD_END_STUDY_DATE) return true;
  if (isValidGoldStudyDay(key)) return true;
  if (/^\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}$/.test(key)) return true;
  return /^(v12_max|sweep_peak)_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}$/.test(key);
}

function reportStorageFile(meta: Pick<GoldStudyReportMeta, 'date' | 'reportKind' | 'strategyId'>): string {
  if (meta.reportKind === 'detailed_strategy' || meta.date.startsWith('v12_max_') || meta.date.startsWith('sweep_peak_')) {
    return `GoldPulse-Detailed-${meta.date}.meta.json`;
  }
  if (meta.reportKind === 'range_study' || meta.date.includes('_to_')) {
    return `GoldPulse-Range-${meta.date}.meta.json`;
  }
  if (meta.date === GOLD_END_STUDY_DATE) return 'GoldPulse-End-Study.meta.json';
  return `GoldPulse-Day-${meta.date}.meta.json`;
}

function rangePeriodLabel(fromDate: string, toDate: string): string {
  return fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;
}

function istHm(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function buildDailyDetails(trades: GoldBacktestTrade[], cost: number) {
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
          openUtc: `${t.openedAt.slice(0, 10)} ${istHm(t.openedAt)}`,
          closeUtc: `${t.closedAt.slice(0, 10)} ${istHm(t.closedAt)}`,
          entryPrice: Math.round(t.entryPrice * 100) / 100,
          exitPrice: Math.round(t.exitPrice * 100) / 100,
          exitLabel: exitReasonLabel(t.exitReason),
          grossPnl: t.grossPnl,
          netPnl: t.netPnl,
          mfe: t.mfe,
          mae: t.mae,
          barsHeld: t.barsHeld,
        })),
      };
    });
}

function buildSections(
  date: string,
  trades: GoldBacktestTrade[],
  full: GoldBacktestResult,
  costUsd: number
): GoldStudyReportMeta['sections'] {
  const cost = costUsd;
  const nets = trades.map((t) => t.netPnl);
  const gross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const brokerage = trades.length * cost;
  const wins = nets.filter((n) => n >= 0).length;
  const losses = nets.length - wins;
  const winRate = trades.length ? Math.round((1000 * wins) / trades.length) / 10 : 0;
  const winN = nets.filter((n) => n >= 0);
  const lossN = nets.filter((n) => n < 0);
  const avgWin = winN.length ? winN.reduce((a, b) => a + b, 0) / winN.length : 0;
  const avgLoss = lossN.length ? lossN.reduce((a, b) => a + b, 0) / lossN.length : 0;

  const mix: Record<string, number> = {};
  for (const t of trades) {
    mix[t.exitReason] = (mix[t.exitReason] || 0) + 1;
  }

  const periodLabel = date;
  const isRange = periodLabel.includes('→');
  const opening: string[] = [];
  if (!trades.length) {
    opening.push(
      `No study trades in ${periodLabel} (Yahoo ${GOLD_YAHOO_SYMBOL} ${GOLD_UT_ENTRY.tf}+${GOLD_UT_HTF.tf}).`
    );
  } else {
    const mood = net >= 0 ? 'green' : 'red';
    opening.push(
      `${mood} study ${isRange ? 'range' : 'day'} ${periodLabel}: ${trades.length} trade(s). ` +
        `Wins ${wins}, losses ${losses} (${winRate}% win). ` +
        `Gross $${gross.toFixed(0)}, cost ~$${brokerage.toFixed(0)}, net after $${cost}/trade: $${net.toFixed(0)}.`
    );
  }

  const market = [
    `Report source: Yahoo study replay — same LOCKED rules as paper desk (v${GOLD_PULSE_VERSION}).`,
    `Selected UTC open days: ${periodLabel}.`,
    `BOTS/NexusPulse idea: UT ${GOLD_UT_ENTRY.tf} edge + ${GOLD_UT_HTF.tf} agree. ` +
      `Exits: ${GOLD_PULSE_RULES.sector7Label} (${GOLD_UT_HTF.tf} against only; no ${GOLD_UT_ENTRY.tf} flip, no SL).`,
    `Study window used for warmup: ${full.from?.slice(0, 10) ?? '—'} → ${full.to?.slice(0, 10) ?? '—'}.`,
    ...Object.entries(mix).map(
      ([k, n]) => `Exit mix: ${exitReasonLabel(k)} ×${n}.`
    ),
  ];

  const calc = [
    `Trades: ${trades.length}`,
    `Wins / Losses: ${wins} / ${losses} (${winRate}% win rate)`,
    `Gross P&L: $${gross.toFixed(2)}`,
    `Cost (@ $${cost}/trade): $${brokerage.toFixed(2)}`,
    `Net P&L: $${net.toFixed(2)}`,
    `Avg win: $${avgWin.toFixed(2)} | Avg loss: $${avgLoss.toFixed(2)}`,
  ];

  const tradeBlocks = trades.map((t, i) => [
    `Trade ${i + 1} — ${t.side}`,
    `Open ${istHm(t.openedAt)} → close ${istHm(t.closedAt)} (${t.barsHeld}×${GOLD_UT_ENTRY.tf} bars)`,
    `Price in ${t.entryPrice.toFixed(2)} → out ${t.exitPrice.toFixed(2)}`,
    `Exit: ${exitReasonLabel(t.exitReason)}`,
    `Gross $${t.grossPnl.toFixed(2)} | Cost $${cost} | Net $${t.netPnl.toFixed(2)}`,
    `Path: MFE +$${t.mfe.toFixed(2)} · MAE −$${t.mae.toFixed(2)}`,
  ]);

  const deskSummary =
    trades.length === 0
      ? [
          `Quiet study day — no aligned ${GOLD_UT_ENTRY.tf}+${GOLD_UT_HTF.tf} edges (BOTS idea).`,
        ]
      : net >= 0
        ? ['Positive study day under BOTS/NexusPulse gold mapping.']
        : [`Negative study day — review ${GOLD_UT_ENTRY.tf}/${GOLD_UT_HTF.tf} Sector 7 timing on gold.`];

  const suggestions = [
    'Gold Sector 7 Max: 30m-only exit, 5/day, UTC 7–21 entries, min $10 15m range.',
    `Cost model $${cost}/round trip on every closed trade.`,
    'Not every calendar day will be green — aim for positive range over weeks.',
  ];

  return { opening, market, calc, tradeBlocks, deskSummary, suggestions };
}

export async function runGoldStudyForDate(
  date: string,
  strategyId: GoldStrategyId = 'v12_max'
): Promise<GoldStudyReportMeta> {
  return runGoldRangeStudyReport(date, date, strategyId);
}

function buildAndPersistGoldRangeReport(
  fromDate: string,
  toDate: string,
  full: GoldBacktestResult,
  strategyId: GoldStrategyId,
  opts?: { detailed?: boolean }
): GoldStudyReportMeta {
  const strat = getGoldStrategy(strategyId);
  const cost = strat.params.roundTripCostUsd;
  const sliced = sliceGoldBacktestByOpenDateRange(full, fromDate, toDate);
  const isSingleDay = fromDate === toDate;
  const reportDate = opts?.detailed
    ? goldStrategyReportKey(strategyId, fromDate, toDate)
    : isSingleDay
      ? fromDate
      : goldStudyRangeId(fromDate, toDate);
  const periodLabel = rangePeriodLabel(fromDate, toDate);

  const meta = metaFromFullRun(sliced, sliced.trades, {
    date: reportDate,
    title: opts?.detailed
      ? `${strat.title} — detailed ${periodLabel}`
      : isSingleDay
        ? `${strat.badge} study day — ${fromDate}`
        : `${strat.badge} study — ${periodLabel}`,
    reportKind: opts?.detailed ? 'detailed_strategy' : isSingleDay ? 'day' : 'range_study',
    periodLabel,
    costUsd: cost,
    strategyId,
  });
  meta.studyRange = { from: fromDate, to: toDate };
  meta.studyWindow = { from: full.from, to: full.to };
  meta.dailyDetails = buildDailyDetails(sliced.trades, cost);
  meta.sections.deskSummary = [
    `Strategy: ${strat.title}`,
    strat.description,
    `Yahoo sample bars: ${full.barsEntry}×${GOLD_UT_ENTRY.tf}, ${full.barsHtf}×${GOLD_UT_HTF.tf}.`,
    `Range max drawdown $${sliced.maxDrawdown.toFixed(0)}. Open-day coverage ${sliced.dayCoveragePct}%.`,
    `${meta.dailyDetails.length} day(s) with trades in selected range.`,
  ];
  return meta;
}

async function runGoldBacktestForStrategy(strategyId: GoldStrategyId) {
  const data = await fetchGoldPulseCandles();
  if (!data.ok) throw new Error(data.error);
  const full = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params: { ...goldStrategyParams(strategyId) },
  });
  return full;
}

/** Replay trades whose **open** (UTC day) is between fromDate and toDate inclusive. */
export async function runGoldRangeStudyReport(
  fromDate: string,
  toDate: string,
  strategyId: GoldStrategyId = 'v12_max'
): Promise<GoldStudyReportMeta> {
  if (!isValidGoldStudyDay(fromDate) || !isValidGoldStudyDay(toDate)) {
    throw new Error('Invalid date — use YYYY-MM-DD');
  }
  if (fromDate > toDate) {
    throw new Error('Start date must be on or before end date');
  }
  if (!isGoldStrategyId(strategyId)) {
    throw new Error('Invalid strategyId');
  }

  const full = await runGoldBacktestForStrategy(strategyId);
  const meta = buildAndPersistGoldRangeReport(fromDate, toDate, full, strategyId);
  await persistReport(meta);
  return meta;
}

/** Full trade list grouped by day for one strategy + date range. */
export async function runGoldStrategyDetailedReport(
  strategyId: GoldStrategyId,
  fromDate: string,
  toDate: string
): Promise<GoldStudyReportMeta> {
  if (!isGoldStrategyId(strategyId)) throw new Error('Invalid strategyId');
  if (!isValidGoldStudyDay(fromDate) || !isValidGoldStudyDay(toDate)) {
    throw new Error('Invalid date — use YYYY-MM-DD');
  }
  if (fromDate > toDate) throw new Error('Start date must be on or before end date');

  const full = await runGoldBacktestForStrategy(strategyId);
  const meta = buildAndPersistGoldRangeReport(fromDate, toDate, full, strategyId, {
    detailed: true,
  });
  await persistReport(meta);
  return meta;
}

function metaFromFullRun(
  full: GoldBacktestResult,
  trades: GoldBacktestTrade[],
  opts: {
    date: string;
    title: string;
    reportKind: GoldStudyReportMeta['reportKind'];
    periodLabel: string;
    costUsd: number;
    strategyId?: GoldStrategyId;
  }
): GoldStudyReportMeta {
  const sections = buildSections(opts.periodLabel, trades, full, opts.costUsd);
  const cost = opts.costUsd;
  const nets = trades.map((t) => t.netPnl);
  const gross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const wins = nets.filter((n) => n >= 0).length;
  const losses = nets.length - wins;
  const winN = nets.filter((n) => n >= 0);
  const lossN = nets.filter((n) => n < 0);

  return {
    agent: GOLD_PULSE_NAME as 'GoldPulse',
    date: opts.date,
    title: opts.title,
    generatedAt: new Date().toISOString(),
    reportSource: 'yahoo_study_replay',
    reportKind: opts.reportKind,
    strategyId: opts.strategyId,
    version: GOLD_PULSE_VERSION,
    summary: {
      tradeCount: trades.length,
      wins,
      losses,
      winRate: trades.length ? Math.round((1000 * wins) / trades.length) / 10 : 0,
      gross: Math.round(gross * 100) / 100,
      brokerage: Math.round(trades.length * cost * 100) / 100,
      netAfterCost: Math.round(net * 100) / 100,
      avgWin: winN.length
        ? Math.round((winN.reduce((a, b) => a + b, 0) / winN.length) * 100) / 100
        : 0,
      avgLoss: lossN.length
        ? Math.round((lossN.reduce((a, b) => a + b, 0) / lossN.length) * 100) / 100
        : 0,
      maxDrawdown: full.maxDrawdown,
    },
    sections,
    simpleStory: [
      ...sections.opening,
      ...sections.market.slice(0, 3),
      ...sections.calc.slice(0, 4),
      ...sections.deskSummary,
    ],
    studyWindow: { from: full.from, to: full.to },
  };
}

async function persistReport(meta: GoldStudyReportMeta): Promise<void> {
  const fileName = reportStorageFile(meta);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, fileName), JSON.stringify(meta, null, 2), 'utf8');

  let index: { updatedAt: string; reports: GoldStudyReportMeta[] } = {
    updatedAt: meta.generatedAt,
    reports: [],
  };
  try {
    index = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8')) as typeof index;
  } catch {
    /* new */
  }
  index.reports = [
    ...index.reports.filter((r) => r.date !== meta.date),
    meta,
  ].sort((a, b) => b.date.localeCompare(a.date));
  index.updatedAt = meta.generatedAt;
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

/** Full Yahoo window using start/end = first/last bar day in sample. */
export async function runGoldEndStudyReport(
  strategyId: GoldStrategyId = 'v12_max'
): Promise<GoldStudyReportMeta> {
  const full = await runGoldBacktestForStrategy(strategyId);
  const fromDate = full.from?.slice(0, 10);
  const toDate = full.to?.slice(0, 10);
  if (!fromDate || !toDate) throw new Error('Yahoo returned no candle window');

  const meta = buildAndPersistGoldRangeReport(fromDate, toDate, full, strategyId);
  await persistReport(meta);
  return meta;
}

export async function loadGoldEndStudyReport(): Promise<GoldStudyReportMeta | null> {
  try {
    const raw = await fs.readFile(END_STUDY_PATH, 'utf8');
    return JSON.parse(raw) as GoldStudyReportMeta;
  } catch {
    const list = await listGoldStudyReports();
    return list.find((r) => r.date === GOLD_END_STUDY_DATE) ?? null;
  }
}

export async function listGoldStudyReports(): Promise<GoldStudyReportMeta[]> {
  try {
    const index = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8')) as {
      reports?: GoldStudyReportMeta[];
    };
    return index.reports || [];
  } catch {
    return [];
  }
}

export async function loadGoldStudyReport(date: string): Promise<GoldStudyReportMeta | null> {
  const paths = [
    path.join(OUT_DIR, `GoldPulse-Day-${date}.meta.json`),
    path.join(OUT_DIR, `GoldPulse-Range-${date}.meta.json`),
    path.join(OUT_DIR, `GoldPulse-Detailed-${date}.meta.json`),
    END_STUDY_PATH,
  ];
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      return JSON.parse(raw) as GoldStudyReportMeta;
    } catch {
      /* try next */
    }
  }
  const list = await listGoldStudyReports();
  return list.find((r) => r.date === date) ?? null;
}

export async function removeGoldStudyReport(date: string): Promise<{ ok: boolean }> {
  const paths = [
    path.join(OUT_DIR, `GoldPulse-Day-${date}.meta.json`),
    path.join(OUT_DIR, `GoldPulse-Range-${date}.meta.json`),
    path.join(OUT_DIR, `GoldPulse-Detailed-${date}.meta.json`),
  ];
  if (date === GOLD_END_STUDY_DATE) paths.push(END_STUDY_PATH);
  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      /* ok */
    }
  }
  const list = (await listGoldStudyReports()).filter((r) => r.date !== date);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    INDEX_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), reports: list }, null, 2),
    'utf8'
  );
  return { ok: true };
}
