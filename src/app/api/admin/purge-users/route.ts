import { NextRequest, NextResponse } from 'next/server';
import { cloudPurgeTestUsers } from '@/lib/cloud-auth';
import { readSessionCookie, verifySessionToken } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only: keep Jobin + Jeril, remove test/junk accounts */
export async function POST(req: NextRequest) {
  const user = verifySessionToken(readSessionCookie(req));
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await cloudPurgeTestUsers();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
