/**
 * NexusPulse cloud vault — trades (user_kv) + daily PDFs (Supabase Storage).
 * Local `.data/` remains the live desk; cloud is the durable copy for Vercel/admin.
 */

import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  findNexusAdminUserId,
  readNexusAdminKv,
  upsertNexusAdminKv,
} from '@/lib/nexus-pulse/nexus-admin-kv';
import type { NexusTradeMode } from '@/lib/nexus-pulse/trade-archive';
import type { NexusDailyReportMeta } from '@/lib/nexus-pulse/daily-report-store';
import type { NexusStrategyNoteDoc, NexusStrategyVault } from '@/lib/nexus-pulse/strategy-note';

export const NEXUS_STORAGE_BUCKET = 'nexus-pulse';

export const KV = {
  dailyReports: 'nexus_pulse_daily_reports_v1',
  tradeIndex: 'nexus_pulse_trade_index_v1',
  strategyPack: 'nexus_pulse_strategy_pack_v1',
} as const;

export function tradeDayKvKey(mode: NexusTradeMode, date: string): string {
  return `nexus_pulse_trades_${mode}_${date}`;
}

export function dailyPdfStoragePath(date: string): string {
  return `reports/daily/NexusPulse-Day-${date}.pdf`;
}

export function dailyMetaStoragePath(date: string): string {
  return `reports/daily/NexusPulse-Day-${date}.meta.json`;
}

type TradeIndex = { paper: string[]; live: string[]; updatedAt: string };

type StrategyPack = {
  vault: NexusStrategyVault;
  note: NexusStrategyNoteDoc;
  updatedAt: string;
};

const TRADES_ROOT = path.join(process.cwd(), '.data', 'nexus-pulse', 'trades');
const DAILY_DIR = path.join(process.cwd(), '.data', 'nexus-pulse', 'reports', 'daily');
const STRATEGY_VAULT = path.join(process.cwd(), '.data', 'nexus-pulse-strategy-vault.json');
const STRATEGY_NOTE = path.join(process.cwd(), '.data', 'nexus-pulse-strategy-note.json');

async function readTradeIndex(): Promise<TradeIndex> {
  const fromCloud = await readNexusAdminKv<TradeIndex>(KV.tradeIndex);
  if (fromCloud?.paper || fromCloud?.live) {
    return {
      paper: fromCloud.paper || [],
      live: fromCloud.live || [],
      updatedAt: fromCloud.updatedAt || new Date().toISOString(),
    };
  }
  return { paper: [], live: [], updatedAt: new Date().toISOString() };
}

async function bumpTradeIndex(mode: NexusTradeMode, date: string): Promise<void> {
  const idx = await readTradeIndex();
  const list = new Set(idx[mode]);
  list.add(date);
  const next: TradeIndex = {
    ...idx,
    [mode]: [...list].sort().reverse(),
    updatedAt: new Date().toISOString(),
  };
  await upsertNexusAdminKv(KV.tradeIndex, next);
}

/** Push one day's trade archive JSON to user_kv. */
export async function syncTradeDayToCloud(
  mode: NexusTradeMode,
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
  const up = await upsertNexusAdminKv(tradeDayKvKey(mode, date), parsed);
  if (up.ok) await bumpTradeIndex(mode, date);
  return up;
}

/** Load trade day from cloud when local disk is empty (e.g. Vercel). */
export async function loadTradeDayFromCloud(
  mode: NexusTradeMode,
  date: string
): Promise<Record<string, unknown> | null> {
  return readNexusAdminKv<Record<string, unknown>>(tradeDayKvKey(mode, date));
}

export async function listTradeDatesFromCloud(mode: NexusTradeMode): Promise<string[]> {
  const idx = await readTradeIndex();
  return idx[mode] || [];
}

/** Upload daily PDF bytes to Supabase Storage. */
export async function uploadDailyPdfToCloud(date: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  const local = path.join(DAILY_DIR, `NexusPulse-Day-${date}.pdf`);
  let buf: Buffer;
  try {
    buf = await fs.readFile(local);
  } catch {
    return { ok: false, error: `PDF not found locally for ${date}` };
  }

  const objectPath = dailyPdfStoragePath(date);
  const { error } = await sb.storage.from(NEXUS_STORAGE_BUCKET).upload(objectPath, buf, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Read PDF from local disk or Supabase Storage. */
export async function readDailyPdfBytes(date: string): Promise<Buffer | null> {
  const local = path.join(DAILY_DIR, `NexusPulse-Day-${date}.pdf`);
  try {
    return await fs.readFile(local);
  } catch {
    /* try cloud */
  }

  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.storage
    .from(NEXUS_STORAGE_BUCKET)
    .download(dailyPdfStoragePath(date));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function syncStrategyPackToCloud(): Promise<{ ok: boolean; error?: string }> {
  try {
    const vault = JSON.parse(await fs.readFile(STRATEGY_VAULT, 'utf8')) as NexusStrategyVault;
    const note = JSON.parse(await fs.readFile(STRATEGY_NOTE, 'utf8')) as NexusStrategyNoteDoc;
    const pack: StrategyPack = {
      vault,
      note,
      updatedAt: new Date().toISOString(),
    };
    return upsertNexusAdminKv(KV.strategyPack, pack);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'strategy files missing';
    return { ok: false, error: msg };
  }
}

export async function loadStrategyPackFromCloud(): Promise<StrategyPack | null> {
  return readNexusAdminKv<StrategyPack>(KV.strategyPack);
}

/** Full push: all local trade days, PDFs, strategy, daily index (reports list). */
export async function syncAllNexusPulseToCloud(opts?: {
  reports?: NexusDailyReportMeta[];
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

  for (const mode of ['paper', 'live'] as NexusTradeMode[]) {
    let dates: string[] = [];
    try {
      const names = await fs.readdir(path.join(TRADES_ROOT, mode));
      dates = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => n.replace('.json', ''));
    } catch {
      /* no folder */
    }
    for (const date of dates) {
      const r = await syncTradeDayToCloud(mode, date);
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
        reports?: NexusDailyReportMeta[];
      };
      reportDates = (idx.reports || []).map((r) => r.date);
    } catch {
      const cloud = await readNexusAdminKv<{ reports?: NexusDailyReportMeta[] }>(KV.dailyReports);
      reportDates = (cloud?.reports || []).map((r) => r.date);
    }
  }

  for (const date of reportDates) {
    const r = await uploadDailyPdfToCloud(date);
    if (r.ok) pdfsOk += 1;
    else {
      pdfsFail += 1;
      if (r.error) errors.push(`pdf/${date}: ${r.error}`);
    }
  }

  const strat = await syncStrategyPackToCloud();
  if (!strat.ok && strat.error && !strat.error.includes('missing')) {
    errors.push(`strategy: ${strat.error}`);
  }

  return {
    ok: errors.length === 0 || tradesOk + pdfsOk > 0,
    trades: { ok: tradesOk, fail: tradesFail },
    pdfs: { ok: pdfsOk, fail: pdfsFail },
    errors: errors.slice(0, 20),
  };
}

/** Ensure storage bucket exists (service role only). */
export async function ensureNexusStorageBucket(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b) => b.name === NEXUS_STORAGE_BUCKET || b.id === NEXUS_STORAGE_BUCKET)) {
    return { ok: true };
  }
  const { error } = await sb.storage.createBucket(NEXUS_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function isNexusCloudConfigured(): Promise<boolean> {
  return Boolean(getSupabaseAdmin() && (await findNexusAdminUserId()));
}
