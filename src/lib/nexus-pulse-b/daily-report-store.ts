/**
 * NexusPulse daily report index + Supabase sync (admin desk database).
 */

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import type { NexusBLaneId } from '@/lib/nexus-pulse-b/rules';
import { readNexusAdminKv, upsertNexusAdminKv } from '@/lib/nexus-pulse/nexus-admin-kv';
import {
  KV_B as KV,
  uploadNexusBDailyPdfToCloud as uploadDailyPdfToCloud,
} from '@/lib/nexus-pulse-b/nexus-cloud-store';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';

export type NexusBDailyReportMeta = {
  agent: 'NexusPulseB';
  date: string;
  title: string;
  pdfFile: string;
  pdfPath: string;
  generatedAt: string;
  summary: {
    tradeCount: number;
    wins: number;
    losses: number;
    netAfter70: number;
    laneA: number;
    laneB: number;
    laneANet: number;
    laneBNet: number;
    winRate?: number;
    gross?: number;
    brokerage?: number;
    avgWin?: number;
    avgLoss?: number;
    firstSpot?: number | null;
    lastSpot?: number | null;
    spotMove?: number | null;
    ceCount?: number;
    peCount?: number;
  };
  simpleStory?: string[];
  sections?: {
    opening?: string[];
    market?: string[];
    calc?: string[];
    tradeBlocks?: string[][];
    deskSummary?: string[];
    suggestions?: string[];
    studyByLane?: string[];
  };
  /** Same engine as Real Option Study on NexusPulse main page. */
  reportSource?: 'real_option_replay' | 'paper_desk';
  premiumModel?: string;
  studyByLane?: Partial<
    Record<
      NexusBLaneId,
      {
        totalTrades: number;
        wins: number;
        losses: number;
        winRate: number;
        grossPnl: number;
        netPnl: number;
      }
    >
  >;
};

export type NexusBDailyIndex = {
  updatedAt: string;
  reports: NexusBDailyReportMeta[];
};

function nexusDailyDir(): string {
  return path.join(getAppDataDir(), 'nexus-pulse-b', 'reports', 'daily');
}

function dailyIndexPath(): string {
  return path.join(nexusDailyDir(), 'index.json');
}

const DB_KEY = KV.dailyReports;

function pythonCmd(): { cmd: string; prefix: string[] } | null {
  if (process.platform === 'win32') {
    const py = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (py.status === 0) return { cmd: 'py', prefix: ['-3'] };
  }
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (r.status === 0) return { cmd, prefix: [] };
  }
  return null;
}

export function dailyPdfPath(date: string): string {
  return path.join(nexusDailyDir(), `NexusPulseB-Day-${date}.pdf`);
}

export function dailyMetaPath(date: string): string {
  return path.join(nexusDailyDir(), `NexusPulseB-Day-${date}.meta.json`);
}

export async function loadDailyReportMeta(date: string): Promise<NexusBDailyReportMeta | null> {
  try {
    const raw = await fs.readFile(dailyMetaPath(date), 'utf8');
    return JSON.parse(raw) as NexusBDailyReportMeta;
  } catch {
    /* fall through */
  }
  const index = await loadDailyIndex();
  const fromIndex = index.reports.find((r) => r.date === date);
  if (fromIndex?.sections) return fromIndex;
  const cloud = await readNexusAdminKv<{ reports?: NexusBDailyReportMeta[] }>(DB_KEY);
  return cloud?.reports?.find((r) => r.date === date) ?? fromIndex ?? null;
}

export async function loadDailyIndex(): Promise<NexusBDailyIndex> {
  try {
    const raw = await fs.readFile(dailyIndexPath(), 'utf8');
    const parsed = JSON.parse(raw) as NexusBDailyIndex;
    if (parsed.reports?.length) return parsed;
  } catch {
    /* fall through */
  }
  const cloud = await readNexusAdminKv<{ reports?: NexusBDailyReportMeta[]; updatedAt?: string }>(
    DB_KEY
  );
  if (cloud?.reports?.length) {
    return {
      updatedAt: cloud.updatedAt || new Date().toISOString(),
      reports: cloud.reports,
    };
  }
  return { updatedAt: new Date().toISOString(), reports: [] };
}

