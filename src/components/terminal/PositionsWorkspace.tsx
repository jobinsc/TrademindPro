'use client';

import Link from 'next/link';
import { ArrowRight, Circle, ListOrdered } from 'lucide-react';
import { useBroker } from '@/hooks/useBroker';
import { formatCurrency } from '@/lib/utils';

export default function PositionsWorkspace() {
  const { ready, connection, snapshot } = useBroker();

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 2 · Terminal
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Positions &amp; Orders
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Live positions and order book will appear here after broker API integration.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee]">
          <Circle
            className={`h-2.5 w-2.5 fill-current ${
              connection.connected ? 'text-emerald-500' : 'text-rose-400'
            }`}
          />
          {connection.connected ? `${connection.label} connected` : 'Broker offline'}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available" value={formatCurrency(snapshot.available)} />
        <Stat label="Margin used" value={`${snapshot.marginUsedPct}%`} />
        <Stat label="Day P&L" value={formatCurrency(snapshot.dayPnl)} />
        <Stat label="Open book" value={String(snapshot.openPositions)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">Open positions</h2>
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-12 text-center text-sm text-sky-ink/55">
            No open positions yet
          </div>
        </section>
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Orders</h2>
          <div className="mt-4 rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-12 text-center text-sm text-sky-ink/55">
            No pending or executed orders
          </div>
        </section>
      </div>

      <Link
        href="/app/terminal"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
      >
        Open Broker Terminal
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold text-sky-ink">{value}</p>
    </div>
  );
}
