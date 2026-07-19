import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-sky-ink">
      <header className="absolute inset-x-0 top-0 z-20">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-8">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-sky-ink md:text-xl"
          >
            TradeMind<span className="text-sky-deep"> Pro</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-sky-ink/70 transition hover:text-sky-deep sm:inline"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-sky-deep px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-ink"
            >
              Sign up
            </Link>
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
          <p className="animate-fade-up font-display text-4xl font-semibold tracking-tight text-sky-ink sm:text-5xl md:text-6xl lg:text-7xl">
            TradeMind<span className="text-sky-deep"> Pro</span>
          </p>
          <h1 className="animate-fade-up animate-delay-1 mt-5 max-w-2xl font-display text-2xl font-medium leading-snug tracking-tight text-sky-ink/90 sm:text-3xl md:text-4xl">
            The complete AI trading operating system for Indian markets.
          </h1>
          <p className="animate-fade-up animate-delay-2 mt-5 max-w-xl text-base leading-relaxed text-sky-ink/65 sm:text-lg">
            Journal, live terminal, NSE &amp; BSE scanner, automation, and AI agents — one
            professional platform built for traders.
          </p>
          <div className="animate-fade-up animate-delay-3 mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(26,107,168,0.28)] transition hover:bg-sky-ink"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-sky-deep/20 bg-white/70 px-6 py-3 text-sm font-semibold text-sky-deep backdrop-blur-sm transition hover:border-sky-deep/40 hover:bg-white"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#cfe0ee]/70 bg-white/90 px-6 py-8 backdrop-blur-sm md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-sky-ink/50 sm:flex-row">
          <p className="font-display font-medium text-sky-ink/70">
            TradeMind<span className="text-sky-deep"> Pro</span>
          </p>
          <p>© {new Date().getFullYear()} TradeMind Pro. Built for Indian traders.</p>
        </div>
      </footer>
    </div>
  );
}
