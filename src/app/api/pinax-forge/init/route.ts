import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import { rehydrateLiveWatch } from '@/lib/pinax-forge/live-watch';
import { initPinaxSession } from '@/lib/pinax-forge/session-engine';
import type { PinaxInitResponse } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Start or resume today's PinaxForge paper session. No live orders. */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Reconnect Upstox — Bearer token required' } satisfies PinaxInitResponse,
      { status: 401 }
    );
  }

  try {
    const session = await initPinaxSession(token);
    await rehydrateLiveWatch(token).catch(() => undefined);
    return NextResponse.json({ ok: true, session } satisfies PinaxInitResponse);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'PinaxForge init failed',
      } satisfies PinaxInitResponse,
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
