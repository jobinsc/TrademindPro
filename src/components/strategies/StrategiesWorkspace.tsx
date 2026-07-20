'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, OctagonX, Pencil, Play, Plus, Square, Trash2, Workflow, X } from 'lucide-react';
import {
  STRATEGY_CATALOG_PRESETS,
  StrategyGroupedTemplateList,
} from '@/components/ui/StrategyPicker';
import SymbolAutocomplete from '@/components/ui/SymbolAutocomplete';
import InfoBubble from '@/components/ui/InfoBubble';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import { useStrategies } from '@/hooks/useStrategies';
import { useStrategyBuilderSettings } from '@/hooks/useStrategyBuilderSettings';
import type { StrategyBuilderSettings } from '@/lib/strategy-builder-settings';
import {
  STRATEGY_STATUS_HELP,
  STRATEGY_TEMPLATES,
  TIMEFRAMES,
  emptyStrategyInput,
  summarizeStrategies,
  defaultSymbolForMarket,
  type Strategy,
  type StrategyInput,
  type StrategyStatus,
} from '@/lib/strategies';

export default function StrategiesWorkspace() {
  const { strategies, ready, add, update, remove } = useStrategies();
  const { ready: builderReady, settings: builderSettings, update: updateBuilder } =
    useStrategyBuilderSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [form, setForm] = useState<StrategyInput>(emptyStrategyInput());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL' | StrategyStatus>('ALL');
  /** single = click opens one template; multi = tick several then add */
  const [pickMode, setPickMode] = useState<'single' | 'multi'>('single');
  const [pickedTemplates, setPickedTemplates] = useState<CatalogStrategyId[]>([]);
  const [instrumentCounts, setInstrumentCounts] = useState<{ nse: number; bse: number } | null>(
    null
  );

  useEffect(() => {
    fetch('/api/market/instruments?limit=1')
      .then((r) => r.json())
      .then((d: { ok?: boolean; nseCount?: number; bseCount?: number }) => {
        if (d.ok) {
          setInstrumentCounts({
            nse: d.nseCount ?? 0,
            bse: d.bseCount ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const stats = useMemo(() => summarizeStrategies(strategies), [strategies]);
  const filtered = useMemo(() => {
    if (filter === 'ALL') return strategies;
    return strategies.filter((s) => s.status === filter);
  }, [strategies, filter]);

  function openCreate(fromTemplate?: (typeof STRATEGY_TEMPLATES)[0]) {
    setEditing(null);
    setForm(
      fromTemplate
        ? {
            name: fromTemplate.name,
            market: fromTemplate.market,
            symbol: fromTemplate.symbol || defaultSymbolForMarket(fromTemplate.market),
            stockName: fromTemplate.stockName || '',
            timeframe: fromTemplate.timeframe,
            entryRule: fromTemplate.entryRule,
            exitRule: fromTemplate.exitRule,
            stopLoss: fromTemplate.stopLoss,
            target: fromTemplate.target,
            stopLossPoints: fromTemplate.stopLossPoints ?? 50,
            targetPoints: fromTemplate.targetPoints ?? 75,
            status: 'draft',
            notes: '',
            catalogId: fromTemplate.catalogId,
          }
        : emptyStrategyInput()
    );
    if (!fromTemplate && builderReady) {
      setForm((f) => ({
        ...f,
        market: builderSettings.defaultMarket,
        timeframe: builderSettings.defaultTimeframe,
        symbol:
          builderSettings.defaultSymbol ||
          defaultSymbolForMarket(builderSettings.defaultMarket),
      }));
    }
    setError('');
    setOpen(true);
  }

  function openEdit(s: Strategy) {
    setEditing(s);
    setForm({
      name: s.name,
      market: s.market,
      symbol: s.symbol || defaultSymbolForMarket(s.market),
      stockName: s.stockName || '',
      timeframe: s.timeframe,
      entryRule: s.entryRule,
      exitRule: s.exitRule,
      stopLoss: s.stopLoss,
      target: s.target,
      stopLossPoints: s.stopLossPoints,
      targetPoints: s.targetPoints,
      status: s.status,
      notes: s.notes,
      catalogId: s.catalogId,
    });
    setError('');
    setOpen(true);
  }


  function addPickedTemplates() {
    const list = STRATEGY_TEMPLATES.filter(
      (t) => t.catalogId && pickedTemplates.includes(t.catalogId as CatalogStrategyId)
    );
    for (const t of list) {
      add({
        name: t.name,
        market: t.market,
        symbol: t.symbol || defaultSymbolForMarket(t.market),
        stockName: '',
        timeframe: t.timeframe,
        entryRule: t.entryRule,
        exitRule: t.exitRule,
        stopLoss: t.stopLoss,
        target: t.target,
        stopLossPoints: t.stopLossPoints ?? 50,
        targetPoints: t.targetPoints ?? 75,
        status: 'draft',
        notes: '',
        catalogId: t.catalogId,
      });
    }
    setPickedTemplates([]);
    setPickMode('single');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Enter a strategy name');
      return;
    }
    if (!form.entryRule.trim() || !form.exitRule.trim()) {
      setError('Entry and exit rules are required');
      return;
    }
    const sym = form.symbol.trim().toUpperCase();
    if ((form.market === 'NSE' || form.market === 'BSE') && !sym) {
      setError('Pick a stock from the NSE/BSE list');
      return;
    }
    const sl = Number(form.stopLossPoints);
    const tg = Number(form.targetPoints);
    const payload: StrategyInput = {
      ...form,
      symbol:
        sym ||
        defaultSymbolForMarket(form.market),
      stockName: form.stockName?.trim() || '',
      stopLossPoints: Number.isFinite(sl) && sl > 0 ? sl : null,
      targetPoints: Number.isFinite(tg) && tg > 0 ? tg : null,
    };
    if (editing) update(editing.id, payload);
    else add(payload);
    setOpen(false);
  }

  function startStrategy(s: Strategy) {
    update(s.id, { ...s, status: 'ready' });
  }

  function stopStrategy(s: Strategy) {
    update(s.id, { ...s, status: 'paused' });
  }

  function forceStopAll() {
    for (const s of strategies) {
      if (s.status === 'ready' || s.status === 'live') {
        update(s.id, { ...s, status: 'paused' });
      }
    }
  }

  if (!ready || !builderReady) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading strategies…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 4 · Strategies
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Strategy Builder
            </h1>
            <InfoBubble title="About Strategies">
              Define entry, exit, stop-loss and target in <strong>points</strong>. Search any NSE/BSE
              stock by name or symbol — same full list as Backtesting and Paper Trading.
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ModuleSettingsButton
            open={builderSettings.settingsOpen}
            onToggle={() => updateBuilder({ settingsOpen: !builderSettings.settingsOpen })}
          />
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          New strategy
        </button>
        </div>
      </div>

      <ModuleSettingsPanel
        open={builderSettings.settingsOpen}
        title="Strategy Builder settings"
        description="Defaults when creating strategies and run controls for saved strategies — only on this tab."
        controls={
          <>
            <ModuleRunButton
              variant="start"
              onClick={() => {
                for (const s of strategies.filter((x) => x.status === 'draft')) {
                  update(s.id, { ...s, status: 'ready' });
                }
              }}
            >
              <Play className="h-4 w-4" />
              Start all drafts
            </ModuleRunButton>
            <ModuleRunButton variant="stop" onClick={forceStopAll}>
              <Square className="h-4 w-4" />
              Stop all running
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={forceStopAll}>
              <OctagonX className="h-4 w-4" />
              Force stop all
            </ModuleRunButton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Default symbol (NSE / BSE / index)
            </span>
            <SymbolAutocomplete
              value={builderSettings.defaultSymbol}
              onChange={(sym) => updateBuilder({ defaultSymbol: sym.toUpperCase() })}
              exchange="ALL"
              placeholder="Search all stocks — e.g. RELIANCE, TCS…"
              className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
            <span className="mt-1 block text-[11px] text-sky-ink/45">
              {instrumentCounts
                ? `Full universe: ${instrumentCounts.nse.toLocaleString()} NSE + ${instrumentCounts.bse.toLocaleString()} BSE equities`
                : 'Type to search the full NSE/BSE list'}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Default market
            </span>
            <select
              value={builderSettings.defaultMarket}
              onChange={(e) =>
                updateBuilder({
                  defaultMarket: e.target.value as StrategyBuilderSettings['defaultMarket'],
                })
              }
              className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm"
            >
              {(['NSE', 'BSE', 'NIFTY', 'BANKNIFTY'] as const).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Default timeframe
            </span>
            <select
              value={builderSettings.defaultTimeframe}
              onChange={(e) => updateBuilder({ defaultTimeframe: e.target.value })}
              className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </ModuleSettingsPanel>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="All" value={String(stats.total)} hint="Every saved strategy" />
        <Stat label="Draft" value={String(stats.draft)} hint="Still editing" />
        <Stat label="On" value={String(stats.ready)} hint="Ready to use" />
        <Stat label="Stopped" value={String(stats.paused)} hint="Temporarily off" />
        <Stat label="Live" value={String(stats.live)} hint="Marked for live/auto" />
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Start from template · {STRATEGY_TEMPLATES.length} popular
          </p>
          <div className="flex rounded-xl border border-[#cfe0ee] bg-white p-1">
            <button
              type="button"
              onClick={() => {
                setPickMode('single');
                setPickedTemplates([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pickMode === 'single' ? 'bg-sky-mist text-sky-deep' : 'text-sky-ink/50'
              }`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setPickMode('multi')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pickMode === 'multi' ? 'bg-sky-mist text-sky-deep' : 'text-sky-ink/50'
              }`}
            >
              Multi
            </button>
          </div>
        </div>
        <p className="mt-1 text-[12px] text-sky-ink/50">
          {pickMode === 'single'
            ? 'Pick from full catalog dropdown (same as Backtesting).'
            : 'Use ON/OFF or All ON/OFF per group, then Add selected.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.values(STRATEGY_CATALOG_PRESETS).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setPickedTemplates(preset.ids)}
              className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink/70 hover:border-sky-mid/40"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <StrategyGroupedTemplateList
            pickMode={pickMode}
            pickedIds={pickedTemplates}
            onChangePicked={setPickedTemplates}
            onSinglePick={(id) => {
              const t = STRATEGY_TEMPLATES.find((x) => x.catalogId === id);
              if (t) openCreate(t);
            }}
          />
        </div>
        {pickMode === 'multi' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pickedTemplates.length === 0}
              onClick={addPickedTemplates}
              className="rounded-xl bg-sky-deep px-4 py-2 text-sm font-semibold text-white hover:bg-sky-ink disabled:opacity-40"
            >
              Add selected ({pickedTemplates.length})
            </button>
            <button
              type="button"
              onClick={() =>
                setPickedTemplates(
                  STRATEGY_TEMPLATES.map((t) => t.catalogId).filter(Boolean) as CatalogStrategyId[]
                )
              }
              className="rounded-xl border border-[#cfe0ee] px-3 py-2 text-xs font-semibold text-sky-ink/70"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setPickedTemplates([])}
              className="rounded-xl border border-[#cfe0ee] px-3 py-2 text-xs font-semibold text-sky-ink/70"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'draft', 'ready', 'paused', 'live'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                filter === s
                  ? 'bg-sky-deep text-white'
                  : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee]'
              }`}
            >
              {s === 'ready' ? 'On' : s === 'paused' ? 'Stopped' : s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-1 rounded-xl border border-[#cfe0ee]/80 bg-sky-soft/30 px-3 py-3 text-[12px] text-sky-ink/70">
          {STRATEGY_STATUS_HELP.map((row) => (
            <li key={row.id}>
              <span className="font-semibold text-sky-ink">{row.label}:</span> {row.meaning}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Workflow className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
            <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
              No strategies yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
              Create one from a template or write your own rules.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e8f2fa]">
            {filtered.map((s) => (
              <li key={s.id} className="px-4 py-4 hover:bg-sky-soft/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[15px] font-semibold text-sky-ink">
                        {s.name}
                      </h3>
                      <StatusBadge status={s.status} />
                      <span className="text-[11px] font-medium text-sky-ink/40">
                        {s.symbol ? `${s.symbol} · ` : ''}
                        {s.market} · {s.timeframe}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-sky-ink/70">
                      <span className="font-semibold text-emerald-700">Entry: </span>
                      {s.entryRule}
                    </p>
                    <p className="mt-1 text-sm text-sky-ink/70">
                      <span className="font-semibold text-rose-600">Exit: </span>
                      {s.exitRule}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-sky-ink/70">
                      SL {s.stopLossPoints != null ? `${s.stopLossPoints} pts` : '—'} · Tgt{' '}
                      {s.targetPoints != null ? `${s.targetPoints} pts` : '—'}
                      {(s.stopLoss || s.target) && (
                        <span className="ml-2 font-normal text-sky-ink/45">
                          ({[s.stopLoss, s.target].filter(Boolean).join(' · ')})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(s.status === 'draft' || s.status === 'paused') && (
                      <button
                        type="button"
                        title="Start strategy"
                        onClick={() => startStrategy(s)}
                        className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    {(s.status === 'ready' || s.status === 'live') && (
                      <button
                        type="button"
                        title="Stop strategy"
                        onClick={() => stopStrategy(s)}
                        className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-mist hover:text-sky-deep"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete “${s.name}”?`)) remove(s.id);
                      }}
                      className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-5 text-[12px] text-sky-ink/45">
        Use in Backtesting and Paper Trading from each module&apos;s Settings panel.{' '}
        <Link href="/app/backtesting" className="font-semibold text-sky-deep hover:underline">
          Backtesting
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  {editing ? 'Edit strategy' : 'New strategy'}
                </p>
                <h2 className="font-display text-lg font-semibold text-sky-ink">
                  {editing ? editing.name : 'Build rules'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}
              <label className="block">
                <span className={labelClass}>Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelClass}>Market</span>
                  <select
                    value={form.market}
                    onChange={(e) => {
                      const market = e.target.value as StrategyInput['market'];
                      setForm({
                        ...form,
                        market,
                        symbol: defaultSymbolForMarket(market),
                        stockName: market === 'NSE' || market === 'BSE' ? form.stockName : '',
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="NSE">NSE (stocks)</option>
                    <option value="BSE">BSE (stocks)</option>
                    <option value="NIFTY">NIFTY (index)</option>
                    <option value="BANKNIFTY">BANKNIFTY (index)</option>
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Timeframe</span>
                  <select
                    value={form.timeframe}
                    onChange={(e) => setForm({ ...form, timeframe: e.target.value })}
                    className={inputClass}
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={labelClass}>
                  {form.market === 'NIFTY' || form.market === 'BANKNIFTY'
                    ? 'Index symbol'
                    : 'Stock symbol (full NSE/BSE list)'}
                </span>
                {form.market === 'NIFTY' || form.market === 'BANKNIFTY' ? (
                  <input
                    value={form.symbol}
                    readOnly
                    className={`${inputClass} bg-sky-soft/40`}
                  />
                ) : (
                  <SymbolAutocomplete
                    value={form.symbol}
                    onChange={(sym) => setForm({ ...form, symbol: sym.toUpperCase() })}
                    onPick={(item) =>
                      setForm({
                        ...form,
                        symbol: item.symbol,
                        stockName: item.name,
                        market: item.exchange,
                      })
                    }
                    exchange={form.market === 'BSE' ? 'BSE' : form.market === 'NSE' ? 'NSE' : 'ALL'}
                    placeholder="Type company name or symbol — all stocks…"
                    className={inputClass}
                    required
                  />
                )}
                {form.stockName && form.market !== 'NIFTY' && form.market !== 'BANKNIFTY' ? (
                  <span className="mt-1 block text-[11px] text-sky-ink/45">{form.stockName}</span>
                ) : null}
                <span className="mt-1 block text-[11px] text-sky-ink/45">
                  {instrumentCounts
                    ? `Search ${instrumentCounts.nse.toLocaleString()} NSE + ${instrumentCounts.bse.toLocaleString()} BSE names`
                    : 'Same stock search as Backtesting — type to find any scrip'}
                </span>
              </label>
              <label className="block">
                <span className={labelClass}>Entry rule</span>
                <textarea
                  value={form.entryRule}
                  onChange={(e) => setForm({ ...form, entryRule: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  required
                />
              </label>
              <label className="block">
                <span className={labelClass}>Exit rule</span>
                <textarea
                  value={form.exitRule}
                  onChange={(e) => setForm({ ...form, exitRule: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelClass}>Stop-loss (points)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.stopLossPoints ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stopLossPoints: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={inputClass}
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Target (points)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.targetPoints ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        targetPoints: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={inputClass}
                    placeholder="e.g. 75"
                  />
                </label>
              </div>
              <p className="text-[11px] text-sky-ink/45">
                Points = index/price points from entry (e.g. Nifty SL 50 pts, Tgt 75 pts).
              </p>
              <label className="block">
                <span className={labelClass}>Stop-loss note (optional)</span>
                <input
                  value={form.stopLoss}
                  onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. below swing low"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Target note (optional)</span>
                <input
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. trail after 1R"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Status</span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as StrategyStatus })
                  }
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="ready">On</option>
                  <option value="paused">Stopped</option>
                  <option value="live">Live</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-[#cfe0ee] py-2.5 text-sm font-semibold text-sky-ink/70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
                >
                  Save strategy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold text-sky-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-sky-ink/45">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: StrategyStatus }) {
  const styles = {
    draft: 'bg-sky-soft text-sky-ink/60',
    ready: 'bg-sky-mist text-sky-deep',
    paused: 'bg-amber-50 text-amber-700',
    live: 'bg-emerald-50 text-emerald-700',
  };
  const label =
    status === 'ready' ? 'On' : status === 'paused' ? 'Stopped' : status === 'live' ? 'Live' : 'Draft';
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${styles[status]}`}>
      {label}
    </span>
  );
}

const labelClass =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45';
const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
