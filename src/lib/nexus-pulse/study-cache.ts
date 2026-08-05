/**
 * Stable Real-option study cache — same from/to/lanes returns the same run
 * until force-refresh. Stops mid-session Upstox updates from changing P&L every click.
 */

import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';

const CACHE_SCHEMA = 2;

function cacheDir(desk: 'nifty' | 'sensex'): string {
  return path.join(getAppDataDir(), `nexus-pulse${desk === 'sensex' ? '-b' : ''}`, 'study-cache');
}

function cacheFile(
  desk: 'nifty' | 'sensex',
  fromDate: string,
  toDate: string,
  lanes: string[]
): string {
  const laneKey = [...lanes].sort().join('+') || 'morning_open_stop_15';
  const name = `${fromDate}_${toDate}_${laneKey}_v${CACHE_SCHEMA}.json`;
  return path.join(cacheDir(desk), name);
}

export async function loadStudyRunCache<T>(opts: {
  desk: 'nifty' | 'sensex';
  fromDate: string;
  toDate: string;
  lanes: string[];
}): Promise<(T & { cachedAt?: string; fromCache?: boolean }) | null> {
  try {
    await ensureAppDataDir();
    const raw = await fs.readFile(
      cacheFile(opts.desk, opts.fromDate, opts.toDate, opts.lanes),
      'utf8'
    );
    const parsed = JSON.parse(raw) as T & { cachedAt?: string; cacheSchema?: number };
    if (parsed.cacheSchema != null && parsed.cacheSchema !== CACHE_SCHEMA) return null;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

export async function saveStudyRunCache<T extends object>(opts: {
  desk: 'nifty' | 'sensex';
  fromDate: string;
  toDate: string;
  lanes: string[];
  run: T;
}): Promise<void> {
  await ensureAppDataDir();
  const dir = cacheDir(opts.desk);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    ...opts.run,
    cacheSchema: CACHE_SCHEMA,
    cachedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    cacheFile(opts.desk, opts.fromDate, opts.toDate, opts.lanes),
    JSON.stringify(payload, null, 2),
    'utf8'
  );
}
