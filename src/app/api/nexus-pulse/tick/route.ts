import { NextRequest, NextResponse } from 'next/server';
import { tickNexusSession } from '@/lib/nexus-pulse/session-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Reconnect Upstox' }, { status: 401 });
  }
  try {
    const session = await tickNexusSession(token);
    return NextResponse.json({
      ok: true,
      session,
      tickAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Tick failed' },
      { status: 500 }
    );
  }
}
