import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import { getPinaxWsFeedStatus, rehydrateLiveWatch } from '@/lib/pinax-forge/live-watch';
import { tickPinaxSession } from '@/lib/pinax-forge/session-engine';
import type { PinaxTickResponse } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Poll: refresh desk, scan setups, manage paper trades, append journal. */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Reconnect Upstox — Bearer token required' } satisfies PinaxTickResponse,
      { status: 401 }
    );
  }

  try {
    await rehydrateLiveWatch(token).catch(() => undefined);
    const session = await tickPinaxSession(token);
    const ws = getPinaxWsFeedStatus();
    return NextResponse.json({
      ok: true,
      session,
      tickAt: new Date().toISOString(),
      wsConnected: ws.wsConnected,
      lastTickAt: ws.lastTickAt,
    } satisfies PinaxTickResponse);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'PinaxForge tick failed',
      } satisfies PinaxTickResponse,
      { status: 500 }
    );
  }
}
