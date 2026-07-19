'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Expand, LineChart, X } from 'lucide-react';
import { chartHref } from '@/lib/chart';
import { useChartPeekEnabled } from '@/hooks/useChartPeekEnabled';
import LightweightMiniChart from '@/components/chart/LightweightMiniChart';

type PeekState = {
  symbol: string;
  exchange: string;
  name?: string;
  x: number;
  y: number;
};

type PeekApi = {
  open: (s: PeekState) => void;
  move: (x: number, y: number) => void;
  close: () => void;
};

let peekApi: PeekApi | null = null;
let closeTimer: number | null = null;

export function requestChartPeek(state: PeekState) {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
  peekApi?.open(state);
}

export function moveChartPeek(x: number, y: number) {
  peekApi?.move(x, y);
}

export function scheduleCloseChartPeek(delayMs = 320) {
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    peekApi?.close();
    closeTimer = null;
  }, delayMs);
}

export function cancelCloseChartPeek() {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

/** Global portal host — mount once in AppShell */
export function ChartPeekHost() {
  const { enabled, ready } = useChartPeekEnabled();
  const pathname = usePathname();
  const [peek, setPeek] = useState<PeekState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    peekApi = {
      open: (s) => setPeek(s),
      move: (x, y) => setPeek((p) => (p ? { ...p, x, y } : p)),
      close: () => setPeek(null),
    };
    return () => {
      peekApi = null;
    };
  }, []);

  useEffect(() => {
    setPeek(null);
  }, [pathname]);

  useEffect(() => {
    if (!enabled) setPeek(null);
  }, [enabled]);

  if (!mounted || !ready || !enabled || !peek?.symbol) return null;

  const fullHref = chartHref(
    { symbol: peek.symbol, exchange: peek.exchange, name: peek.name },
    pathname
  );

  const left = Math.min(Math.max(12, peek.x + 14), window.innerWidth - 340);
  const top = Math.min(Math.max(12, peek.y + 14), window.innerHeight - 290);

  return createPortal(
    <div
      className="fixed z-[10000] w-[320px] overflow-hidden rounded-2xl border border-[#cfe0ee] bg-white shadow-2xl"
      style={{ left, top }}
      onMouseEnter={() => cancelCloseChartPeek()}
      onMouseLeave={() => scheduleCloseChartPeek()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#e8f2fa] bg-sky-soft/50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sky-ink">{peek.symbol}</p>
          <p className="truncate text-[10px] text-sky-ink/45">
            {peek.exchange}
            {peek.name ? ` · ${peek.name}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={fullHref}
            title="Open full chart"
            className="inline-flex items-center gap-1 rounded-lg bg-sky-deep px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-ink"
            onClick={() => setPeek(null)}
          >
            <Expand className="h-3.5 w-3.5" />
            Expand
          </Link>
          <button
            type="button"
            aria-label="Close peek"
            className="rounded-lg p-1.5 text-sky-ink/45 hover:bg-white hover:text-sky-ink"
            onClick={() => setPeek(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <LightweightMiniChart
        key={`${peek.exchange}:${peek.symbol}`}
        symbol={peek.symbol}
        exchange={peek.exchange}
        width={320}
        height={210}
        interval="5m"
      />
      <div className="border-t border-[#e8f2fa] px-3 py-1.5 text-[10px] text-sky-ink/40">
        Live peek · Expand for all timeframes, indicators &amp; Pine
      </div>
    </div>,
    document.body
  );
}

type SymbolChartLinkProps = {
  symbol: string;
  exchange?: string;
  name?: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Clickable symbol: opens full chart. Hover (when peek enabled) shows mini chart.
 */
export function SymbolChartLink({
  symbol,
  exchange = 'NSE',
  name,
  className = '',
  children,
}: SymbolChartLinkProps) {
  const pathname = usePathname();
  const { enabled } = useChartPeekEnabled();
  const hoverTimer = useRef<number | null>(null);
  const opened = useRef(false);

  const href = chartHref({ symbol, exchange, name }, pathname);

  const onEnter = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      const x = e.clientX;
      const y = e.clientY;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        opened.current = true;
        requestChartPeek({
          symbol: symbol.toUpperCase(),
          exchange: (exchange || 'NSE').toUpperCase(),
          name,
          x,
          y,
        });
      }, 400);
    },
    [enabled, symbol, exchange, name]
  );

  const onLeave = useCallback(() => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    opened.current = false;
    scheduleCloseChartPeek();
  }, []);

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || !opened.current) return;
      moveChartPeek(e.clientX, e.clientY);
    },
    [enabled]
  );

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 font-semibold text-sky-deep hover:underline ${className}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
      title={enabled ? 'Hover for mini chart · click for full chart' : 'Open chart'}
    >
      {children ?? (
        <>
          <LineChart className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
          {symbol}
        </>
      )}
    </Link>
  );
}
