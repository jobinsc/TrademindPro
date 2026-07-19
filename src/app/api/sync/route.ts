import { NextRequest, NextResponse } from 'next/server';
import { CLOUD_SYNC_KEYS } from '@/lib/cloud-sync-keys';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set<string>(CLOUD_SYNC_KEYS);

function requireUser(req: NextRequest) {
  const session = verifySessionToken(readSessionCookie(req));
  if (!session) return null;
  return session;
}

/** Pull all synced keys for the logged-in user */
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'Cloud not configured' }, { status: 503 });

  const { data, error } = await sb
    .from('user_kv')
    .select('key, value')
    .eq('user_id', user.id)
    .neq('key', '__password_hash');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data || []).filter((r) => ALLOWED.has(r.key));
  return NextResponse.json({ ok: true, rows });
}

/** Push key/value pairs from the browser */
export async function PUT(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'Cloud not configured' }, { status: 503 });

  let body: { rows?: { key: string; value: unknown }[] };
  try {
    body = (await req.json()) as { rows?: { key: string; value: unknown }[] };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const rows = (body.rows || [])
    .filter((r) => r && ALLOWED.has(r.key))
    .map((r) => ({
      user_id: user.id,
      key: r.key,
      value: r.value as object | string | number | boolean | null,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return NextResponse.json({ ok: true, saved: 0 });

  const { error } = await sb.from('user_kv').upsert(rows, { onConflict: 'user_id,key' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
