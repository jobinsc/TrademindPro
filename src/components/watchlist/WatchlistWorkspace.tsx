'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Search, Trash2, X } from 'lucide-react';
import { useWatchlists } from '@/hooks/useWatchlists';
import { type Exchange } from '@/lib/watchlist';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function WatchlistWorkspace() {
  const {
    ready,
    lists,
    active,
    activeId,
    setActiveId,
    createList,
    deleteList,
    addSymbol,
    removeSymbol,
  } = useWatchlists();

  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newListName, setNewListName] = useState('');

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toUpperCase();
    if (!q) return active.symbols;
    return active.symbols.filter(
      (s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.notes.toUpperCase().includes(q)
    );
  }, [active, query]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const result = addSymbol({ symbol, exchange, notes });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSymbol('');
    setNotes('');
    setShowAdd(false);
  }

  function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    createList(newListName || 'New Watchlist');
    setNewListName('');
  }

  if (!ready || !active) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading watchlist…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 2 · Terminal
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Watchlist
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Track NSE &amp; BSE symbols you care about. Prices shown are sample values until a broker
            feed is connected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          Add symbol
        </button>
      </div>

      {/* Lists + search */}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => setActiveId(list.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                list.id === activeId
                  ? 'bg-sky-deep text-white'
                  : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee] hover:text-sky-ink'
              }`}
            >
              {list.name}
              <span className="ml-1.5 opacity-70">{list.symbols.length}</span>
            </button>
          ))}
        </div>
        <form onSubmit={handleCreateList} className="flex gap-2">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="New list name"
            className="w-36 rounded-xl border border-[#cfe0ee] bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-sky-mid/30"
          />
          <button
            type="submit"
            className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-1.5 text-xs font-semibold text-sky-deep hover:bg-sky-soft"
          >
            + List
          </button>
        </form>
        {lists.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete watchlist “${active.name}”?`)) deleteList(active.id);
            }}
            className="text-xs font-semibold text-rose-500 hover:underline"
          >
            Delete list
          </button>
        )}
      </div>

      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-ink/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in this list…"
          className="w-full rounded-xl border border-[#cfe0ee] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
        />
      </div>

      {error && !showAdd && (
        <p className="mt-3 text-sm text-rose-600">{error}</p>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-sky-ink">
              {active.symbols.length === 0 ? 'Watchlist is empty' : 'No matches'}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
              {active.symbols.length === 0
                ? 'Add RELIANCE, NIFTY 50, or any NSE/BSE symbol to start tracking.'
                : 'Try another search.'}
            </p>
            {active.symbols.length === 0 && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
              >
                <Plus className="h-4 w-4" />
                Add symbol
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8f2fa] bg-sky-soft/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Exchange</th>
                  <th className="px-4 py-3">Last (sample)</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sky-ink">{row.symbol}</p>
                      <p className="text-[11px] text-sky-ink/40">{row.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sky-ink/65">{row.exchange}</td>
                    <td className="px-4 py-3 tabular-nums text-sky-ink/80">
                      {row.lastPrice > 0 ? formatCurrency(row.lastPrice) : '—'}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold tabular-nums ${
                        row.changePct > 0
                          ? 'text-emerald-600'
                          : row.changePct < 0
                            ? 'text-rose-500'
                            : 'text-sky-ink/50'
                      }`}
                    >
                      {row.lastPrice > 0 ? formatPercent(row.changePct) : '—'}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-sky-ink/55">
                      {row.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeSymbol(row.id)}
                        className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-sky-ink/45">
        Live prices will appear here after broker connection (Zerodha / Upstox).{' '}
        <Link href="/app/settings" className="font-semibold text-sky-deep hover:underline">
          Open Settings
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>

      {/* Add drawer */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0"
            onClick={() => {
              setShowAdd(false);
              setError('');
            }}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  Add to {active.name}
                </p>
                <h2 className="font-display text-lg font-semibold text-sky-ink">New symbol</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setError('');
                }}
                className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4 px-5 py-4">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Symbol
                </span>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
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
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value as Exchange)}
                  className={inputClass}
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Notes (optional)
                </span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Watch for breakout…"
                  className={inputClass}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setError('');
                  }}
                  className="flex-1 rounded-xl border border-[#cfe0ee] py-2.5 text-sm font-semibold text-sky-ink/70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
                >
                  Add to list
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