async function saveDailyIndex(index: NexusBDailyIndex): Promise<void> {
  await ensureAppDataDir();
  await fs.mkdir(nexusDailyDir(), { recursive: true });
  const next = { ...index, updatedAt: new Date().toISOString() };
  await fs.writeFile(dailyIndexPath(), JSON.stringify(next, null, 2), 'utf8');
}

export async function upsertDailyReportMeta(meta: NexusBDailyReportMeta): Promise<void> {
  const index = await loadDailyIndex();
  const reports = index.reports.filter((r) => r.date !== meta.date);
  reports.push(meta);
  reports.sort((a, b) => b.date.localeCompare(a.date));
  await saveDailyIndex({ updatedAt: new Date().toISOString(), reports });
  await syncDailyReportsToDatabase(reports).catch(() => undefined);
  await uploadDailyPdfToCloud(meta.date).catch(() => undefined);
}

/** Delete local PDF/meta + index row + cloud PDF for one date. */
export async function removeDailyReport(date: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'Invalid date' };
  }
  await ensureAppDataDir();
  await fs.mkdir(nexusDailyDir(), { recursive: true });
  const candidates = [
    dailyPdfPath(date),
    dailyMetaPath(date),
    path.join(nexusDailyDir(), `NexusPulseB-Day-${date}-updated.pdf`),
  ];
  for (const p of candidates) {
    try {
      await fs.unlink(p);
    } catch {
      /* missing is fine */
    }
  }

  const index = await loadDailyIndex();
  const reports = index.reports.filter((r) => r.date !== date);
  await saveDailyIndex({ updatedAt: new Date().toISOString(), reports });
  await syncDailyReportsToDatabase(reports).catch(() => undefined);

  const { deleteNexusBDailyPdfFromCloud } = await import('@/lib/nexus-pulse-b/nexus-cloud-store');
  await deleteNexusBDailyPdfFromCloud(date).catch(() => undefined);

  return { ok: true };
}

/** Run Python generator for one IST calendar date. */
export function generateNexusBDailyReportSync(date: string): {
  ok: boolean;
  meta?: NexusBDailyReportMeta;
  error?: string;
} {
  const py = pythonCmd();
  if (!py) return { ok: false, error: 'Python not found (need py/python + fpdf)' };
  const script = path.join(process.cwd(), 'scripts', 'generate-nexus-daily-report.py');
  const r = spawnSync(py.cmd, [...py.prefix, script, date], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    return { ok: false, error: out.slice(0, 400) || `exit ${r.status}` };
  }
  try {
    const line = out.split('\n').filter(Boolean).pop() || '{}';
    const parsed = JSON.parse(line) as NexusBDailyReportMeta & { ok?: boolean; error?: string };
    if (parsed.ok === false) return { ok: false, error: parsed.error || 'generate failed' };
    const { ok: _o, error: _e, ...meta } = parsed as NexusBDailyReportMeta & {
      ok?: boolean;
      error?: string;
    };
    return { ok: true, meta: meta as NexusBDailyReportMeta };
  } catch {
    return { ok: false, error: `Bad generator output: ${out.slice(0, 200)}` };
  }
}

export async function generateNexusBDailyReport(
  date: string,
  accessToken?: string,
  activeLanes?: NexusBLaneId[]
): Promise<{
  ok: boolean;
  meta?: NexusBDailyReportMeta;
  error?: string;
}> {
  const { generateNexusBDailyReportNode } = await import('@/lib/nexus-pulse-b/daily-report-generate');
  return generateNexusBDailyReportNode({ date, accessToken, activeLanes });
}

/** Mirror date-wise report list to Supabase user_kv (admin desk database). */
export async function syncDailyReportsToDatabase(
  reports: NexusBDailyReportMeta[]
): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    agent: 'NexusPulseB',
    updatedAt: new Date().toISOString(),
    reports,
  };
  return upsertNexusAdminKv(DB_KEY, payload);
}

export async function listDailyReports(): Promise<NexusBDailyReportMeta[]> {
  const index = await loadDailyIndex();
  if (index.reports.length > 0) return index.reports;
  const cloud = await readNexusAdminKv<{ reports?: NexusBDailyReportMeta[] }>(DB_KEY);
  return cloud?.reports || [];
}
