import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { istDate } from '@/lib/pinax-forge/ist';
import {
  generateNexusDailyReport,
  listDailyReports,
  loadDailyReportMeta,
  syncDailyReportsToDatabase,
  loadDailyIndex,
} from '@/lib/nexus-pulse/daily-report-store';
import {
  ensureNexusStorageBucket,
  readDailyPdfBytes,
  syncAllNexusPulseToCloud,
  uploadDailyPdfToCloud,
} from '@/lib/nexus-pulse/nexus-cloud-store';

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
  const view = url.searchParams.get('view') === '1';

  if (date && view) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    const meta = await loadDailyReportMeta(date);
    if (!meta) {
      return NextResponse.json({ ok: false, error: 'Report not found for this date' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, report: meta });
  }

  if (date && download) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    try {
      const buf = await readDailyPdfBytes(date);
      if (!buf) throw new Error('missing');
      const disposition =
        url.searchParams.get('attach') === '1'
          ? `attachment; filename="NexusPulse-Day-${date}.pdf"`
          : `inline; filename="NexusPulse-Day-${date}.pdf"`;
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, no-store',
          'Content-Length': String(buf.byteLength),
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
    await ensureNexusStorageBucket();
    const index = await loadDailyIndex();
    const sync = await syncDailyReportsToDatabase(index.reports);
    for (const r of index.reports) {
      await uploadDailyPdfToCloud(r.date).catch(() => undefined);
    }
    const full = await syncAllNexusPulseToCloud({ reports: index.reports });
    return NextResponse.json({ ok: sync.ok, sync, cloud: full });
  }

  if (action === 'sync_cloud') {
    await ensureNexusStorageBucket();
    const index = await loadDailyIndex();
    await syncDailyReportsToDatabase(index.reports);
    const full = await syncAllNexusPulseToCloud({ reports: index.reports });
    return NextResponse.json({ ok: full.ok, cloud: full });
  }

  if (action === 'generate') {
    const result = await generateNexusDailyReport(date);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    await uploadDailyPdfToCloud(date).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      meta: result.meta,
      downloadUrl: `/api/nexus-pulse/daily-report?date=${date}&download=1&attach=1`,
      viewUrl: `/api/nexus-pulse/daily-report?date=${date}&view=1`,
    });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
