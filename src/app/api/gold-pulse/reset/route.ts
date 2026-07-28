import { NextRequest, NextResponse } from 'next/server';
import { resetGoldPaperSession } from '@/lib/gold-pulse/session-engine';
import { goldSessionDate } from '@/lib/gold-pulse/session-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Clear today's GoldPulse paper session + archive. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string };
    const date = String(body.date || goldSessionDate()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }
    const session = await resetGoldPaperSession(date);
    return NextResponse.json({ ok: true, session });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Reset failed' },
      { status: 500 }
    );
  }
}
