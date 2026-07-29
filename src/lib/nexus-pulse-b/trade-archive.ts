/**
 * Date-wise NexusPulse Sector 7 B trade archive (paper + live).
 */

import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir, isServerlessDataHost } from '@/lib/app-data-dir';
import type { NexusPaperTrade } from '@/lib/nexus-pulse-b/types';

export type NexusBTradeMode = 'paper' | 'live';

export type NexusBArchivedTrade = NexusPaperTrade & {
  sessionDate: string;
  mode: NexusBTradeMode;
  archivedAt: string;
};

type DayFile = {
  date: string;
  mode: NexusBTradeMode;
  updatedAt: string;
  trades: NexusBArchivedTrade[];
};

function tradesRoot(): string {
  return path.join(getAppDataDir(), 'nexus-pulse-b', 'trades');
}

function dayPath(mode: NexusBTradeMode, date: string): string {
  return path.join(tradesRoot(), mode, `${date}.json`);
}

async function ensureDirs(mode: NexusBTradeMode) {
  await ensureAppDataDir();
  await fs.mkdir(path.join(tradesRoot(), mode), { recursive: true });
}

async function loadDay(mode: NexusBTradeMode, date: string): Promise<DayFile> {
  await ensureDirs(mode);
  try {
    const raw = await fs.readFile(dayPath(mode, date), 'utf8');
    return JSON.parse(raw) as DayFile;
  } catch {
    return { date, mode, updatedAt: new Date().toISOString(), trades: [] };
  }
}

async function saveDay(file: DayFile): Promise<void> {
  await ensureDirs(file.mode);
  const next = { ...file, updatedAt: new Date().toISOString() };
  await fs.writeFile(dayPath(file.mode, file.date), JSON.stringify(next, null, 2), 'utf8');
  if (isServerlessDataHost()) {
    const { upsertNexusBTradeDayToCloud } = await import('@/lib/nexus-pulse-b/nexus-cloud-store');
    await upsertNexusBTradeDayToCloud(file.mode, file.date, next).catch(() => undefined);
  }
}

export async function clearNexusBArchiveDay(
  mode: NexusBTradeMode,
  date: string
): Promise<void> {
  await saveDay({ date, mode, updatedAt: new Date().toISOString(), trades: [] });
}

export async function archiveNexusBClosedTrades(opts: {
  sessionDate: string;
  mode: NexusBTradeMode;
  trades: NexusPaperTrade[];
}): Promise<number> {
  const closed = opts.trades.filter((t) => t.status === 'closed');
  if (!closed.length) return 0;
  const day = await loadDay(opts.mode, opts.sessionDate);
  const byId = new Map(day.trades.map((t) => [t.id, t]));
  let added = 0;
  for (const t of closed) {
    const row: NexusBArchivedTrade = {
      ...t,
      sessionDate: opts.sessionDate,
      mode: opts.mode,
      archivedAt: new Date().toISOString(),
    };
    if (!byId.has(t.id)) added += 1;
    byId.set(t.id, row);
  }
  day.trades = [...byId.values()].sort((a, b) =>
    String(a.openedAt).localeCompare(String(b.openedAt))
  );
  await saveDay(day);
  void import('@/lib/nexus-pulse-b/nexus-cloud-store').then((m) =>
    m.syncNexusBTradeDayToCloud(opts.mode, opts.sessionDate)
  );
  return added;
}

export async function listNexusBArchiveDates(mode: NexusBTradeMode): Promise<string[]> {
  await ensureDirs(mode);
  const local: string[] = [];
  try {
    const names = await fs.readdir(path.join(tradesRoot(), mode));
    local.push(
      ...names
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
        .map((n) => n.replace(/\.json$/, ''))
    );
  } catch {
    /* empty */
  }
  const cloud = await import('@/lib/nexus-pulse-b/nexus-cloud-store').then((m) =>
    m.listNexusBTradeDatesFromCloud(mode)
  );
  return [...new Set([...local, ...cloud])].sort().reverse();
}

export async function loadNexusBArchiveDay(
  mode: NexusBTradeMode,
  date: string
): Promise<DayFile> {
  const local = await loadDay(mode, date);
  if (local.trades.length > 0) return local;
  const cloud = await import('@/lib/nexus-pulse-b/nexus-cloud-store').then((m) =>
    m.loadNexusBTradeDayFromCloud(mode, date)
  );
  if (cloud && Array.isArray(cloud.trades)) {
    return cloud as DayFile;
  }
  return local;
}

/** Paper/live closed trades for a day (for desk history hydration). */
export async function loadNexusBClosedTradesForDay(
  mode: NexusBTradeMode,
  date: string
): Promise<NexusPaperTrade[]> {
  const day = await loadNexusBArchiveDay(mode, date);
  return day.trades
    .filter((t) => t.status === 'closed')
    .map((t) => {
      const { sessionDate: _sd, mode: _mode, archivedAt: _at, ...trade } = t;
      return trade as NexusPaperTrade;
    });
}

/** Merge archive into session closed list by id (session wins on conflict). */
export function mergeNexusBClosedTrades(
  sessionClosed: NexusPaperTrade[],
  archivedClosed: NexusPaperTrade[]
): NexusPaperTrade[] {
  const byId = new Map(sessionClosed.map((t) => [t.id, t]));
  for (const t of archivedClosed) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) =>
    String(a.openedAt || '').localeCompare(String(b.openedAt || ''))
  );
}
