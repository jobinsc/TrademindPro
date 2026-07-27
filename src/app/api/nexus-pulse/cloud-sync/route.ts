import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { loadDailyIndex, syncDailyReportsToDatabase } from '@/lib/nexus-pulse/daily-report-store';
import {
  ensureNexusStorageBucket,
  syncAllNexusPulseToCloud,
} from '@/lib/nexus-pulse/nexus-cloud-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest) {
  const user = verifySessionToken(readSessionCookie(req));
  if (!user || user.role !== 'admin') return null;
  return user;
}

/** Push all NexusPulse `.data` (trades, PDFs, strategy) to Supabase. */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const bucket = await ensureNexusStorageBucket();
  if (!bucket.ok) {
    return NextResponse.json(
      { ok: false, error: bucket.error || 'Storage bucket failed' },
      { status: 503 }
    );
  }

  const index = await loadDailyIndex();
  await syncDailyReportsToDatabase(index.reports);

  const result = await syncAllNexusPulseToCloud({ reports: index.reports });
  return NextResponse.json({ ok: result.ok, result });
}
