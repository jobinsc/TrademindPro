'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calculator,
  CandlestickChart,
  Home,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import TradePinaxLogo from '@/components/app/TradePinaxLogo';
import DarkModeToggle from '@/components/app/DarkModeToggle';
import { useChartPeekEnabled } from '@/hooks/useChartPeekEnabled';
import { isUpstoxLiveSession, upstoxNeedsDailyRelogin } from '@/lib/upstox-client';
import { cn } from '@/lib/utils';

function LiveMarketBadge() {
  const [live, setLive] = useState(false);
  const [needsRelogin, setNeedsRelogin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function refresh() {
      // Only a fresh daily Upstox OAuth session — not market hours, not env API keys alone,
      // and not leftover expired/extended tokens in localStorage.
      setLive(isUpstoxLiveSession());
      setNeedsRelogin(upstoxNeedsDailyRelogin());
      setReady(true);
    }
    refresh();
    const id = window.setInterval(refresh, 5_000);
    const onStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key.includes('upstox') ||
        e.key.includes('trademindpro_upstox')
      ) {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (!ready) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-sky-ink/40 ring-1 ring-[#cfe0ee]">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        …
      </span>
    );
  }

  const title = live
    ? 'Upstox live session active — broker API ready'
    : needsRelogin
      ? 'Upstox login expired — open Broker Terminal and connect again'
      : 'Not connected to Upstox — open Broker Terminal to connect';

  return (
    <Link
      href="/app/terminal"
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 transition',
        live
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100'
          : 'bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100'
      )}
    >
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          live
            ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
            : 'bg-rose-500'
        )}
        aria-hidden
      />
      <span className="hidden sm:inline">{live ? 'Live market' : 'Offline'}</span>
      <span
        className={cn(
          'rounded px-1 py-0.5 text-[9px] font-bold uppercase',
          live ? 'bg-emerald-600/15 text-emerald-800' : 'bg-rose-600/15 text-rose-800'
        )}
      >
        {live ? 'ON' : 'OFF'}
      </span>
    </Link>
  );
}

export default function AppTopBar({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const { enabled: peekOn, toggle: togglePeek, ready: peekReady } = useChartPeekEnabled();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const date = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-sky-line/80 bg-sky-mist/95 px-3 backdrop-blur-sm md:px-5">
      <div className="flex items-center gap-2">
        <Link href="/app" aria-label="TradePinax dashboard" className="md:hidden">
          <TradePinaxLogo variant="mark" height={26} priority />
        </Link>
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open menu"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sky-deep transition hover:bg-white/80 md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
          <span className="text-[11px] font-bold">Menu</span>
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden items-center justify-center rounded-lg p-1.5 text-sky-deep transition hover:bg-white/80 md:inline-flex"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
          )}
        </button>

        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-sky-ink ring-1 ring-[#cfe0ee] transition hover:bg-sky-soft/60"
        >
          <Home className="h-3.5 w-3.5 text-sky-deep" strokeWidth={2} />
          Home
        </Link>

        <p className="font-mono text-[10px] font-bold tracking-wide text-sky-ink md:text-[11px]">
          {date} · {time} IST
        </p>
      </div>

      <div className="flex items-center gap-2">
        <DarkModeToggle />
        <LiveMarketBadge />
        {peekReady && (
          <button
            type="button"
            onClick={togglePeek}
            title={
              peekOn
                ? 'Hover mini-charts ON — click to disable'
                : 'Hover mini-charts OFF — click to enable'
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 transition',
              peekOn
                ? 'bg-sky-deep text-white ring-sky-deep hover:bg-sky-ink'
                : 'bg-white/80 text-sky-ink/55 ring-[#cfe0ee] hover:bg-white'
            )}
          >
            <CandlestickChart className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Peek charts</span>
            <span
              className={cn(
                'rounded px-1 py-0.5 text-[9px] font-bold uppercase',
                peekOn ? 'bg-white/20' : 'bg-sky-soft text-sky-ink/50'
              )}
            >
              {peekOn ? 'ON' : 'OFF'}
            </span>
          </button>
        )}
        <Link
          href="/app/calculator"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-sky-ink ring-1 ring-[#cfe0ee] transition hover:bg-white"
        >
          <Calculator className="h-3.5 w-3.5" strokeWidth={2} />
          Calculator
        </Link>
      </div>
    </header>
  );
}
