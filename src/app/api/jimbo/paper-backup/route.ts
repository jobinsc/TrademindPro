import { NextRequest, NextResponse } from 'next/server';
import {
  backupJimboPaperTrades,
  listJimboPaperBackupDates,
  loadJimboPaperBackupDay,
} from '@/lib/jimbo-trade-archive';
import type { JimboTrade } from '@/lib/jimbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Backup / read Jimbo paper trades under `.data/jimbo/trades/paper/`. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    const day = await loadJimboPaperBackupDay(date);
    return NextResponse.json({ ok: true, day });
  }
  const dates = await listJimboPaperBackupDates();
  return NextResponse.json({
    ok: true,
    dates,
    paths: {
      day: '.data/jimbo/trades/paper/YYYY-MM-DD.json',
      latest: '.data/jimbo/trades/paper/_latest.json',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      trades?: JimboTrade[];
      note?: string;
      cleared?: boolean;
    };
    const trades = Array.isArray(body.trades) ? body.trades : [];
    const result = await backupJimboPaperTrades({
      trades,
      note: body.note,
      cleared: Boolean(body.cleared),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Backup failed' },
      { status: 500 }
    );
  }
}
