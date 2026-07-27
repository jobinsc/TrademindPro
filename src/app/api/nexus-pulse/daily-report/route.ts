import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { istDate } from '@/lib/pinax-forge/ist';
import {
  dailyPdfPath,
  generateNexusDailyReport,
  listDailyReports,
  syncDailyReportsToDatabase,
  loadDailyIndex,
} from '@/lib/nexus-pulse/daily-report-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest) {
  const user = verifySessionToken(readSessionCookie(req));
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const download = url.searchParams.get('download') === '1';

  if (date && download) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    const file = dailyPdfPath(date);
    try {
      const buf = await fs.readFile(file);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="NexusPulse-Day-${date}.pdf"`,
        },
      });
    } catch {
      return NextResponse.json({ ok: false, error: 'PDF not found for this date' }, { status: 404 });
    }
  }

  const reports = await listDailyReports();
  return NextResponse.json({
    ok: true,
    agent: 'NexusPulse',
    folder: '.data/nexus-pulse/reports/daily/',
    reports,
  });
}

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  let body: { action?: string; date?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || 'generate';
  const date = body.date || istDate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'Invalid date YYYY-MM-DD' }, { status: 400 });
  }

  if (action === 'sync_db') {
    const index = await loadDailyIndex();
    const sync = await syncDailyReportsToDatabase(index.reports);
    return NextResponse.json({ ok: sync.ok, sync });
  }

  if (action === 'generate') {
    const result = await generateNexusDailyReport(date);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      meta: result.meta,
      downloadUrl: `/api/nexus-pulse/daily-report?date=${date}&download=1`,
    });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
