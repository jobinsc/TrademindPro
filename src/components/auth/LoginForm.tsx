'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import TradePinaxLogo from '@/components/app/TradePinaxLogo';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginForm() {
  const { login, user, ready, cloudEnabled } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace('/app');
  }, [ready, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Login failed');
      return;
    }
    router.push('/app');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(165deg,#ffffff_0%,#f4f9fd_45%,#dceef8_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" aria-label="TradePinax home" className="inline-flex">
            <TradePinaxLogo height={62} priority />
          </Link>
          <p className="mt-2 text-sm text-sky-ink/55">Log in to your trading OS</p>
          {cloudEnabled && (
            <p className="mt-2 text-[12px] text-emerald-700">
              Cloud login on — your data saves online (friends can each have their own account)
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#cfe0ee] bg-white p-6 shadow-[0_8px_30px_rgba(26,107,168,0.08)] md:p-8"
        >
          <h1 className="font-display text-xl font-semibold text-sky-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-sky-ink/55">Enter your email and password</p>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@email.com"
              required
              autoComplete="email"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              minLength={6}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-sky-deep py-3 text-sm font-semibold text-white transition hover:bg-sky-ink disabled:opacity-60"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>

          <p className="mt-5 text-center text-sm text-sky-ink/55">
            New here?{' '}
            <Link href="/signup" className="font-semibold text-sky-deep hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
