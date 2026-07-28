/**
 * NexusPulse Sector 7 B live session on Vercel — admin user_kv (paper desk state).
 */

import { isServerlessDataHost } from '@/lib/app-data-dir';
import { readNexusAdminKv, upsertNexusAdminKv } from '@/lib/nexus-pulse/nexus-admin-kv';
import type { NexusPulseSession } from '@/lib/nexus-pulse-b/types';

const SESSION_PREFIX = 'nexus_pulse_b_session_';

export function nexusBUsesCloudSession(): boolean {
  return isServerlessDataHost();
}

export async function loadNexusBSessionCloud(
  sessionDate: string
): Promise<NexusPulseSession | null> {
  if (!nexusBUsesCloudSession()) return null;
  return readNexusAdminKv<NexusPulseSession>(SESSION_PREFIX + sessionDate);
}

export async function saveNexusBSessionCloud(session: NexusPulseSession): Promise<void> {
  if (!nexusBUsesCloudSession()) return;
  await upsertNexusAdminKv(SESSION_PREFIX + session.sessionDate, session).catch(() => undefined);
}
