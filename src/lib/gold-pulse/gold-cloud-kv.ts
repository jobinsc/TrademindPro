/**
 * GoldPulse durable storage on Vercel — Supabase admin user_kv (same vault as Nexus).
 */

import { readNexusAdminKv, upsertNexusAdminKv } from '@/lib/nexus-pulse/nexus-admin-kv';
import { isServerlessDataHost } from '@/lib/app-data-dir';
import type { GoldPulseSession } from '@/lib/gold-pulse/types';
import type { GoldStudyReportMeta } from '@/lib/gold-pulse/study-report';

const SESSION_PREFIX = 'gold_pulse_session_';
const STUDY_INDEX_KEY = 'gold_pulse_study_reports_v1';

export function goldUsesCloudKv(): boolean {
  return isServerlessDataHost();
}

export async function loadGoldSessionCloud(
  sessionDate: string
): Promise<GoldPulseSession | null> {
  if (!goldUsesCloudKv()) return null;
  return readNexusAdminKv<GoldPulseSession>(SESSION_PREFIX + sessionDate);
}

export async function saveGoldSessionCloud(session: GoldPulseSession): Promise<void> {
  if (!goldUsesCloudKv()) return;
  await upsertNexusAdminKv(SESSION_PREFIX + session.sessionDate, session).catch(() => undefined);
}

export async function loadGoldStudyReportsCloud(): Promise<GoldStudyReportMeta[]> {
  if (!goldUsesCloudKv()) return [];
  const row = await readNexusAdminKv<{ reports?: GoldStudyReportMeta[] }>(STUDY_INDEX_KEY);
  return row?.reports ?? [];
}

export async function saveGoldStudyReportsCloud(
  reports: GoldStudyReportMeta[]
): Promise<void> {
  if (!goldUsesCloudKv()) return;
  await upsertNexusAdminKv(STUDY_INDEX_KEY, {
    agent: 'GoldPulse',
    updatedAt: new Date().toISOString(),
    reports,
  }).catch(() => undefined);
}
