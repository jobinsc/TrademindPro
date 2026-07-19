import { NextRequest, NextResponse } from 'next/server';
import { cloudLogin } from '@/lib/cloud-auth';
import { signSession, sessionCookieHeader } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await cloudLogin({
    email: String(body.email || ''),
    password: String(body.password || ''),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 401 });
  }

  const token = signSession(result.user);
  const res = NextResponse.json({ ok: true, user: result.user });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  return res;
}
