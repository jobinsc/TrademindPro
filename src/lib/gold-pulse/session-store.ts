import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import {
  loadGoldSessionCloud,
  saveGoldSessionCloud,
} from '@/lib/gold-pulse/gold-cloud-kv';
import type { GoldPulseSession } from '@/lib/gold-pulse/types';

function sessionPath(sessionDate: string): string {
  return path.join(getAppDataDir(), `gold-pulse-session-${sessionDate}.json`);
}

/** UTC calendar date for international gold desk. */
export function goldSessionDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function loadGoldSession(
  sessionDate: string
): Promise<GoldPulseSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionDate), 'utf8');
    return JSON.parse(raw) as GoldPulseSession;
  } catch {
    /* try cloud on Vercel */
  }
  return loadGoldSessionCloud(sessionDate);
}

export async function saveGoldSession(session: GoldPulseSession): Promise<void> {
  await ensureAppDataDir();
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
  await saveGoldSessionCloud(session);
}
