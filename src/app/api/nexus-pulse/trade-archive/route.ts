import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import {
  listArchiveDates,
  loadArchiveDay,
  type NexusTradeMode,
} from '@/lib/nexus-pulse/trade-archive';

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
  const mode = (url.searchParams.get('mode') || 'paper') as NexusTradeMode;
  if (mode !== 'paper' && mode !== 'live') {
    return NextResponse.json({ ok: false, error: 'mode must be paper|live' }, { status: 400 });
  }

  const date = url.searchParams.get('date');
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    const day = await loadArchiveDay(mode, date);
    return NextResponse.json({ ok: true, mode, day });
  }

  const dates = await listArchiveDates(mode);
  return NextResponse.json({
    ok: true,
    mode,
    dates,
    paths: {
      paper: '.data/nexus-pulse/trades/paper/YYYY-MM-DD.json',
      live: '.data/nexus-pulse/trades/live/YYYY-MM-DD.json',
    },
  });
}
