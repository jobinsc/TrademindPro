/**
 * PinaxForge session persistence — .data/pinax-forge-session-{date}.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { PinaxForgeSession } from '@/lib/pinax-forge/types';

const DATA_DIR = path.join(process.cwd(), '.data');

function sessionPath(sessionDate: string): string {
  return path.join(DATA_DIR, `pinax-forge-session-${sessionDate}.json`);
}

export async function loadPinaxSession(
  sessionDate: string
): Promise<PinaxForgeSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionDate), 'utf8');
    return JSON.parse(raw) as PinaxForgeSession;
  } catch {
    return null;
  }
}

export async function savePinaxSession(session: PinaxForgeSession): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
}
