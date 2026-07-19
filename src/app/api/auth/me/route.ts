import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = readSessionCookie(req);
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  // Refresh blocked/role from DB
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data } = await sb.from('profiles').select('*').eq('id', session.id).maybeSingle();
    if (!data || data.blocked) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role === 'admin' ? 'admin' : 'user',
        blocked: Boolean(data.blocked),
        createdAt: data.created_at,
      },
    });
  }

  return NextResponse.json({ ok: true, user: session });
}
