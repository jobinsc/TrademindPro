'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TradePinaxLogo from '@/components/app/TradePinaxLogo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * Handles Supabase email-confirm / magic-link redirects.
 * Set Site URL + Redirect URLs in Supabase to:
 *   https://trademind-pro.vercel.app/auth/callback
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Confirming your login…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupabaseConfigured()) {
        setMessage('Cloud login is not configured.');
        return;
      }
      const sb = getSupabase();
      if (!sb) {
        setMessage('Could not start cloud login.');
        return;
      }

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');

        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await sb.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'signup' | 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change',
          });
          if (error) throw error;
        } else {
          // Hash tokens (#access_token=...) — detectSessionInUrl on client
          await sb.auth.getSession();
        }

        if (cancelled) return;
        setMessage('Success! Opening TradePinax…');
        router.replace('/app');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Confirmation failed';
        setMessage(`${msg}. Try logging in, or turn OFF Confirm email in Supabase.`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#ffffff_0%,#f4f9fd_45%,#dceef8_100%)] px-4">
      <div className="max-w-md rounded-2xl border border-[#cfe0ee] bg-white p-6 text-center shadow-sm">
        <TradePinaxLogo height={58} className="mx-auto" priority />
        <p className="mt-3 text-sm text-sky-ink/70">{message}</p>
        <a href="/?auth=login#auth" className="mt-5 inline-block text-sm font-semibold text-sky-deep hover:underline">
          Go to login
        </a>
      </div>
    </div>
  );
}
