import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Instant liveness probe — no Upstox/Yahoo (used by live.mjs watchdog). */
export async function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
