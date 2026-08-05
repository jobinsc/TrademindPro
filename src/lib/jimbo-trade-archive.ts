/**
 * Jimbo paper-trade backup — date files under `.data/jimbo/trades/paper/`.
 * Durable copy of opens/closes as the desk runs (separate from localStorage).
 */

import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import type { JimboTrade } from '@/lib/jimbo';
import { todayKey } from '@/lib/jimbo';

export type JimboArchivedTrade = JimboTrade & {
  sessionDate: string;
  archivedAt: string;
};

type DayFile = {
  date: string;
  mode: 'paper';
  updatedAt: string;
  trades: JimboArchivedTrade[];
  note?: string;
};

function tradesRoot(): string {
  return path.join(getAppDataDir(), 'jimbo', 'trades');
}

function dayPath(date: string): string {
  return path.join(tradesRoot(), 'paper', `${date}.json`);
}

function latestPath(): string {
  return path.join(tradesRoot(), 'paper', '_latest.json');
}

async function ensureDirs() {
  await ensureAppDataDir();
  await fs.mkdir(path.join(tradesRoot(), 'paper'), { recursive: true });
}

async function loadDay(date: string): Promise<DayFile> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(dayPath(date), 'utf8');
    return JSON.parse(raw) as DayFile;
  } catch {
    return {
      date,
      mode: 'paper',
      updatedAt: new Date().toISOString(),
      trades: [],
    };
  }
}

async function saveDay(file: DayFile): Promise<void> {
  await ensureDirs();
  const next = { ...file, updatedAt: new Date().toISOString() };
  await fs.writeFile(dayPath(file.date), JSON.stringify(next, null, 2), 'utf8');
}

/**
 * Upsert Jimbo paper trades into date files + write `_latest.json` full book snapshot.
 * Groups by trade open date (IST YYYY-MM-DD from `at`).
 */
export async function backupJimboPaperTrades(opts: {
  trades: JimboTrade[];
  note?: string;
  /** When true with empty trades, wipe today's day file */
  cleared?: boolean;
}): Promise<{ dates: string[]; count: number; latestPath: string }> {
  const now = new Date().toISOString();
  const today = todayKey();

  if (opts.cleared) {
    const day = await loadDay(today);
    day.trades = [];
    day.note = opts.note || 'Cleared Jimbo paper book';
    await saveDay(day);
    await ensureDirs();
    await fs.writeFile(
      latestPath(),
      JSON.stringify(
        { updatedAt: now, sessionDate: today, trades: [], note: day.note },
        null,
        2
      ),
      'utf8'
    );
    return {
      dates: [today],
      count: 0,
      latestPath: '.data/jimbo/trades/paper/_latest.json',
    };
  }

  const byDate = new Map<string, JimboTrade[]>();
  for (const t of opts.trades) {
    const d = (t.at || now).slice(0, 10) || today;
    const list = byDate.get(d) || [];
    list.push(t);
    byDate.set(d, list);
  }
  if (!byDate.size) {
    byDate.set(today, []);
  }

  const dates: string[] = [];
  let count = 0;
  for (const [date, rows] of byDate) {
    const day = await loadDay(date);
    const map = new Map(day.trades.map((t) => [t.id, t]));
    for (const t of rows) {
      map.set(t.id, { ...t, sessionDate: date, archivedAt: now });
    }
    day.trades = [...map.values()].sort((a, b) => a.at.localeCompare(b.at));
    day.note = opts.note;
    await saveDay(day);
    dates.push(date);
    count += day.trades.length;
  }

  await ensureDirs();
  await fs.writeFile(
    latestPath(),
    JSON.stringify(
      {
        updatedAt: now,
        sessionDate: today,
        trades: opts.trades,
        note: opts.note || 'Jimbo paper book snapshot',
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    dates: dates.sort().reverse(),
    count,
    latestPath: '.data/jimbo/trades/paper/_latest.json',
  };
}

export async function listJimboPaperBackupDates(): Promise<string[]> {
  await ensureDirs();
  try {
    const names = await fs.readdir(path.join(tradesRoot(), 'paper'));
    return names
      .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .map((n) => n.replace(/\.json$/, ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function loadJimboPaperBackupDay(date: string): Promise<DayFile> {
  return loadDay(date);
}
