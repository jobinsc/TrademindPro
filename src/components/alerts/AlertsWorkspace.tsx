'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useAlerts } from '@/hooks/useAlerts';
import { useWatchlists } from '@/hooks/useWatchlists';
import {
  emptyAlertInput,
  summarizeAlerts,
  type AlertCondition,
  type AlertInput,
  type AlertPriority,
  type AlertStatus,
} from '@/lib/alerts';
import type { Exchange } from '@/lib/watchlist';
import { formatCurrency } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';

export default function AlertsWorkspace() {
  const { alerts, ready, addAlert, updateStatus, deleteAlert } = useAlerts();
  const { lists, ready: watchReady } = useWatchlists();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AlertInput>(emptyAlertInput());
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL');

  const stats = useMemo(() => summarizeAlerts(alerts), [alerts]);

  const watchSymbols = useMemo(() => {
    const map = new Map<string, { symbol: string; exchange: Exchange; name: string }>();
    for (const list of lists) {
      for (const s of list.symbols) {
        map.set(`${s.exchange}:${s.symbol}`, {
          symbol: s.symbol,
          exchange: s.exchange,
          name: s.name,
        });
      }
    }
    return [...map.values()];
  }, [lists]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const q = query.trim().toUpperCase();
      const matchQ =
        !q ||
        a.symbol.includes(q) ||
        a.note.toUpperCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      return matchQ && matchStatus;
    });
  }, [alerts, query, statusFilter]);

  const priorityRank = { critical: 3, medium: 2, low: 1 } as const;
  const statusRank = { active: 3, triggered: 2, paused: 1 } as const;
  const { sorted: displayAlerts, sort, toggle } = useSortable(
    filtered,
    (a, key) => {
      switch (key) {
        case 'symbol':
          return a.symbol;
        case 'target':
          return a.targetPrice;
        case 'priority':
          return priorityRank[a.priority] ?? 0;
        case 'status':
          return statusRank[a.status] ?? 0;
        case 'note':
          return a.note || '';
        default:
          return '';
      }
    },
    { key: 'priority', dir: 'desc' }
  );

  function openCreate() {
    setForm(emptyAlertInput());
    setError('');
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.symbol.trim()) {
      setError('Enter a symbol');
      return;
    }
    if (form.targetPrice <= 0) {
      setError('Target price must be greater than 0');
      return;
    }
    addAlert(form);
    setOpen(false);
  }

  function pickFromWatchlist(symbol: string, exchange: Exchange) {
    setForm((prev) => ({ ...prev, symbol, exchange }));
  }

  if (!ready || !watchReady) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading alerts…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 3 · Alerts
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Alerts
            </h1>
            <InfoBubble title="About Alerts">
              Set price alerts (above / below). When live market data is connected, these will trigger
              automatically. For now you can manage and mark them manually.
            </InfoBubble>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          New alert
        </button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="All alerts" value={String(stats.total)} />
        <Stat label="Active" value={String(stats.active)} />
        <Stat label="Paused" value={String(stats.paused)} />
        <Stat label="Triggered" value={String(stats.triggered)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or note…"
            className="w-full rounded-xl border border-[#cfe0ee] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
          />
        </div>
        <div className="flex rounded-xl border border-[#cfe0ee] bg-white p-1">
          {(['ALL', 'active', 'paused', 'triggered'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === s
                  ? 'bg-sky-mist text-sky-deep'
                  : 'text-sky-ink/50 hover:text-sky-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
            <p className="mt-4 font-display text-lg font-semibold text-sky-ink">
              {alerts.length === 0 ? 'No alerts yet' : 'No matches'}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
              {alerts.length === 0
                ? 'Create a price alert — e.g. notify when RELIANCE goes above ₹3000.'
                : 'Try another search or filter.'}
            </p>
            {alerts.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
              >
                <Plus className="h-4 w-4" />
                Create first alert
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8f2fa] bg-sky-soft/60">
                  <SortableTh
                    label="Symbol"
                    className="px-4 py-3"
                    active={sort.key === 'symbol'}
                    dir={sort.dir}
                    onClick={() => toggle('symbol')}
                  />
                  <SortableTh
                    label="Condition"
                    className="px-4 py-3"
                    active={sort.key === 'target'}
                    dir={sort.dir}
                    onClick={() => toggle('target')}
                  />
                  <SortableTh
                    label="Priority"
                    className="px-4 py-3"
                    active={sort.key === 'priority'}
                    dir={sort.dir}
                    onClick={() => toggle('priority')}
                  />
                  <SortableTh
                    label="Status"
                    className="px-4 py-3"
                    active={sort.key === 'status'}
                    dir={sort.dir}
                    onClick={() => toggle('status')}
                  />
                  <SortableTh
                    label="Note"
                    className="px-4 py-3"
                    active={sort.key === 'note'}
                    dir={sort.dir}
                    onClick={() => toggle('note')}
                  />
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sky-ink">{alert.symbol}</p>
                      <p className="text-[11px] text-sky-ink/40">{alert.exchange}</p>
                    </td>
                    <td className="px-4 py-3 text-sky-ink/75">
                      Price {alert.condition}{' '}
                      <strong className="text-sky-ink">
                        {formatCurrency(alert.targetPrice)}
                      </strong>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={alert.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-sky-ink/55">
                      {alert.note || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {alert.status === 'active' && (
                          <>
                            <button
                              type="button"
                              title="Mark triggered"
                              onClick={() => updateStatus(alert.id, 'triggered')}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-amber-50 hover:text-amber-700"
                            >
                              <Zap className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Pause"
                              onClick={() => updateStatus(alert.id, 'paused')}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-mist hover:text-sky-deep"
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {alert.status === 'paused' && (
                          <button
                            type="button"
                            title="Resume"
                            onClick={() => updateStatus(alert.id, 'active')}
                            className="rounded-lg p-2 text-sky-ink/40 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {alert.status === 'triggered' && (
                          <button
                            type="button"
                            title="Re-activate"
                            onClick={() => updateStatus(alert.id, 'active')}
                            className="rounded-lg p-2 text-sky-ink/40 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => {
                            if (window.confirm('Delete this alert?')) deleteAlert(alert.id);
                          }}
                          className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-sky-ink/45">
        Tip: Add symbols to your{' '}
        <Link href="/app/watchlist" className="font-semibold text-sky-deep hover:underline">
          Watchlist
        </Link>{' '}
        first, then pick them when creating an alert.
        <ArrowRight className="ml-1 inline h-3 w-3" />
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
                  New alert
                </p>
                <h2 className="font-display text-lg font-semibold text-sky-ink">Price alert</h2>
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

              {watchSymbols.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                    From your watchlist
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {watchSymbols.slice(0, 12).map((s) => (
                      <button
                        key={`${s.exchange}-${s.symbol}`}
                        type="button"
                        onClick={() => pickFromWatchlist(s.symbol, s.exchange)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                          form.symbol === s.symbol && form.exchange === s.exchange
                            ? 'bg-sky-mist text-sky-deep ring-sky-mid/40'
                            : 'bg-white text-sky-ink/65 ring-[#cfe0ee] hover:bg-sky-soft'
                        }`}
                      >
                        {s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Symbol
                </span>
                <input
                  value={form.symbol}
                  onChange={(e) =>
                    setForm({ ...form, symbol: e.target.value.toUpperCase() })
                  }
                  placeholder="RELIANCE"
                  className={inputClass}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Exchange
                </span>
                <select
                  value={form.exchange}
                  onChange={(e) =>
                    setForm({ ...form, exchange: e.target.value as Exchange })
                  }
                  className={inputClass}
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                    Condition
                  </span>
                  <select
                    value={form.condition}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        condition: e.target.value as AlertCondition,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="above">Price above</option>
                    <option value="below">Price below</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                    Target price
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.targetPrice || ''}
                    onChange={(e) =>
                      setForm({ ...form, targetPrice: Number(e.target.value) })
                    }
                    className={inputClass}
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Priority
                </span>
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priority: e.target.value as AlertPriority,
                    })
                  }
                  className={inputClass}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="critical">Critical</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Note (optional)
                </span>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Take profit / buy zone…"
                  className={inputClass}
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
                  Save alert
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

function StatusBadge({ status }: { status: AlertStatus }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-amber-50 text-amber-700',
    triggered: 'bg-sky-mist text-sky-deep',
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: AlertPriority }) {
  const styles = {
    low: 'bg-sky-soft text-sky-ink/60',
    medium: 'bg-sky-mist text-sky-deep',
    critical: 'bg-rose-50 text-rose-600',
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${styles[priority]}`}>
      {priority}
    </span>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
