/**
 * Date-wise NexusPulse trade archive (paper + live).
 * Separate from the live session file so history is never lost on overwrite.
 */

import fs from 'fs/promises';
import path from 'path';
import type { NexusPaperTrade } from '@/lib/nexus-pulse/types';

export type NexusTradeMode = 'paper' | 'live';

export type NexusArchivedTrade = NexusPaperTrade & {
  sessionDate: string;
  mode: NexusTradeMode;
  archivedAt: string;
};

type DayFile = {
  date: string;
  mode: NexusTradeMode;
  updatedAt: string;
  trades: NexusArchivedTrade[];
};

const ROOT = path.join(process.cwd(), '.data', 'nexus-pulse', 'trades');

function dayPath(mode: NexusTradeMode, date: string): string {
  return path.join(ROOT, mode, `${date}.json`);
}

async function ensureDirs(mode: NexusTradeMode) {
  await fs.mkdir(path.join(ROOT, mode), { recursive: true });
}

async function loadDay(mode: NexusTradeMode, date: string): Promise<DayFile> {
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
}

export async function clearArchiveDay(
  mode: NexusTradeMode,
  date: string
): Promise<void> {
  await saveDay({ date, mode, updatedAt: new Date().toISOString(), trades: [] });
}

/** Upsert closed trades for a session date into the paper/live archive. */
export async function archiveClosedTrades(opts: {
  sessionDate: string;
  mode: NexusTradeMode;
  trades: NexusPaperTrade[];
}): Promise<number> {
  const closed = opts.trades.filter((t) => t.status === 'closed');
  if (!closed.length) return 0;
  const day = await loadDay(opts.mode, opts.sessionDate);
  const byId = new Map(day.trades.map((t) => [t.id, t]));
  let added = 0;
  for (const t of closed) {
    const row: NexusArchivedTrade = {
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
  void import('@/lib/nexus-pulse/nexus-cloud-store').then((m) =>
    m.syncTradeDayToCloud(opts.mode, opts.sessionDate)
  );
  return added;
}

export async function listArchiveDates(mode: NexusTradeMode): Promise<string[]> {
  await ensureDirs(mode);
  const local: string[] = [];
  try {
    const names = await fs.readdir(path.join(ROOT, mode));
    local.push(
      ...names
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
        .map((n) => n.replace(/\.json$/, ''))
    );
  } catch {
    /* empty */
  }
  const cloud = await import('@/lib/nexus-pulse/nexus-cloud-store').then((m) =>
    m.listTradeDatesFromCloud(mode)
  );
  return [...new Set([...local, ...cloud])].sort().reverse();
}

export async function loadArchiveDay(
  mode: NexusTradeMode,
  date: string
): Promise<DayFile> {
  const local = await loadDay(mode, date);
  if (local.trades.length > 0) return local;
  const cloud = await import('@/lib/nexus-pulse/nexus-cloud-store').then((m) =>
    m.loadTradeDayFromCloud(mode, date)
  );
  if (cloud && Array.isArray(cloud.trades)) {
    return cloud as DayFile;
  }
  return local;
}
