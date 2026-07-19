'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Briefcase, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useHoldings } from '@/hooks/useHoldings';
import { useBroker } from '@/hooks/useBroker';
import {
  SECTORS,
  emptyHoldingInput,
  holdingInvested,
  holdingPnL,
  holdingPnLPct,
  holdingValue,
  summarizeHoldings,
  type Holding,
  type HoldingInput,
} from '@/lib/holdings';
import type { Exchange } from '@/lib/watchlist';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';

export default function HoldingsWorkspace() {
  const { holdings, ready, addHolding, updateHolding, deleteHolding } = useHoldings();
  const { connection } = useBroker();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState<HoldingInput>(emptyHoldingInput());
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const summary = useMemo(() => summarizeHoldings(holdings), [holdings]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return holdings;
    return holdings.filter(
      (h) =>
        h.symbol.includes(q) ||
        h.name.toUpperCase().includes(q) ||
        h.sector.toUpperCase().includes(q)
    );
  }, [holdings, query]);

  const { sorted: displayHoldings, sort, toggle } = useSortable(
    filtered,
    (h, key) => {
      switch (key) {
        case 'symbol':
          return h.symbol;
        case 'qty':
          return h.qty;
        case 'avg':
          return h.avgPrice;
        case 'ltp':
          return h.ltp;
        case 'value':
          return holdingValue(h);
        case 'pnl':
          return holdingPnL(h);
        default:
          return '';
      }
    },
    { key: 'pnl', dir: 'desc' }
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyHoldingInput());
    setError('');
    setOpen(true);
  }

  function openEdit(h: Holding) {
    setEditing(h);
    setForm({
      symbol: h.symbol,
      exchange: h.exchange,
      name: h.name,
      qty: h.qty,
      avgPrice: h.avgPrice,
      ltp: h.ltp,
      sector: h.sector,
      notes: h.notes,
    });
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
    if (form.qty <= 0 || form.avgPrice <= 0) {
      setError('Qty and average price must be greater than 0');
      return;
    }
    if (form.ltp <= 0) {
      setError('Enter current / LTP price (you can update it anytime)');
      return;
    }
    if (editing) updateHolding(editing.id, form);
    else addHolding(form);
    setOpen(false);
    setEditing(null);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading holdings…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 2 · Portfolio
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Holdings &amp; Portfolio
            </h1>
            <InfoBubble title="About Holdings">
              Track delivery holdings manually for now. When broker sync is live, these will auto-fill
              from your demat.
            </InfoBubble>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          Add holding
        </button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Holdings" value={String(summary.count)} />
        <Stat label="Invested" value={formatCurrency(summary.invested)} />
        <Stat label="Current value" value={formatCurrency(summary.current)} />
        <Stat
          label="Unrealized P&L"
          value={`${formatCurrency(summary.pnl)} (${formatPercent(summary.pnlPct)})`}
          tone={summary.pnl > 0 ? 'up' : summary.pnl < 0 ? 'down' : 'flat'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-2">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-ink/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol, name, sector…"
              className="w-full rounded-xl border border-[#cfe0ee] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-14 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
                {holdings.length === 0 ? 'No holdings yet' : 'No matches'}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
                {holdings.length === 0
                  ? 'Add stocks you hold in delivery — qty, buy average, and current price.'
                  : 'Try another search.'}
              </p>
              {holdings.length === 0 && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
                >
                  <Plus className="h-4 w-4" />
                  Add first holding
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8f2fa]">
                    <SortableTh
                      label="Symbol"
                      className="px-2 py-2"
                      active={sort.key === 'symbol'}
                      dir={sort.dir}
                      onClick={() => toggle('symbol')}
                    />
                    <SortableTh
                      label="Qty"
                      className="px-2 py-2"
                      active={sort.key === 'qty'}
                      dir={sort.dir}
                      onClick={() => toggle('qty')}
                    />
                    <SortableTh
                      label="Avg"
                      className="px-2 py-2"
                      active={sort.key === 'avg'}
                      dir={sort.dir}
                      onClick={() => toggle('avg')}
                    />
                    <SortableTh
                      label="LTP"
                      className="px-2 py-2"
                      active={sort.key === 'ltp'}
                      dir={sort.dir}
                      onClick={() => toggle('ltp')}
                    />
                    <SortableTh
                      label="Value"
                      className="px-2 py-2"
                      active={sort.key === 'value'}
                      dir={sort.dir}
                      onClick={() => toggle('value')}
                    />
                    <SortableTh
                      label="P&L"
                      className="px-2 py-2"
                      active={sort.key === 'pnl'}
                      dir={sort.dir}
                      onClick={() => toggle('pnl')}
                    />
                    <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayHoldings.map((h) => {
                    const pnl = holdingPnL(h);
                    return (
                      <tr key={h.id} className="border-b border-[#e8f2fa] last:border-0">
                        <td className="px-2 py-3">
                          <p className="font-semibold text-sky-ink">{h.symbol}</p>
                          <p className="text-[11px] text-sky-ink/40">
                            {h.exchange} · {h.sector}
                          </p>
                        </td>
                        <td className="px-2 py-3 tabular-nums">{h.qty}</td>
                        <td className="px-2 py-3 tabular-nums text-sky-ink/70">
                          {h.avgPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-3 tabular-nums text-sky-ink/70">
                          {h.ltp.toFixed(2)}
                        </td>
                        <td className="px-2 py-3 tabular-nums">
                          {formatCurrency(holdingValue(h))}
                        </td>
                        <td
                          className={`px-2 py-3 font-semibold tabular-nums ${
                            pnl > 0
                              ? 'text-emerald-600'
                              : pnl < 0
                                ? 'text-rose-500'
                                : 'text-sky-ink'
                          }`}
                        >
                          {formatCurrency(pnl)}
                          <span className="ml-1 text-[11px] font-medium">
                            ({formatPercent(holdingPnLPct(h))})
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(h)}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-mist hover:text-sky-deep"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remove ${h.symbol}?`)) deleteHolding(h.id);
                              }}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Sector allocation
          </h2>
          <p className="mt-0.5 text-[12px] text-sky-ink/45">By current value</p>
          {summary.sectors.length === 0 ? (
            <p className="mt-6 text-sm text-sky-ink/50">Add holdings to see allocation.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {summary.sectors.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-sky-ink">{s.name}</span>
                    <span className="tabular-nums text-sky-ink/60">{s.pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sky-soft">
                    <div
                      className="h-full rounded-full bg-sky-mid"
                      style={{ width: `${Math.min(100, s.pct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-xl bg-sky-soft/80 px-3 py-3 text-[12px] text-sky-ink/60">
            Broker:{' '}
            <strong className="text-sky-ink">
              {connection.connected ? `${connection.label} connected` : 'Not connected'}
            </strong>
            <br />
            <Link
              href="/app/terminal"
              className="mt-1 inline-flex items-center gap-1 font-semibold text-sky-deep hover:underline"
            >
              Open Terminal
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>
      </div>

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
                  {editing ? 'Edit holding' : 'New holding'}
                </p>
                <h2 className="font-display text-lg font-semibold text-sky-ink">
                  {editing ? editing.symbol : 'Add to portfolio'}
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
                <span className={labelClass}>Symbol</span>
                <input
                  value={form.symbol}
                  onChange={(e) =>
                    setForm({ ...form, symbol: e.target.value.toUpperCase() })
                  }
                  className={inputClass}
                  placeholder="RELIANCE"
                  required
                />
              </label>
              <label className="block">
                <span className={labelClass}>Company name (optional)</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Reliance Industries"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelClass}>Exchange</span>
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
                <label className="block">
                  <span className={labelClass}>Sector</span>
                  <select
                    value={form.sector}
                    onChange={(e) => setForm({ ...form, sector: e.target.value })}
                    className={inputClass}
                  >
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className={labelClass}>Qty</span>
                  <input
                    type="number"
                    min={1}
                    value={form.qty || ''}
                    onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Avg price</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.avgPrice || ''}
                    onChange={(e) =>
                      setForm({ ...form, avgPrice: Number(e.target.value) })
                    }
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>LTP</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.ltp || ''}
                    onChange={(e) => setForm({ ...form, ltp: Number(e.target.value) })}
                    className={inputClass}
                    required
                  />
                </label>
              </div>
              {(form.qty > 0 && form.avgPrice > 0 && form.ltp > 0) && (
                <div className="rounded-xl bg-sky-soft px-3 py-2.5 text-sm">
                  Invested {formatCurrency(holdingInvested(form))} · Value{' '}
                  {formatCurrency(holdingValue(form))} · P&L{' '}
                  <strong
                    className={
                      holdingPnL(form as Holding) >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-500'
                    }
                  >
                    {formatCurrency(holdingPnL(form as Holding))}
                  </strong>
                </div>
              )}
              <label className="block">
                <span className={labelClass}>Notes</span>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={inputClass}
                  placeholder="Long term / SIP…"
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
                  Save holding
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
        className={`mt-1.5 font-display text-lg font-semibold md:text-xl ${
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
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
