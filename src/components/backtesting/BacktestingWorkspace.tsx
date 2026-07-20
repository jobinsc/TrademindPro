'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowRight, FlaskConical, OctagonX, Play, Square, Trash2 } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import { useBacktests } from '@/hooks/useBacktests';
import { useBacktestSettings } from '@/hooks/useBacktestSettings';
import { useStrategies } from '@/hooks/useStrategies';
import { todayISO } from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';
import type { BacktestRun } from '@/lib/backtest';
import SymbolAutocomplete from '@/components/ui/SymbolAutocomplete';
import {
  StrategyGroupedMultiCompact,
  StrategyGroupedSelect,
} from '@/components/ui/StrategyPicker';
import {
  ALL_TIMEFRAMES,
  POPULAR_STRATEGIES,
  catalogDefaultPoints,
  catalogStrategyById,
  timeframeNote,
} from '@/lib/strategy-catalog';

export default function BacktestingWorkspace() {
  const { strategies, ready: stratReady } = useStrategies();
  const { runs, ready, saveRun, remove } = useBacktests();
  const { ready: settingsReady, settings: btSettings, update: updateBtSettings } =
    useBacktestSettings();
  const hydrated = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [pickMode, setPickMode] = useState<'single' | 'multi'>('single');
  const [strategyId, setStrategyId] = useState('ema_cross');
  const [strategyIds, setStrategyIds] = useState<string[]>(['ema_cross']);
  const [symbol, setSymbol] = useState('NIFTY');
  const [timeframe, setTimeframe] = useState('15m');
  const [fromDate, setFromDate] = useState('2024-01-01');
  const [toDate, setToDate] = useState(todayISO());
  const [capital, setCapital] = useState(100000);
  const pts0 = catalogDefaultPoints('ema_cross');
  const [stopLossPoints, setStopLossPoints] = useState(pts0.sl);
  const [targetPoints, setTargetPoints] = useState(pts0.tg);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<BacktestRun | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!settingsReady || hydrated.current) return;
    hydrated.current = true;
    setPickMode(btSettings.pickMode);
    setStrategyId(btSettings.strategyId);
    setStrategyIds(btSettings.strategyIds);
    setSymbol(btSettings.symbol);
    setTimeframe(btSettings.timeframe);
    setFromDate(btSettings.fromDate);
    setToDate(btSettings.toDate);
    setCapital(btSettings.capital);
    setStopLossPoints(btSettings.stopLossPoints);
    setTargetPoints(btSettings.targetPoints);
  }, [settingsReady, btSettings]);

  useEffect(() => {
    if (!settingsReady || !hydrated.current) return;
    updateBtSettings({
      pickMode,
      strategyId,
      strategyIds,
      symbol,
      timeframe,
      fromDate,
      toDate,
      capital,
      stopLossPoints,
      targetPoints,
    });
  }, [
    settingsReady,
    pickMode,
    strategyId,
    strategyIds,
    symbol,
    timeframe,
    fromDate,
    toDate,
    capital,
    stopLossPoints,
    targetPoints,
    updateBtSettings,
  ]);

  const settingsOpen = btSettings.settingsOpen;

  function resolveEngineId(id: string): { engineId: string; name: string } | null {
    const catalog = catalogStrategyById(id);
    if (catalog) return { engineId: catalog.id, name: catalog.name };
    const mine = strategies.find((s) => s.id === id);
    if (!mine) return null;
    const linked =
      mine.catalogId || POPULAR_STRATEGIES.find((s) => s.name === mine.name)?.id;
    if (!linked) return null;
    return { engineId: String(linked), name: mine.name };
  }

  function applyPointsForStrategy(id: string) {
    const mine = strategies.find((s) => s.id === id);
    if (mine?.stopLossPoints || mine?.targetPoints) {
      if (mine.stopLossPoints) setStopLossPoints(mine.stopLossPoints);
      if (mine.targetPoints) setTargetPoints(mine.targetPoints);
      return;
    }
    const linked = resolveEngineId(id)?.engineId || id;
    const p = catalogDefaultPoints(linked);
    setStopLossPoints(p.sl);
    setTargetPoints(p.tg);
  }

  function changeStrategyIds(ids: string[]) {
    setStrategyIds(ids.length ? ids : [strategyId || 'ema_cross']);
  }

  async function runOne(engineId: string, name: string): Promise<BacktestRun | null> {
    const res = await fetch('/api/market/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortRef.current?.signal,
      body: JSON.stringify({
        strategyId: engineId,
        strategyName: name,
        symbol: symbol.trim().toUpperCase() || 'NIFTY',
        timeframe,
        fromDate,
        toDate,
        initialCapital: capital,
        stopLossPoints,
        targetPoints,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      run?: BacktestRun;
    };
    if (!res.ok || !data.ok || !data.run) {
      throw new Error(data.error || `Backtest failed for ${name}`);
    }
    return data.run;
  }

  async function handleRun() {
    setError('');
    setProgress('');
    if (fromDate > toDate) {
      setError('From date must be before to date');
      return;
    }
    if (toDate > todayISO()) {
      setError('To date cannot be in the future');
      return;
    }

    const ids = pickMode === 'single' ? [strategyId] : strategyIds;
    const resolved = ids
      .map((id) => resolveEngineId(id))
      .filter((x): x is { engineId: string; name: string } => !!x);

    if (!resolved.length) {
      setError(
        'Pick at least one popular strategy (or a saved strategy linked to the catalog).'
      );
      return;
    }
    if (stopLossPoints <= 0 || targetPoints <= 0) {
      setError('Stop-loss and Target must be positive points');
      return;
    }

    setRunning(true);
    abortRef.current = new AbortController();
    try {
      let last: BacktestRun | null = null;
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];
        setProgress(`Running ${i + 1}/${resolved.length}: ${r.name}`);
        const run = await runOne(r.engineId, r.name);
        if (run) {
          saveRun(run);
          last = run;
        }
      }
      if (last) setSelected(last);
      setProgress('');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setProgress('Backtest stopped');
      } else {
        setError(e instanceof Error ? e.message : 'Backtest request failed');
      }
    } finally {
      setRunning(false);
      setProgress('');
      abortRef.current = null;
    }
  }

  function handleStopRun() {
    abortRef.current?.abort();
    setRunning(false);
    setProgress('Stopped');
  }

  function handleForceStop() {
    abortRef.current?.abort();
    setRunning(false);
    setProgress('');
    setError('');
  }

  if (!ready || !stratReady || !settingsReady) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading backtesting…
      </div>
    );
  }

  const chartRun = selected || runs[0] || null;
  const tfNote = timeframeNote(timeframe);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
          Module 4 · Backtesting
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Backtesting Engine
          </h1>
          <InfoBubble title="About Backtesting">
            Run one strategy or several. Set SL and Target in <strong>points</strong>. Uses real
            historical candles (spot).
          </InfoBubble>
        </div>
        </div>
        <ModuleSettingsButton
          open={settingsOpen}
          onToggle={() => updateBtSettings({ settingsOpen: !settingsOpen })}
        />
      </div>

      <ModuleSettingsPanel
        open={settingsOpen}
        title="Backtest settings"
        description="Strategy, symbol, timeframe, SL/target, dates, and capital — saved for this tab only."
        controls={
          <>
            <ModuleRunButton variant="start" onClick={() => void handleRun()} disabled={running}>
              <Play className="h-4 w-4" />
              {running
                ? 'Running…'
                : pickMode === 'multi'
                  ? `Run ${strategyIds.length} backtest(s)`
                  : 'Run backtest'}
            </ModuleRunButton>
            <ModuleRunButton variant="stop" onClick={handleStopRun} disabled={!running}>
              <Square className="h-4 w-4" />
              Stop run
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={handleForceStop}>
              <OctagonX className="h-4 w-4" />
              Force stop
            </ModuleRunButton>
          </>
        }
      >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Run setup</h2>
            </div>
            <div className="flex rounded-xl border border-[#cfe0ee] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setPickMode('single')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  pickMode === 'single' ? 'bg-sky-mist text-sky-deep' : 'text-sky-ink/50'
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => setPickMode('multi')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  pickMode === 'multi' ? 'bg-sky-mist text-sky-deep' : 'text-sky-ink/50'
                }`}
              >
                Multi
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {progress && (
            <div className="rounded-xl border border-sky-soft bg-sky-soft/40 px-3 py-2 text-sm text-sky-deep">
              {progress}
            </div>
          )}

          {pickMode === 'single' ? (
            <label className="block">
              <span className={labelClass}>Strategy</span>
              <StrategyGroupedSelect
                value={strategyId}
                executableOnly
                nejoicOnly={false}
                onChange={(id) => {
                  setStrategyId(String(id));
                  applyPointsForStrategy(String(id));
                  const c = catalogStrategyById(String(id));
                  if (c?.defaultTimeframe) setTimeframe(c.defaultTimeframe);
                }}
                className={inputClass}
                extraOptgroups={
                  strategies.length > 0
                    ? [
                        {
                          label: 'My strategies',
                          options: strategies.map((s) => ({
                            id: s.id,
                            name: `${s.name}${s.catalogId ? '' : ' (needs catalog link)'}`,
                          })),
                        },
                      ]
                    : []
                }
              />
            </label>
          ) : (
            <div>
              <span className={labelClass}>Strategies ({strategyIds.length} selected)</span>
              <div className="mt-1">
                <StrategyGroupedMultiCompact
                  selected={strategyIds}
                  onChangeSelected={changeStrategyIds}
                  executableOnly
                  nejoicOnly={false}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-sky-deep"
                  onClick={() =>
                    setStrategyIds(POPULAR_STRATEGIES.filter((s) => s.executable).map((s) => s.id))
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-sky-ink/50"
                  onClick={() => setStrategyIds([strategyId || 'ema_cross'])}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          <label className="block">
            <span className={labelClass}>Symbol</span>
            <SymbolAutocomplete
              value={symbol}
              onChange={setSymbol}
              onPick={(item) => setSymbol(item.symbol)}
              placeholder="NIFTY / RELIANCE…"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Timeframe</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className={inputClass}
            >
              {ALL_TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.note ? ' ≈' : ''}
                </option>
              ))}
            </select>
            {tfNote && <p className="mt-1 text-[11px] text-amber-700/80">{tfNote}</p>}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Stop-loss (pts)</span>
              <input
                type="number"
                min={1}
                value={stopLossPoints || ''}
                onChange={(e) => setStopLossPoints(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Target (pts)</span>
              <input
                type="number"
                min={1}
                value={targetPoints || ''}
                onChange={(e) => setTargetPoints(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </label>
          </div>
          <p className="text-[11px] text-sky-ink/45">
            Points from entry (e.g. Nifty SL 50 / Tgt 75). Applied to every selected strategy.
          </p>

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
        </section>
      </div>
      </ModuleSettingsPanel>

      {!settingsOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#cfe0ee] bg-sky-soft/30 px-4 py-3 text-sm text-sky-ink/60">
          <span>
            {symbol} · {pickMode === 'single' ? strategyId : `${strategyIds.length} strategies`} · SL{' '}
            {stopLossPoints} / Tgt {targetPoints}
          </span>
          <ModuleRunButton variant="start" onClick={() => void handleRun()} disabled={running}>
            <Play className="h-4 w-4" />
            Quick run
          </ModuleRunButton>
        </div>
      )}

      <div className="mt-7 space-y-4">
          {chartRun ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Net P&L"
                  value={formatCurrency(chartRun.netPnl)}
                  tone={chartRun.netPnl >= 0 ? 'up' : 'down'}
                />
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
                {chartRun.dataNote && (
                  <p className="mt-1 text-[11px] text-sky-ink/50">{chartRun.dataNote}</p>
                )}
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

              {chartRun.trades && chartRun.trades.length > 0 && (
                <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
                  <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                    Recent trades
                  </h2>
                  <div className="mt-3 max-h-56 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-sky-ink/40">
                          <th className="py-1">Side</th>
                          <th className="py-1">Setup</th>
                          <th className="py-1">Entry</th>
                          <th className="py-1">Exit</th>
                          <th className="py-1 text-right">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...chartRun.trades].reverse().map((t, idx) => (
                          <tr key={`${t.entryAt}-${idx}`} className="border-t border-[#e8f2fa]">
                            <td className="py-1.5 font-semibold">{t.side}</td>
                            <td className="py-1.5 text-sky-ink/60">{t.setup}</td>
                            <td className="py-1.5">{t.entry.toFixed(2)}</td>
                            <td className="py-1.5">{t.exit.toFixed(2)}</td>
                            <td
                              className={`py-1.5 text-right font-semibold ${
                                t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'
                              }`}
                            >
                              {formatCurrency(t.pnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#b8d4e8] bg-white px-6 py-20 text-center">
              <FlaskConical className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
                No backtests yet
              </p>
              <p className="mt-2 text-sm text-sky-ink/55">
                Pick one or more strategies, set SL/Tgt points, then run.
              </p>
            </div>
          )}
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
                    {r.symbol} · {r.timeframe} · {r.ranAt.slice(0, 10)} · {formatCurrency(r.netPnl)}
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
        Historical spot engine · your SL/Tgt points.{' '}
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
