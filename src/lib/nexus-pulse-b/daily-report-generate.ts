/**
 * Generate NexusPulse daily report in Node (no Python required — works on mobile/production).
 */

import fs from 'fs/promises';
import path from 'path';
import {
  buildDailyReportStory,
  metaFromStory,
  type ReportTradeRow,
} from '@/lib/nexus-pulse-b/daily-report-build';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import { dailyMetaPath, dailyPdfPath, type NexusBDailyReportMeta, upsertDailyReportMeta } from '@/lib/nexus-pulse-b/daily-report-store';
import { writeNexusBDailyReportPdf } from '@/lib/nexus-pulse-b/daily-report-pdf';
import { replayNexusBRealOptionsForDay } from '@/lib/nexus-pulse-b/real-option-study';
import type { NexusBLaneId } from '@/lib/nexus-pulse-b/rules';
import { NEXUS_B_LANES } from '@/lib/nexus-pulse-b/rules';
import { loadNexusBSession } from '@/lib/nexus-pulse-b/session-store';
import { archiveNexusBClosedTrades, loadNexusBArchiveDay } from '@/lib/nexus-pulse-b/trade-archive';

async function mergePaperTradesForDate(date: string): Promise<{
  trades: ReportTradeRow[];
  session: Awaited<ReturnType<typeof loadNexusBSession>>;
}> {
  const session = await loadNexusBSession(date);
  if (session?.closedTrades?.length) {
    await archiveNexusBClosedTrades({
      sessionDate: date,
      mode: 'paper',
      trades: session.closedTrades,
    }).catch(() => undefined);
  }

  const archive = await loadNexusBArchiveDay('paper', date);
  const byId = new Map<string, ReportTradeRow>();

  for (const t of archive.trades) {
    if (t.status === 'closed') byId.set(t.id, { ...t, sessionDate: date });
  }

  if (session) {
    for (const t of session.closedTrades ?? []) {
      if (t.status === 'closed') byId.set(t.id, { ...t, sessionDate: date });
    }
    for (const t of session.openTrades ?? []) {
      if (t.status === 'open') {
        byId.set(t.id, { ...t, sessionDate: date, reportOpen: true });
      }
    }
  }

  const trades = [...byId.values()].sort((a, b) =>
    String(a.openedAt).localeCompare(String(b.openedAt))
  );
  return { trades, session };
}

function laneStudyLines(
  byLane: Awaited<ReturnType<typeof replayNexusBRealOptionsForDay>>['byLane']
): string[] {
  const lines: string[] = [];
  for (const id of ['current_bans', 'morning_open_stop_15'] as NexusBLaneId[]) {
    const row = byLane?.[id];
    if (!row || !row.totalTrades) continue;
    const title = NEXUS_B_LANES[id]?.title ?? id;
    lines.push(
      `${title}: ${row.totalTrades} trades, ${row.winRate}% win, gross ₹${Math.round(row.grossPnl).toLocaleString('en-IN')}, net ₹${Math.round(row.netPnl).toLocaleString('en-IN')}`
    );
  }
  return lines;
}

export async function generateNexusBDailyReportNode(opts: {
  date: string;
  accessToken?: string;
  activeLanes?: NexusBLaneId[];
  /** Default: real_option replay when Upstox token present. */
  source?: 'real_option_replay' | 'paper_desk';
}): Promise<{ ok: boolean; meta?: NexusBDailyReportMeta; error?: string }> {
  try {
    return await generateNexusBDailyReportNodeInner(opts);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Daily report generate failed',
    };
  }
}

async function generateNexusBDailyReportNodeInner(opts: {
  date: string;
  accessToken?: string;
  activeLanes?: NexusBLaneId[];
  source?: 'real_option_replay' | 'paper_desk';
}): Promise<{ ok: boolean; meta?: NexusBDailyReportMeta; error?: string }> {
  const date = opts.date.slice(0, 10);
  const session = await loadNexusBSession(date);
  const lanes: NexusBLaneId[] =
    opts.activeLanes?.length
      ? opts.activeLanes
      : session?.settings?.activeLanes?.length
        ? session.settings.activeLanes
        : ['morning_open_stop_15'];

  let trades: ReportTradeRow[] = [];
  let liveNote: string | undefined;
  let reportSource: NexusBDailyReportMeta['reportSource'] = 'paper_desk';
  let premiumModel: string | undefined;
  let studyByLane: NexusBDailyReportMeta['studyByLane'];

  const wantReplay =
    opts.source !== 'paper_desk' && Boolean(opts.accessToken?.trim());

  if (wantReplay) {
    try {
      const replay = await replayNexusBRealOptionsForDay({
        accessToken: opts.accessToken!.trim(),
        date,
        activeLanes: lanes,
      });
      trades = replay.trades.map((t) => ({
        ...t,
        sessionDate: date,
        tradingSymbol: t.tradingSymbol?.includes('NIFTY')
          ? t.tradingSymbol
          : `${t.side} ${t.strike} ATM (replay)`,
      }));
      reportSource = 'real_option_replay';
      premiumModel = replay.premiumModel;
      studyByLane = replay.byLane;
      liveNote =
        `Report source: Real Option Study replay for ${date} (BOTS engine). ` +
        `UT 3m/5m signals, ATM option 1m closes from Upstox, exits = trail / Sector 7 B / SQ — no paper-desk stop loss. ` +
        `Lanes: ${lanes.join(', ')}. Option candle fetches: ${replay.optionFetches}.`;
    } catch (e) {
      const paper = await mergePaperTradesForDate(date);
      trades = paper.trades;
      liveNote = `Replay unavailable (${e instanceof Error ? e.message : 'error'}). Showing paper desk archive instead.`;
      reportSource = 'paper_desk';
    }
  } else {
    const paper = await mergePaperTradesForDate(date);
    trades = paper.trades;
    if (!opts.accessToken?.trim()) {
      liveNote = 'Connect Upstox to generate the Real Option Study replay (same as backtest).';
    }
  }

  const studyByLaneLines = studyByLane ? laneStudyLines(studyByLane) : undefined;
  const built = buildDailyReportStory(date, trades, session, {
    livePremiumsNote: liveNote,
    studyByLaneLines,
  });

  let meta = metaFromStory(date, built, {
    reportSource,
    premiumModel,
    studyByLane,
  });

  const outDir = path.join(getAppDataDir(), 'nexus-pulse-b', 'reports', 'daily');
  await ensureAppDataDir();
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(dailyMetaPath(date), JSON.stringify(meta, null, 2), 'utf8');

  const pdf = await writeNexusBDailyReportPdf(meta, dailyPdfPath(date));
  if (!pdf.ok) {
    return { ok: false, error: pdf.error || 'Could not write PDF (report text saved — use View on phone)' };
  }

  await upsertDailyReportMeta(meta);
  return { ok: true, meta };
}
