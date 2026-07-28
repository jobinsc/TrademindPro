/**
 * NexusPulse daily report index + Supabase sync (admin desk database).
 */

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import type { NexusLaneId } from '@/lib/nexus-pulse/rules';
import { readNexusAdminKv, upsertNexusAdminKv } from '@/lib/nexus-pulse/nexus-admin-kv';
import {
  KV,
  uploadDailyPdfToCloud,
} from '@/lib/nexus-pulse/nexus-cloud-store';

export type NexusDailyReportMeta = {
  agent: 'NexusPulse';
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
      NexusLaneId,
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

export type NexusDailyIndex = {
  updatedAt: string;
  reports: NexusDailyReportMeta[];
};

const ROOT = process.cwd();
const DAILY_DIR = path.join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily');
const INDEX_PATH = path.join(DAILY_DIR, 'index.json');
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
  return path.join(DAILY_DIR, `NexusPulse-Day-${date}.pdf`);
}

export function dailyMetaPath(date: string): string {
  return path.join(DAILY_DIR, `NexusPulse-Day-${date}.meta.json`);
}

export async function loadDailyReportMeta(date: string): Promise<NexusDailyReportMeta | null> {
  try {
    const raw = await fs.readFile(dailyMetaPath(date), 'utf8');
    return JSON.parse(raw) as NexusDailyReportMeta;
  } catch {
    /* fall through */
  }
  const index = await loadDailyIndex();
  const fromIndex = index.reports.find((r) => r.date === date);
  if (fromIndex?.sections) return fromIndex;
  const cloud = await readNexusAdminKv<{ reports?: NexusDailyReportMeta[] }>(DB_KEY);
  return cloud?.reports?.find((r) => r.date === date) ?? fromIndex ?? null;
}

export async function loadDailyIndex(): Promise<NexusDailyIndex> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    return JSON.parse(raw) as NexusDailyIndex;
  } catch {
    return { updatedAt: new Date().toISOString(), reports: [] };
  }
}

async function saveDailyIndex(index: NexusDailyIndex): Promise<void> {
  await fs.mkdir(DAILY_DIR, { recursive: true });
  const next = { ...index, updatedAt: new Date().toISOString() };
  await fs.writeFile(INDEX_PATH, JSON.stringify(next, null, 2), 'utf8');
}

export async function upsertDailyReportMeta(meta: NexusDailyReportMeta): Promise<void> {
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
  await fs.mkdir(DAILY_DIR, { recursive: true });
  const candidates = [
    dailyPdfPath(date),
    dailyMetaPath(date),
    path.join(DAILY_DIR, `NexusPulse-Day-${date}-updated.pdf`),
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

  const { deleteDailyPdfFromCloud } = await import('@/lib/nexus-pulse/nexus-cloud-store');
  await deleteDailyPdfFromCloud(date).catch(() => undefined);

  return { ok: true };
}

/** Run Python generator for one IST calendar date. */
export function generateNexusDailyReportSync(date: string): {
  ok: boolean;
  meta?: NexusDailyReportMeta;
  error?: string;
} {
  const py = pythonCmd();
  if (!py) return { ok: false, error: 'Python not found (need py/python + fpdf)' };
  const script = path.join(ROOT, 'scripts', 'generate-nexus-daily-report.py');
  const r = spawnSync(py.cmd, [...py.prefix, script, date], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    return { ok: false, error: out.slice(0, 400) || `exit ${r.status}` };
  }
  try {
    const line = out.split('\n').filter(Boolean).pop() || '{}';
    const parsed = JSON.parse(line) as NexusDailyReportMeta & { ok?: boolean; error?: string };
    if (parsed.ok === false) return { ok: false, error: parsed.error || 'generate failed' };
    const { ok: _o, error: _e, ...meta } = parsed as NexusDailyReportMeta & {
      ok?: boolean;
      error?: string;
    };
    return { ok: true, meta: meta as NexusDailyReportMeta };
  } catch {
    return { ok: false, error: `Bad generator output: ${out.slice(0, 200)}` };
  }
}

export async function generateNexusDailyReport(
  date: string,
  accessToken?: string,
  activeLanes?: NexusLaneId[]
): Promise<{
  ok: boolean;
  meta?: NexusDailyReportMeta;
  error?: string;
}> {
  const { generateNexusDailyReportNode } = await import('@/lib/nexus-pulse/daily-report-generate');
  return generateNexusDailyReportNode({ date, accessToken, activeLanes });
}

/** Mirror date-wise report list to Supabase user_kv (admin desk database). */
export async function syncDailyReportsToDatabase(
  reports: NexusDailyReportMeta[]
): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    agent: 'NexusPulse',
    updatedAt: new Date().toISOString(),
    reports,
  };
  return upsertNexusAdminKv(DB_KEY, payload);
}

export async function listDailyReports(): Promise<NexusDailyReportMeta[]> {
  const index = await loadDailyIndex();
  if (index.reports.length > 0) return index.reports;
  const cloud = await readNexusAdminKv<{ reports?: NexusDailyReportMeta[] }>(DB_KEY);
  return cloud?.reports || [];
}
