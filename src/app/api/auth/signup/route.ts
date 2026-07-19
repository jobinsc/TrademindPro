import { NextRequest, NextResponse } from 'next/server';
import { cloudSignup } from '@/lib/cloud-auth';
import { signSession, sessionCookieHeader } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = (await req.json()) as { name?: string; email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await cloudSignup({
    name: String(body.name || ''),
    email: String(body.email || ''),
    password: String(body.password || ''),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  const token = signSession(result.user);
  const res = NextResponse.json({ ok: true, user: result.user });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  return res;
}
