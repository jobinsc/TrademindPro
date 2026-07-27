import fs from 'fs/promises';
import path from 'path';
import type { NexusPulseSession } from '@/lib/nexus-pulse/types';

const DATA_DIR = path.join(process.cwd(), '.data');

function sessionPath(sessionDate: string): string {
  return path.join(DATA_DIR, `nexus-pulse-session-${sessionDate}.json`);
}

export async function loadNexusSession(
  sessionDate: string
): Promise<NexusPulseSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionDate), 'utf8');
    return JSON.parse(raw) as NexusPulseSession;
  } catch {
    return null;
  }
}

export async function saveNexusSession(session: NexusPulseSession): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
}
