'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) {
      router.replace('/');
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-soft text-sm text-sky-ink/50">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-soft text-sm text-sky-ink/50">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
