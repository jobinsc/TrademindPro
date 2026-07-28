/**
 * Date-wise GoldPulse paper trade archive (like NexusPulse).
 */

import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import type { GoldPaperTrade } from '@/lib/gold-pulse/types';

export type GoldArchivedTrade = GoldPaperTrade & {
  sessionDate: string;
  archivedAt: string;
};

type DayFile = {
  date: string;
  updatedAt: string;
  trades: GoldArchivedTrade[];
};

const ROOT = path.join(getAppDataDir(), 'gold-pulse', 'trades', 'paper');

function dayPath(date: string): string {
  return path.join(ROOT, `${date}.json`);
}

async function ensureDir() {
  await ensureAppDataDir();
  await fs.mkdir(ROOT, { recursive: true });
}

export async function loadGoldArchiveDay(date: string): Promise<DayFile> {
  await ensureDir();
  try {
    const raw = await fs.readFile(dayPath(date), 'utf8');
    return JSON.parse(raw) as DayFile;
  } catch {
    return { date, updatedAt: new Date().toISOString(), trades: [] };
  }
}

async function saveDay(file: DayFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    dayPath(file.date),
    JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

export async function clearGoldArchiveDay(date: string): Promise<void> {
  await saveDay({ date, updatedAt: new Date().toISOString(), trades: [] });
}

export async function archiveGoldClosedTrades(opts: {
  sessionDate: string;
  trades: GoldPaperTrade[];
}): Promise<number> {
  const closed = opts.trades.filter((t) => t.status === 'closed');
  if (!closed.length) return 0;
  const day = await loadGoldArchiveDay(opts.sessionDate);
  const byId = new Map(day.trades.map((t) => [t.id, t]));
  let added = 0;
  for (const t of closed) {
    if (!byId.has(t.id)) added += 1;
    byId.set(t.id, {
      ...t,
      sessionDate: opts.sessionDate,
      archivedAt: new Date().toISOString(),
    });
  }
  day.trades = [...byId.values()].sort((a, b) =>
    String(a.openedAt).localeCompare(String(b.openedAt))
  );
  await saveDay(day);
  return added;
}
