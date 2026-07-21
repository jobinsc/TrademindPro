'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import TradePinaxLogo from '@/components/app/TradePinaxLogo';
import { useAuth } from '@/components/auth/AuthProvider';
function AuthPanel({ mode }: { mode: 'login' | 'signup' }) {
  const { login, signup, cloudEnabled } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result =
      mode === 'login'
        ? await login(email, password)
        : await signup(name, email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || (mode === 'login' ? 'Login failed' : 'Signup failed'));
    }
    // AuthProvider hard-navigates to /app after a successful session is saved
  }

  return (
    <div
      id="auth"
      className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-[#cfe0ee] bg-white/95 p-6 shadow-[0_12px_40px_rgba(26,107,168,0.12)] backdrop-blur-sm md:p-8"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-mid">
        {mode === 'login' ? 'Log in' : 'Create account'}
      </p>
      <h2 className="mt-1 font-display text-xl font-bold text-sky-ink">
        {mode === 'login' ? 'Welcome back' : 'Join TradePinax'}
      </h2>
      <p className="mt-1 text-sm text-sky-ink/55">
        You are on the official TradePinax home page — continue below.
      </p>
      {cloudEnabled && (
        <p className="mt-2 text-[12px] font-medium text-emerald-700">
          Cloud accounts on — each person gets their own secure login.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {mode === 'signup' && (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Your name"
              required
              autoComplete="name"
            />
          </label>
        )}
        <label className="block">
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
        <label className="block">
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
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-sky-deep py-3 text-sm font-semibold text-white transition hover:bg-sky-ink disabled:opacity-60"
        >
          {loading
            ? mode === 'login'
              ? 'Logging in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Log in'
              : 'Create free account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-sky-ink/55">
        {mode === 'login' ? (
          <>
            New here?{' '}
            <Link href="/?auth=signup#auth" className="font-semibold text-sky-deep hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/?auth=login#auth" className="font-semibold text-sky-deep hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-center">
        <Link href="/" className="text-sm font-semibold text-sky-ink/50 hover:text-sky-deep">
          ← Back to home intro
        </Link>
      </p>
    </div>
  );
}

function HomeInner() {
  const search = useSearchParams();
  const { user, ready } = useAuth();
  const auth = search.get('auth');
  const mode = auth === 'login' || auth === 'signup' ? auth : null;

  useEffect(() => {
    if (mode !== 'login' && mode !== 'signup') return;
    const el = document.getElementById('auth');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mode]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-sky-ink">
      <header className="absolute inset-x-0 top-0 z-20">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-8">
          <Link href="/" aria-label="TradePinax home" className="flex items-center">
            <TradePinaxLogo height={44} priority />
          </Link>
          <div className="flex items-center gap-3">
            {ready && user ? (
              <Link
                href="/app"
                className="rounded-full bg-sky-deep px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-ink"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/?auth=login#auth"
                  className="hidden text-sm font-medium text-sky-ink/70 transition hover:text-sky-deep sm:inline"
                >
                  Log in
                </Link>
                <Link
                  href="/?auth=signup#auth"
                  className="rounded-full bg-sky-deep px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-ink"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <section className="relative flex flex-1 flex-col overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#ffffff_0%,#f4f9fd_38%,#dceef8_72%,#c5e3f5_100%)]" />
        <div className="hero-glow absolute -right-24 top-16 h-[420px] w-[420px] rounded-full bg-[#9fd0ee]/35 blur-3xl" />
        <div
          className="hero-glow absolute -left-20 bottom-10 h-[320px] w-[320px] rounded-full bg-[#b8ddf5]/40 blur-3xl"
          style={{ animationDelay: '2s' }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] opacity-[0.18]">
          <svg
            viewBox="0 0 1440 320"
            className="h-full w-full"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              fill="#1A6BA8"
              d="M0,224 L80,210 L160,230 L240,180 L320,200 L400,140 L480,160 L560,110 L640,130 L720,90 L800,120 L880,70 L960,100 L1040,60 L1120,95 L1200,50 L1280,85 L1360,40 L1440,70 L1440,320 L0,320 Z"
            />
          </svg>
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-16 pt-28 md:px-8 md:pb-20">
          <div className="animate-fade-up">
            <TradePinaxLogo height={100} priority />
          </div>
          <h1 className="animate-fade-up animate-delay-1 mt-6 max-w-2xl font-display text-2xl font-medium leading-snug tracking-tight text-sky-ink/90 sm:text-3xl md:text-4xl">
            The complete AI trading operating system for Indian markets.
          </h1>
          <p className="animate-fade-up animate-delay-2 mt-5 max-w-xl text-base leading-relaxed text-sky-ink/65 sm:text-lg">
            Journal, live terminal, NSE &amp; BSE scanner, automation, and AI agents — one
            professional platform built for traders.
          </p>

          {ready && user ? (
            <div className="animate-fade-up animate-delay-3 mt-9">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(26,107,168,0.28)] transition hover:bg-sky-ink"
              >
                Continue to dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : !mode ? (
            <div className="animate-fade-up animate-delay-3 mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/?auth=signup#auth"
                className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(26,107,168,0.28)] transition hover:bg-sky-ink"
              >
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/?auth=login#auth"
                className="inline-flex items-center gap-2 rounded-full border border-sky-deep/20 bg-white/70 px-6 py-3 text-sm font-semibold text-sky-deep backdrop-blur-sm transition hover:border-sky-deep/40 hover:bg-white"
              >
                Log in
              </Link>
            </div>
          ) : null}

          {mode ? <AuthPanel mode={mode} /> : null}
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#cfe0ee]/70 bg-white/90 px-6 py-8 backdrop-blur-sm md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-sky-ink/50 sm:flex-row">
          <div className="flex items-center gap-2">
            <TradePinaxLogo height={30} />
          </div>
          <p>© {new Date().getFullYear()} TradePinax. Evidence. Discipline. Edge.</p>
        </div>
      </footer>
    </div>
  );
}

export default function HomeLanding() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-sky-soft text-sm text-sky-ink/50">
          Loading TradePinax…
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
