import { NextRequest, NextResponse } from 'next/server';
import { quoteNexusBoardOnly } from '@/lib/nexus-pulse/session-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fast terminal quotes (Nifty + ATM CE/PE) — ~1s poll like ATM Lab.
 * Does NOT run Sector 7 A entry/exit logic (that stays on /tick).
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Reconnect Upstox' }, { status: 401 });
  }
  try {
    const { board, spot, latencyMs } = await quoteNexusBoardOnly(token);
    return NextResponse.json({
      ok: true,
      board,
      spot,
      latencyMs,
      quotedAt: board.quotedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Board quote failed' },
      { status: 500 }
    );
  }
}
