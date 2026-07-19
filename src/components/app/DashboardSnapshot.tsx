'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  BookOpen,
  Bot,
  Eye,
  Workflow,
  ArrowRight,
} from 'lucide-react';
import { normalizeTrade, summarizeTrades, type Trade } from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';

type Snapshot = {
  trades: number;
  openTrades: number;
  pnl: number;
  watchlist: number;
  alerts: number;
  strategies: number;
};

function loadSnapshot(): Snapshot {
  const empty: Snapshot = {
    trades: 0,
    openTrades: 0,
    pnl: 0,
    watchlist: 0,
    alerts: 0,
    strategies: 0,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const tradesRaw = localStorage.getItem('trademindpro_trades_v1');
    const trades = tradesRaw
      ? (JSON.parse(tradesRaw) as Partial<Trade>[])
          .filter((t): t is Partial<Trade> & { id: string } => Boolean(t && t.id))
          .map(normalizeTrade)
      : [];
    const s = summarizeTrades(trades);

    const listsRaw = localStorage.getItem('trademindpro_watchlists_v1');
    const lists = listsRaw ? (JSON.parse(listsRaw) as { symbols?: unknown[] }[]) : [];
    const watchlist = Array.isArray(lists)
      ? lists.reduce((a, l) => a + (Array.isArray(l.symbols) ? l.symbols.length : 0), 0)
      : 0;

    const alertsRaw = localStorage.getItem('trademindpro_alerts_v1');
    const alerts = alertsRaw ? (JSON.parse(alertsRaw) as unknown[]) : [];
    const strategiesRaw = localStorage.getItem('trademindpro_strategies_v1');
    const strategies = strategiesRaw ? (JSON.parse(strategiesRaw) as unknown[]) : [];

    return {
      trades: s.total,
      openTrades: s.open,
      pnl: s.totalPnL,
      watchlist,
      alerts: Array.isArray(alerts) ? alerts.length : 0,
      strategies: Array.isArray(strategies) ? strategies.length : 0,
    };
  } catch {
    return empty;
  }
}

export default function DashboardSnapshot() {
  const [stats, setStats] = useState<Snapshot>(loadSnapshot);

  useEffect(() => {
    setStats(loadSnapshot());
  }, []);

  const cards = [
    {
      label: 'Trades logged',
      value: String(stats.trades),
      sub: `${stats.openTrades} open`,
      icon: BookOpen,
      href: '/app/journal',
    },
    {
      label: 'Watchlist symbols',
      value: String(stats.watchlist),
      sub: 'Across lists',
      icon: Eye,
      href: '/app/watchlist',
    },
    {
      label: 'Alerts',
      value: String(stats.alerts),
      sub: 'Price alerts',
      icon: Bell,
      href: '/app/alerts',
    },
    {
      label: 'Strategies',
      value: String(stats.strategies),
      sub: 'Builder',
      icon: Workflow,
      href: '/app/strategies',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4 transition hover:border-sky-mid/40"
          >
            <div className="flex items-center gap-2 text-sky-mid">
              <item.icon className="h-4 w-4" strokeWidth={1.75} />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-ink">
                {item.label}
              </p>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-sky-ink">{item.value}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-sky-ink">{item.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-sky-ink">
          Realized journal P&L:{' '}
          <strong
            className={
              stats.pnl > 0
                ? 'text-emerald-600'
                : stats.pnl < 0
                  ? 'text-rose-500'
                  : 'text-sky-ink'
            }
          >
            {formatCurrency(stats.pnl)}
          </strong>
        </p>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-sky-deep">
          <Link href="/app/ai" className="inline-flex items-center gap-1 hover:underline">
            <Bot className="h-4 w-4" />
            AI Agents
          </Link>
          <Link href="/app/journal" className="inline-flex items-center gap-1 hover:underline">
            Journal
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
