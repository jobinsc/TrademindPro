'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

/** Nejoic + Jimbo (and their settings) — admin only */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, ready, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (!isAdmin) {
      router.replace('/app');
    }
  }, [ready, user, isAdmin, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-sky-ink/50">
        Checking access…
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <Shield className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-xl font-semibold text-sky-ink">Admin only</h1>
        <p className="mt-2 text-sm text-sky-ink/60">
          Nejoic and Jimbo are restricted to admin accounts.
        </p>
        <Link
          href="/app"
          className="mt-6 inline-flex rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
