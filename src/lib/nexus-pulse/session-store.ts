import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import {
  loadNexusSessionCloud,
  saveNexusSessionCloud,
} from '@/lib/nexus-pulse/nexus-session-cloud';
import type { NexusPulseSession } from '@/lib/nexus-pulse/types';

function sessionPath(sessionDate: string): string {
  return path.join(getAppDataDir(), `nexus-pulse-session-${sessionDate}.json`);
}

export async function loadNexusSession(
  sessionDate: string
): Promise<NexusPulseSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionDate), 'utf8');
    return JSON.parse(raw) as NexusPulseSession;
  } catch {
    /* try Supabase on Vercel */
  }
  return loadNexusSessionCloud(sessionDate);
}

export async function saveNexusSession(session: NexusPulseSession): Promise<void> {
  await ensureAppDataDir();
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
  await saveNexusSessionCloud(session);
}
