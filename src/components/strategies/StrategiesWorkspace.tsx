'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pencil, Plus, Trash2, Workflow, X } from 'lucide-react';
import { useStrategies } from '@/hooks/useStrategies';
import {
  STRATEGY_TEMPLATES,
  TIMEFRAMES,
  emptyStrategyInput,
  summarizeStrategies,
  type Strategy,
  type StrategyInput,
  type StrategyStatus,
} from '@/lib/strategies';

export default function StrategiesWorkspace() {
  const { strategies, ready, add, update, remove } = useStrategies();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [form, setForm] = useState<StrategyInput>(emptyStrategyInput());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL' | StrategyStatus>('ALL');

  const stats = useMemo(() => summarizeStrategies(strategies), [strategies]);
  const filtered = useMemo(() => {
    if (filter === 'ALL') return strategies;
    return strategies.filter((s) => s.status === filter);
  }, [strategies, filter]);

  function openCreate(fromTemplate?: (typeof STRATEGY_TEMPLATES)[0]) {
    setEditing(null);
    setForm(
      fromTemplate
        ? { ...fromTemplate, status: 'draft', notes: '' }
        : emptyStrategyInput()
    );
    setError('');
    setOpen(true);
  }

  function openEdit(s: Strategy) {
    setEditing(s);
    setForm({
      name: s.name,
      market: s.market,
      timeframe: s.timeframe,
      entryRule: s.entryRule,
      exitRule: s.exitRule,
      stopLoss: s.stopLoss,
      target: s.target,
      status: s.status,
      notes: s.notes,
    });
    setError('');
    setOpen(true);
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
    if (editing) update(editing.id, form);
    else add(form);
    setOpen(false);
  }

  if (!ready) {
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
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Strategy Builder
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Define entry, exit, stop-loss, and target in plain language. Visual drag-and-drop and
            code builder come later.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          New strategy
        </button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="All" value={String(stats.total)} />
        <Stat label="Draft" value={String(stats.draft)} />
        <Stat label="Ready" value={String(stats.ready)} />
        <Stat label="Paused" value={String(stats.paused)} />
        <Stat label="Live" value={String(stats.live)} />
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
          Start from template
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {STRATEGY_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => openCreate(t)}
              className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-3 text-left transition hover:border-sky-mid/40 hover:bg-sky-soft/50"
            >
              <p className="text-sm font-semibold text-sky-ink">{t.name}</p>
              <p className="mt-1 text-[12px] text-sky-ink/50 line-clamp-2">{t.entryRule}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
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
            {s}
          </button>
        ))}
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
                    <p className="mt-1 text-[12px] text-sky-ink/50">
                      SL: {s.stopLoss || '—'} · Target: {s.target || '—'}
                    </p>
                  </div>
                  <div className="flex gap-1">
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
        Next: Backtesting and Auto Execution will use these strategies.{' '}
        <Link href="/app/backtesting" className="font-semibold text-sky-deep hover:underline">
          Backtesting
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
          <button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setOpen(false)} />
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
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft">
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        market: e.target.value as StrategyInput['market'],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                    <option value="NIFTY">NIFTY</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
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
              <label className="block">
                <span className={labelClass}>Stop-loss</span>
                <input
                  value={form.stopLoss}
                  onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. 0.5% or below swing low"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Target</span>
                <input
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. 1:2 RR"
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
                  <option value="ready">Ready</option>
                  <option value="paused">Paused</option>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold text-sky-ink">{value}</p>
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
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

const labelClass =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45';
const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
