import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import {
  applyPinaxOverride,
  type PinaxOverrideRequest,
} from '@/lib/pinax-forge/override-engine';
import type { PinaxOverrideResponse } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Manual desk overrides — force take/skip, pause auto, close paper trade. */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Reconnect Upstox — Bearer token required' } satisfies PinaxOverrideResponse,
      { status: 401 }
    );
  }

  let body: PinaxOverrideRequest;
  try {
    body = (await req.json()) as PinaxOverrideRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' } satisfies PinaxOverrideResponse,
      { status: 400 }
    );
  }

  if (!body.action) {
    return NextResponse.json(
      { ok: false, error: 'action required' } satisfies PinaxOverrideResponse,
      { status: 400 }
    );
  }

  try {
    const session = await applyPinaxOverride(token, body);
    return NextResponse.json({ ok: true, session } satisfies PinaxOverrideResponse);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Override failed',
      } satisfies PinaxOverrideResponse,
      { status: 400 }
    );
  }
}
