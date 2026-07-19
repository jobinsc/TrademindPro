import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Server-only Supabase client (secret key). Never import this in client components. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '');
  const key = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'trademindpro-server' } },
  });
}

export function isCloudBackendConfigured(): boolean {
  return Boolean(getSupabaseAdmin());
}
