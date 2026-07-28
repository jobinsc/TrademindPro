/**
 * NexusPulse Sector 7 B cloud vault — trades + daily PDFs + strategy (isolated from A).
 */

import fs from 'fs/promises';
import path from 'path';
import { getAppDataDir } from '@/lib/app-data-dir';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  findNexusAdminUserId,
  readNexusAdminKv,
  upsertNexusAdminKv,
} from '@/lib/nexus-pulse/nexus-admin-kv';
import type { NexusBTradeMode } from '@/lib/nexus-pulse-b/trade-archive';
import type { NexusBDailyReportMeta } from '@/lib/nexus-pulse-b/daily-report-store';
import type { NexusStrategyNoteDoc, NexusStrategyVault } from '@/lib/nexus-pulse-b/strategy-note';

/** Reuse same bucket; isolate with B object prefix + B KV keys. */
export const NEXUS_B_STORAGE_BUCKET = 'nexus-pulse';

export const KV_B = {
  dailyReports: 'nexus_pulse_b_daily_reports_v1',
  tradeIndex: 'nexus_pulse_b_trade_index_v1',
  strategyPack: 'nexus_pulse_b_strategy_pack_v1',
} as const;

export function nexusBTradeDayKvKey(mode: NexusBTradeMode, date: string): string {
  return `nexus_pulse_b_trades_${mode}_${date}`;
}

export function nexusBDailyPdfStoragePath(date: string): string {
  return `reports/daily-b/NexusPulseB-Day-${date}.pdf`;
}

export function nexusBDailyMetaStoragePath(date: string): string {
  return `reports/daily-b/NexusPulseB-Day-${date}.meta.json`;
}

type TradeIndex = { paper: string[]; live: string[]; updatedAt: string };

type StrategyPack = {
  vault: NexusStrategyVault;
  note: NexusStrategyNoteDoc;
  updatedAt: string;
};

const TRADES_ROOT = path.join(getAppDataDir(), 'nexus-pulse-b', 'trades');
const DAILY_DIR = path.join(getAppDataDir(), 'nexus-pulse-b', 'reports', 'daily');
const STRATEGY_VAULT = path.join(getAppDataDir(), 'nexus-pulse-b-strategy-vault.json');
const STRATEGY_NOTE = path.join(getAppDataDir(), 'nexus-pulse-b-strategy-note.json');

async function readTradeIndex(): Promise<TradeIndex> {
  const fromCloud = await readNexusAdminKv<TradeIndex>(KV_B.tradeIndex);
  if (fromCloud?.paper || fromCloud?.live) {
    return {
      paper: fromCloud.paper || [],
      live: fromCloud.live || [],
      updatedAt: fromCloud.updatedAt || new Date().toISOString(),
    };
  }
  return { paper: [], live: [], updatedAt: new Date().toISOString() };
}

async function bumpTradeIndex(mode: NexusBTradeMode, date: string): Promise<void> {
  const idx = await readTradeIndex();
  const list = new Set(idx[mode]);
  list.add(date);
  const next: TradeIndex = {
    ...idx,
    [mode]: [...list].sort().reverse(),
    updatedAt: new Date().toISOString(),
  };
  await upsertNexusAdminKv(KV_B.tradeIndex, next);
}

export async function upsertNexusBTradeDayToCloud(
  mode: NexusBTradeMode,
  date: string,
  payload: unknown
): Promise<{ ok: boolean; error?: string }> {
  const up = await upsertNexusAdminKv(nexusBTradeDayKvKey(mode, date), payload as object);
  if (up.ok) await bumpTradeIndex(mode, date);
  return up;
}

export async function syncNexusBTradeDayToCloud(
  mode: NexusBTradeMode,
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const file = path.join(TRADES_ROOT, mode, `${date}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { ok: false, error: `Missing local file ${file}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid trade JSON' };
  }
  return upsertNexusBTradeDayToCloud(mode, date, parsed);
}

export async function loadNexusBTradeDayFromCloud(
  mode: NexusBTradeMode,
  date: string
): Promise<Record<string, unknown> | null> {
  return readNexusAdminKv<Record<string, unknown>>(nexusBTradeDayKvKey(mode, date));
}

export async function listNexusBTradeDatesFromCloud(mode: NexusBTradeMode): Promise<string[]> {
  const idx = await readTradeIndex();
  return idx[mode] || [];
}

