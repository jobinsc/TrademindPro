/**
 * NexusPulse daily report index + Supabase sync (admin desk database).
 */

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { getSupabaseAdmin } from '@/lib/supabase/server';

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
  };
  simpleStory?: string[];
};

export type NexusDailyIndex = {
  updatedAt: string;
  reports: NexusDailyReportMeta[];
};

const ROOT = process.cwd();
const DAILY_DIR = path.join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily');
const INDEX_PATH = path.join(DAILY_DIR, 'index.json');
const DB_KEY = 'nexus_pulse_daily_reports_v1';

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

export async function generateNexusDailyReport(date: string): Promise<{
  ok: boolean;
  meta?: NexusDailyReportMeta;
  error?: string;
}> {
  const result = generateNexusDailyReportSync(date);
  if (result.ok && result.meta) {
    await upsertDailyReportMeta(result.meta);
  }
  return result;
}

async function findAdminUserId(): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('profiles')
    .select('id, email, role')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Mirror date-wise report list to Supabase user_kv (admin desk database). */
export async function syncDailyReportsToDatabase(
  reports: NexusDailyReportMeta[]
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const adminId = await findAdminUserId();
  if (!adminId) return { ok: false, error: 'No admin profile for sync' };

  const payload = {
    agent: 'NexusPulse',
    updatedAt: new Date().toISOString(),
    reports,
  };

  const { error } = await sb.from('user_kv').upsert(
    {
      user_id: adminId,
      key: DB_KEY,
      value: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listDailyReports(): Promise<NexusDailyReportMeta[]> {
  const index = await loadDailyIndex();
  return index.reports;
}
