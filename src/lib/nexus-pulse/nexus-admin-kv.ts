/**
 * Admin-scoped Supabase user_kv helpers for NexusPulse desk data.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function findNexusAdminUserId(): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function upsertNexusAdminKv(
  key: string,
  value: unknown
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const adminId = await findNexusAdminUserId();
  if (!adminId) return { ok: false, error: 'No admin profile' };

  const { error } = await sb.from('user_kv').upsert(
    {
      user_id: adminId,
      key,
      value: value as object,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function readNexusAdminKv<T>(key: string): Promise<T | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const adminId = await findNexusAdminUserId();
  if (!adminId) return null;

  const { data, error } = await sb
    .from('user_kv')
    .select('value')
    .eq('user_id', adminId)
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}
