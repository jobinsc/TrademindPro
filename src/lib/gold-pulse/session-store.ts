import fs from 'fs/promises';
import path from 'path';
import type { GoldPulseSession } from '@/lib/gold-pulse/types';

const DATA_DIR = path.join(process.cwd(), '.data');

function sessionPath(sessionDate: string): string {
  return path.join(DATA_DIR, `gold-pulse-session-${sessionDate}.json`);
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
    return null;
  }
}

export async function saveGoldSession(session: GoldPulseSession): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
}
