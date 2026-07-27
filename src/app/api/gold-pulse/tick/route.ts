import { NextResponse } from 'next/server';
import { goldPulsePollMs, tickGoldSession } from '@/lib/gold-pulse/session-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** No Upstox — Yahoo GC=F only. */
export async function POST() {
  try {
    const session = await tickGoldSession();
    return NextResponse.json({
      ok: true,
      session,
      pollMs: goldPulsePollMs(session),
      tickAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Tick failed' },
      { status: 500 }
    );
  }
}
