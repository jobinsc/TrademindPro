'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, FlaskConical, Play, Trash2 } from 'lucide-react';
import { useBacktests } from '@/hooks/useBacktests';
import { useStrategies } from '@/hooks/useStrategies';
import { todayISO } from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';
import type { BacktestRun } from '@/lib/backtest';

export default function BacktestingWorkspace() {
  const { strategies, ready: stratReady } = useStrategies();
  const { runs, ready, run, remove } = useBacktests();
  const [strategyId, setStrategyId] = useState('');
  const [symbol, setSymbol] = useState('NIFTY');
  const [timeframe, setTimeframe] = useState('15m');
  const [fromDate, setFromDate] = useState('2024-01-01');
  const [toDate, setToDate] = useState(todayISO());
  const [capital, setCapital] = useState(100000);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<BacktestRun | null>(null);
  const [error, setError] = useState('');

  function handleRun() {
    setError('');
    const strat = strategies.find((s) => s.id === strategyId) || strategies[0];
    if (!strat) {
      setError('Create a strategy first in Strategy Builder');
      return;
    }
    if (fromDate > toDate) {
      setError('From date must be before to date');
      return;
    }
    if (toDate > todayISO()) {
      setError('To date cannot be in the future');
      return;
    }
    setRunning(true);
    window.setTimeout(() => {
      const result = run({
        strategyId: strat.id,
        strategyName: strat.name,
        symbol: symbol.trim().toUpperCase() || 'NIFTY',
        timeframe,
        fromDate,
        toDate,
        initialCapital: capital,
      });
      setSelected(result);
      setRunning(false);
    }, 500);
  }

  if (!ready || !stratReady) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading backtesting…
      </div>
    );
  }

  const chartRun = selected || runs[0] || null;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
          Module 4 · Backtesting
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
          Backtesting Engine
        </h1>
        <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
          Run a strategy on historical dates. Results are simulated demo metrics until real NSE/BSE
          history is connected.
        </p>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-5">
        <section className="space-y-3 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">Run setup</h2>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <label className="block">
            <span className={labelClass}>Strategy</span>
            {strategies.length === 0 ? (
              <p className="text-sm text-sky-ink/55">
                No strategies yet.{' '}
                <Link href="/app/strategies" className="font-semibold text-sky-deep hover:underline">
                  Create one
                </Link>
              </p>
            ) : (
              <select
                value={strategyId || strategies[0]?.id}
                onChange={(e) => setStrategyId(e.target.value)}
                className={inputClass}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block">
            <span className={labelClass}>Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="NIFTY"
            />
          </label>

          <label className="block">
            <span className={labelClass}>Timeframe</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className={inputClass}
            >
              {[
                '1m',
                '2m',
                '3m',
                '5m',
                '10m',
                '15m',
                '30m',
                '45m',
                '1H',
                '2H',
                '3H',
                '4H',
                '1D',
                '1W',
                '1M',
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>From</span>
              <input
                type="date"
                value={fromDate}
                max={todayISO()}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>To</span>
              <input
                type="date"
                value={toDate}
                max={todayISO()}
                onChange={(e) => setToDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Initial capital (₹)</span>
            <input
              type="number"
              min={1000}
              value={capital || ''}
              onChange={(e) => setCapital(Number(e.target.value))}
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={handleRun}
            disabled={running || strategies.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {running ? 'Running…' : 'Run backtest'}
          </button>
        </section>

        <div className="space-y-4 lg:col-span-3">
          {chartRun ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Net P&L" value={formatCurrency(chartRun.netPnl)} tone={chartRun.netPnl >= 0 ? 'up' : 'down'} />
                <Stat label="Win rate" value={`${chartRun.winRate.toFixed(1)}%`} />
                <Stat label="Trades" value={String(chartRun.totalTrades)} />
                <Stat label="Max DD" value={formatCurrency(chartRun.maxDrawdown)} tone="down" />
                <Stat label="Profit factor" value={String(chartRun.profitFactor)} />
                <Stat label="Sharpe" value={String(chartRun.sharpe)} />
              </div>

              <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
                <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                  Equity curve · {chartRun.strategyName}
                </h2>
                <p className="text-[12px] text-sky-ink/45">
                  {chartRun.symbol} · {chartRun.timeframe} · {chartRun.fromDate} → {chartRun.toDate}
                </p>
                <div className="mt-4 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartRun.equityCurve}>
                      <defs>
                        <linearGradient id="btFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#5ba3d9" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#5ba3d9" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#cfe0ee" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5a7a90' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#5a7a90' }} width={56} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #cfe0ee',
                          fontSize: 12,
                        }}
                        formatter={(v) => [formatCurrency(Number(v ?? 0)), 'Equity']}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#1a6ba8"
                        strokeWidth={2}
                        fill="url(#btFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#b8d4e8] bg-white px-6 py-20 text-center">
              <FlaskConical className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
                No backtests yet
              </p>
              <p className="mt-2 text-sm text-sky-ink/55">
                Pick a strategy and run your first backtest.
              </p>
            </div>
          )}
        </div>
      </div>

      {runs.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Run history</h2>
          <ul className="mt-3 divide-y divide-[#e8f2fa]">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="text-left text-sm hover:text-sky-deep"
                >
                  <span className="font-semibold text-sky-ink">{r.strategyName}</span>
                  <span className="ml-2 text-sky-ink/45">
                    {r.symbol} · {r.ranAt.slice(0, 10)} · {formatCurrency(r.netPnl)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="rounded-lg p-2 text-sky-ink/35 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-5 text-[12px] text-sky-ink/45">
        Demo engine only — not real historical fills.{' '}
        <Link href="/app/paper-trading" className="font-semibold text-sky-deep hover:underline">
          Paper Trading
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>
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
        className={`mt-1.5 font-display text-lg font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const labelClass =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45';
const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';
