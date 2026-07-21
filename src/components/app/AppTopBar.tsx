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
import { useChartPeekEnabled } from '@/hooks/useChartPeekEnabled';
import { cn } from '@/lib/utils';

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
    <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[#c5dcec] bg-[#e3f1f9]/95 px-3 backdrop-blur-sm md:px-5">
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
