import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

function supabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  // Allow paste of .../rest/v1/ — we only need the project root
  return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
}

function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

/** Browser Supabase client (persists session in localStorage automatically). */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (typeof window === 'undefined') return null;
  if (browserClient) return browserClient;

  browserClient = createClient(supabaseUrl(), supabaseKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'trademindpro_supabase_auth',
    },
  });
  return browserClient;
}
