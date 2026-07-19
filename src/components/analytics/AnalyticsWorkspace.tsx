'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useTrades } from '@/hooks/useTrades';
import { buildAnalytics } from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';

const BLUE = '#1a6ba8';
const MID = '#5ba3d9';
const SOFT = '#cfe0ee';
const GREEN = '#059669';
const ROSE = '#e11d48';

export default function AnalyticsWorkspace() {
  const { trades, ready } = useTrades();
  const analytics = useMemo(() => buildAnalytics(trades), [trades]);
  const { summary } = analytics;

  const winLossData = [
    { name: 'Wins', value: summary.wins, color: GREEN },
    { name: 'Losses', value: summary.losses, color: ROSE },
  ].filter((d) => d.value > 0);

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading analytics…
      </div>
    );
  }

  if (summary.closed === 0) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 md:px-8">
        <Header />
        <div className="mt-8 rounded-2xl border border-dashed border-[#b8d4e8] bg-white px-6 py-14 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
          <p className="mt-4 font-display text-lg font-semibold text-sky-ink">
            No closed trades yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
            Analytics use trades you have already sold. Add open trades in the Journal, then close
            them when you exit — charts will appear here automatically.
          </p>
          <Link
            href="/app/journal"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            Go to Trade Journal
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <Header />

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Realized P&L"
          value={formatCurrency(summary.totalPnL)}
          tone={summary.totalPnL > 0 ? 'up' : summary.totalPnL < 0 ? 'down' : 'flat'}
        />
        <Stat label="Win rate" value={`${summary.winRate.toFixed(1)}%`} />
        <Stat label="Profit factor" value={analytics.profitFactor >= 999 ? '∞' : analytics.profitFactor.toFixed(2)} />
        <Stat
          label="Expectancy"
          value={formatCurrency(analytics.expectancy)}
          tone={analytics.expectancy > 0 ? 'up' : analytics.expectancy < 0 ? 'down' : 'flat'}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Closed trades" value={String(summary.closed)} />
        <Stat label="Still open" value={String(summary.open)} />
        <Stat label="Avg win" value={formatCurrency(analytics.avgWin)} tone="up" />
        <Stat label="Avg loss" value={formatCurrency(analytics.avgLoss)} tone="down" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Max drawdown" value={formatCurrency(analytics.maxDrawdown)} tone="down" />
        <Stat label="Best trade" value={formatCurrency(analytics.bestTrade)} tone="up" />
        <Stat label="Worst trade" value={formatCurrency(analytics.worstTrade)} tone="down" />
      </div>

      {/* Equity curve */}
      <Panel title="Equity curve" subtitle="Cumulative P&L from closed trades over time">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.equityCurve}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MID} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={MID} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={SOFT} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5a7a90' }} />
              <YAxis tick={{ fontSize: 11, fill: '#5a7a90' }} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Equity']}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={BLUE}
                strokeWidth={2}
                fill="url(#eqFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Wins vs losses" subtitle="Closed trades only">
          <div className="flex h-56 items-center justify-center">
            {winLossData.length === 0 ? (
              <p className="text-sm text-sky-ink/45">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={winLossData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {winLossData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-1 flex justify-center gap-6 text-sm">
            <span className="text-emerald-600 font-medium">{summary.wins} wins</span>
            <span className="text-rose-500 font-medium">{summary.losses} losses</span>
          </div>
        </Panel>

        <Panel title="P&L by strategy" subtitle="Which setups make money">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byStrategy} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid stroke={SOFT} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#5a7a90' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 11, fill: '#5a7a90' }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatCurrency(Number(value ?? 0)), 'P&L']}
                />
                <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                  {analytics.byStrategy.map((row) => (
                    <Cell key={row.name} fill={row.pnl >= 0 ? GREEN : ROSE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="P&L by symbol" subtitle="Top instruments">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.bySymbol}>
                <CartesianGrid stroke={SOFT} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5a7a90' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5a7a90' }} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatCurrency(Number(value ?? 0)), 'P&L']}
                />
                <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                  {analytics.bySymbol.map((row) => (
                    <Cell key={row.name} fill={row.pnl >= 0 ? MID : ROSE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="P&L by emotion" subtitle="How mindset affects results">
          <ul className="space-y-2.5">
            {analytics.byEmotion.length === 0 ? (
              <li className="text-sm text-sky-ink/45">No data</li>
            ) : (
              analytics.byEmotion.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between rounded-xl bg-sky-soft/70 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-sky-ink">
                    {row.name}
                    <span className="ml-2 text-[11px] text-sky-ink/40">{row.count} trades</span>
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      row.pnl > 0
                        ? 'text-emerald-600'
                        : row.pnl < 0
                          ? 'text-rose-500'
                          : 'text-sky-ink'
                    }`}
                  >
                    {formatCurrency(row.pnl)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
          Module 1 · Analytics
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
          Performance Analytics
        </h1>
        <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
          Live numbers from your journal — win rate, equity curve, strategy and emotion breakdown.
        </p>
      </div>
      <Link
        href="/app/journal"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
      >
        Open Journal
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'flat',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p
        className={`mt-1.5 font-display text-xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-sky-ink">{title}</h2>
      <p className="mt-0.5 text-[12px] text-sky-ink/45">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #cfe0ee',
  background: '#fff',
  fontSize: 12,
};
