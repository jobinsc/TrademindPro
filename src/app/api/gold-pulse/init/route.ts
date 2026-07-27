import { NextResponse } from 'next/server';
import { initGoldSession } from '@/lib/gold-pulse/session-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** No Upstox — Yahoo only. */
export async function POST() {
  try {
    const session = await initGoldSession();
    return NextResponse.json({
      ok: true,
      session,
      tickAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Init failed' },
      { status: 500 }
    );
  }
}
