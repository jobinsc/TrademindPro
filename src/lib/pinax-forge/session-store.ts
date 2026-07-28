/**
 * PinaxForge session persistence — .data/pinax-forge-session-{date}.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import type { PinaxForgeSession } from '@/lib/pinax-forge/types';

function sessionPath(sessionDate: string): string {
  return path.join(getAppDataDir(), `pinax-forge-session-${sessionDate}.json`);
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
  await ensureAppDataDir();
  await fs.writeFile(sessionPath(session.sessionDate), JSON.stringify(session, null, 2), 'utf8');
}
