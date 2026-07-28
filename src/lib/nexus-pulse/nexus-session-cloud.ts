/**
 * NexusPulse live session on Vercel — admin user_kv (paper desk state).
 */

import { isServerlessDataHost } from '@/lib/app-data-dir';
import { readNexusAdminKv, upsertNexusAdminKv } from '@/lib/nexus-pulse/nexus-admin-kv';
import type { NexusPulseSession } from '@/lib/nexus-pulse/types';

const SESSION_PREFIX = 'nexus_pulse_session_';

export function nexusUsesCloudSession(): boolean {
  return isServerlessDataHost();
}

export async function loadNexusSessionCloud(
  sessionDate: string
): Promise<NexusPulseSession | null> {
  if (!nexusUsesCloudSession()) return null;
  return readNexusAdminKv<NexusPulseSession>(SESSION_PREFIX + sessionDate);
}

export async function saveNexusSessionCloud(session: NexusPulseSession): Promise<void> {
  if (!nexusUsesCloudSession()) return;
  await upsertNexusAdminKv(SESSION_PREFIX + session.sessionDate, session).catch(() => undefined);
}