export async function deleteNexusBDailyPdfFromCloud(
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const paths = [nexusBDailyPdfStoragePath(date), nexusBDailyMetaStoragePath(date)];
  const { error } = await sb.storage.from(NEXUS_B_STORAGE_BUCKET).remove(paths);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function uploadNexusBDailyPdfToCloud(
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const local = path.join(DAILY_DIR, `NexusPulseB-Day-${date}.pdf`);
  let buf: Buffer;
  try {
    buf = await fs.readFile(local);
  } catch {
    return { ok: false, error: `PDF not found locally for ${date}` };
  }
  const { error } = await sb.storage
    .from(NEXUS_B_STORAGE_BUCKET)
    .upload(nexusBDailyPdfStoragePath(date), buf, {
      upsert: true,
      contentType: 'application/pdf',
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function readNexusBDailyPdfBytes(date: string): Promise<Buffer | null> {
  const local = path.join(DAILY_DIR, `NexusPulseB-Day-${date}.pdf`);
  try {
    return await fs.readFile(local);
  } catch {
    /* try cloud */
  }
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.storage
    .from(NEXUS_B_STORAGE_BUCKET)
    .download(nexusBDailyPdfStoragePath(date));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function syncNexusBStrategyPackToCloud(): Promise<{ ok: boolean; error?: string }> {
  try {
    const vault = JSON.parse(await fs.readFile(STRATEGY_VAULT, 'utf8')) as NexusStrategyVault;
    const note = JSON.parse(await fs.readFile(STRATEGY_NOTE, 'utf8')) as NexusStrategyNoteDoc;
    const pack: StrategyPack = { vault, note, updatedAt: new Date().toISOString() };
    return upsertNexusAdminKv(KV_B.strategyPack, pack);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'strategy files missing';
    return { ok: false, error: msg };
  }
}

export async function loadNexusBStrategyPackFromCloud(): Promise<StrategyPack | null> {
  return readNexusAdminKv<StrategyPack>(KV_B.strategyPack);
}

export async function syncAllNexusPulseBToCloud(opts?: {
  reports?: NexusBDailyReportMeta[];
}): Promise<{
  ok: boolean;
  trades: { ok: number; fail: number };
  pdfs: { ok: number; fail: number };
  errors: string[];
}> {
  const errors: string[] = [];
  let tradesOk = 0;
  let tradesFail = 0;
  let pdfsOk = 0;
  let pdfsFail = 0;

  for (const mode of ['paper', 'live'] as NexusBTradeMode[]) {
    let dates: string[] = [];
    try {
      const names = await fs.readdir(path.join(TRADES_ROOT, mode));
      dates = names
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
        .map((n) => n.replace('.json', ''));
    } catch {
      /* no folder */
    }
    for (const date of dates) {
      const r = await syncNexusBTradeDayToCloud(mode, date);
      if (r.ok) tradesOk += 1;
      else {
        tradesFail += 1;
        if (r.error) errors.push(`${mode}/${date}: ${r.error}`);
      }
    }
  }

  let reportDates: string[] = [];
  if (opts?.reports?.length) {
    reportDates = opts.reports.map((r) => r.date);
  } else {
    try {
      const idx = JSON.parse(await fs.readFile(path.join(DAILY_DIR, 'index.json'), 'utf8')) as {
        reports?: NexusBDailyReportMeta[];
      };
      reportDates = (idx.reports || []).map((r) => r.date);
    } catch {
      const cloud = await readNexusAdminKv<{ reports?: NexusBDailyReportMeta[] }>(KV_B.dailyReports);
      reportDates = (cloud?.reports || []).map((r) => r.date);
    }
  }

  for (const date of reportDates) {
    const r = await uploadNexusBDailyPdfToCloud(date);
    if (r.ok) pdfsOk += 1;
    else {
      pdfsFail += 1;
      if (r.error) errors.push(`pdf/${date}: ${r.error}`);
    }
  }

  await syncNexusBStrategyPackToCloud();

  return {
    ok: errors.length === 0 || tradesOk + pdfsOk > 0,
    trades: { ok: tradesOk, fail: tradesFail },
    pdfs: { ok: pdfsOk, fail: pdfsFail },
    errors: errors.slice(0, 20),
  };
}

export async function ensureNexusBStorageBucket(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b) => b.name === NEXUS_B_STORAGE_BUCKET || b.id === NEXUS_B_STORAGE_BUCKET)) {
    return { ok: true };
  }
  const { error } = await sb.storage.createBucket(NEXUS_B_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function isNexusBCloudConfigured(): Promise<boolean> {
  return Boolean(getSupabaseAdmin() && (await findNexusAdminUserId()));
}
