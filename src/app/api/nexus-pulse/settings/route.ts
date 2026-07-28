import { NextRequest, NextResponse } from 'next/server';
import { istDate } from '@/lib/pinax-forge/ist';
import { updateNexusSettings } from '@/lib/nexus-pulse/session-engine';
import type { NexusLaneId } from '@/lib/nexus-pulse/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Reconnect Upstox' }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      activeLanes?: NexusLaneId[];
      stopAfterLossEnabled?: boolean;
      stopAfterLossInr?: number;
    };
    const session = await updateNexusSettings(istDate(), {
      activeLanes: body.activeLanes,
      stopAfterLossEnabled:
        typeof body.stopAfterLossEnabled === 'boolean' ? body.stopAfterLossEnabled : undefined,
      stopAfterLossInr:
        typeof body.stopAfterLossInr === 'number' ? body.stopAfterLossInr : undefined,
    });
    return NextResponse.json({ ok: true, session });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Settings update failed' },
      { status: 500 }
    );
  }
}
