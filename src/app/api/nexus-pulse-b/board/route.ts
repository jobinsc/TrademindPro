import { NextRequest, NextResponse } from 'next/server';
import { quoteNexusBBoardOnly } from '@/lib/nexus-pulse-b/session-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Fast Sensex + ATM CE/PE quotes — no Sector 7 B entry/exit logic. */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Reconnect Upstox' }, { status: 401 });
  }
  try {
    const { board, spot, latencyMs } = await quoteNexusBBoardOnly(token);
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
