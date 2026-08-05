import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import {
  generateJimboDailyReport,
  jimboDailyPdfPath,
} from '@/lib/jimbo-daily-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Generate / download Jimbo daily paper PDF for a date (YYYY-MM-DD). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = String(url.searchParams.get('date') || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'Pass ?date=YYYY-MM-DD' }, { status: 400 });
  }
  const download = url.searchParams.get('download') === '1';
  const force = url.searchParams.get('force') === '1';

  try {
    const pdfPath = jimboDailyPdfPath(date);
    if (!force) {
      try {
        const existing = await fs.readFile(pdfPath);
        if (download) {
          return new NextResponse(existing, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="Jimbo-Day-${date}.pdf"`,
            },
          });
        }
        return NextResponse.json({
          ok: true,
          date,
          path: pdfPath,
          bytes: existing.length,
          downloadUrl: `/api/jimbo/daily-report?date=${date}&download=1`,
        });
      } catch {
        /* generate */
      }
    }

    const result = await generateJimboDailyReport(date);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'PDF failed' },
        { status: 500 }
      );
    }

    if (download) {
      const buf = await fs.readFile(result.path);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Jimbo-Day-${date}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      path: result.path,
      bytes: result.bytes,
      summary: result.meta.summary,
      downloadUrl: `/api/jimbo/daily-report?date=${date}&download=1`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Jimbo report failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const date = String(body.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'Pass { date: YYYY-MM-DD }' }, { status: 400 });
  }
  try {
    const result = await generateJimboDailyReport(date);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'PDF failed' },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      date,
      path: result.path,
      bytes: result.bytes,
      summary: result.meta.summary,
      downloadUrl: `/api/jimbo/daily-report?date=${date}&download=1`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Jimbo report failed' },
      { status: 500 }
    );
  }
}
