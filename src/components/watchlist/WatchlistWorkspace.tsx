'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useWatchlists } from '@/hooks/useWatchlists';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import {
  applyPinPriority,
  isPinned,
  isPrimaryCorePin,
  type Exchange,
} from '@/lib/watchlist';
import { INDIA_INDEX_SYMBOLS, resolveIndiaIndex } from '@/lib/india-indices';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';
import SymbolAutocomplete from '@/components/ui/SymbolAutocomplete';
import { SymbolChartLink } from '@/components/chart/SymbolChartLink';

export default function WatchlistWorkspace() {
  const {
    ready,
    lists,
    active,
    activeId,
    isPrimaryList,
    setActiveId,
    createList,
    deleteList,
    addSymbol,
    removeSymbol,
    pinSymbol,
    unpinSymbol,
    movePin,
  } = useWatchlists();

  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newListName, setNewListName] = useState('');

  const liveSymbols = useMemo(
    () =>
      (active?.symbols || []).map((s) => ({
        symbol: s.symbol,
        exchange: s.exchange,
      })),
    [active?.symbols]
  );
  const { quotes, live, updatedAt } = useLiveQuotes(liveSymbols, {
    enabled: ready && liveSymbols.length > 0,
    intervalMs: 3000,
  });

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toUpperCase();
    const rows = active.symbols.map((s) => {
      const qLive = quotes[s.symbol.toUpperCase()];
      return {
        ...s,
        lastPrice: qLive?.ok ? qLive.lastPrice : s.lastPrice,
        changePct: qLive?.ok && qLive.changePct != null ? qLive.changePct : s.changePct,
        liveOk: Boolean(qLive?.ok),
      };
    });
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.notes.toUpperCase().includes(q)
    );
  }, [active, query, quotes]);

  const { sorted: sortedRows, sort, toggle } = useSortable(
    filtered,
    (row, key) => {
      switch (key) {
        case 'symbol':
          return row.symbol;
        case 'exchange':
          return row.exchange;
        case 'lastPrice':
          return row.lastPrice;
        case 'changePct':
          return row.changePct;
        case 'notes':
          return row.notes || '';
        default:
          return '';
      }
    },
    { dir: 'asc' }
  );

  // Pinned indices stay on top (#1 NIFTY, #2 SENSEX, then other pins);
  // everything else follows the active sort (change / exchange / …).
  const displayRows = useMemo(
    () => applyPinPriority(sortedRows),
    [sortedRows]
  );

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Watchlist
            </h1>
            <InfoBubble title="About Watchlist">
              Primary list always keeps NIFTY (#1) and SENSEX (#2) on top. Pin
              other symbols to keep them above sorts. Sorting by change/exchange
              only rearranges unpinned rows.
            </InfoBubble>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-sky-ink/45">
            {live ? (
              <span className="text-emerald-600">Live</span>
            ) : (
              <span>Updating…</span>
            )}
            {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString('en-IN')}` : ''}
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
                ? 'Add NIFTY, BANKNIFTY, SENSEX, or any NSE/BSE symbol to start tracking.'
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
                <tr className="border-b border-[#e8f2fa] bg-sky-soft/60">
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                    #
                  </th>
                  <SortableTh
                    label="Symbol"
                    className="px-4 py-3"
                    active={sort.key === 'symbol'}
                    dir={sort.dir}
                    onClick={() => toggle('symbol')}
                  />
                  <SortableTh
                    label="Exchange"
                    className="px-4 py-3"
                    active={sort.key === 'exchange'}
                    dir={sort.dir}
                    onClick={() => toggle('exchange')}
                  />
                  <SortableTh
                    label="Live LTP"
                    className="px-4 py-3"
                    active={sort.key === 'lastPrice'}
                    dir={sort.dir}
                    onClick={() => toggle('lastPrice')}
                  />
                  <SortableTh
                    label="Change"
                    className="px-4 py-3"
                    active={sort.key === 'changePct'}
                    dir={sort.dir}
                    onClick={() => toggle('changePct')}
                  />
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                    Pin / Remove
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const pinned = isPinned(row);
                  const core =
                    isPrimaryList && isPrimaryCorePin(row);
                  return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/40',
                      pinned && 'bg-amber-50/40'
                    )}
                  >
                    <td className="px-3 py-3 tabular-nums text-[11px] font-bold text-sky-ink/45">
                      {pinned ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                          {row.pinOrder}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <SymbolChartLink
                          symbol={row.symbol}
                          exchange={row.exchange}
                          name={row.name}
                          className="font-semibold"
                        >
                          {row.symbol}
                        </SymbolChartLink>
                        {pinned && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                            pinned
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-sky-ink/40">{row.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sky-ink/65">{row.exchange}</td>
                    <td className="px-4 py-3 tabular-nums text-sky-ink/80">
                      {row.lastPrice > 0 ? formatCurrency(row.lastPrice) : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 font-semibold tabular-nums',
                        row.changePct > 0
                          ? 'text-emerald-600'
                          : row.changePct < 0
                            ? 'text-rose-500'
                            : 'text-sky-ink/50'
                      )}
                    >
                      {row.lastPrice > 0 ? formatPercent(row.changePct) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {pinned ? (
                          <>
                            <button
                              type="button"
                              onClick={() => movePin(row.id, 'up')}
                              disabled={core || row.pinOrder === 1}
                              className="rounded-lg p-1.5 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-deep disabled:opacity-30"
                              title="Move pin up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => movePin(row.id, 'down')}
                              disabled={core}
                              className="rounded-lg p-1.5 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-deep disabled:opacity-30"
                              title="Move pin down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => unpinSymbol(row.id)}
                              disabled={core}
                              className="rounded-lg p-1.5 text-sky-ink/40 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30"
                              title={
                                core
                                  ? 'NIFTY & SENSEX stay pinned'
                                  : 'Unpin'
                              }
                            >
                              <PinOff className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => pinSymbol(row.id)}
                            className="rounded-lg p-1.5 text-sky-ink/40 hover:bg-amber-50 hover:text-amber-700"
                            title="Pin to top"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSymbol(row.id)}
                          disabled={core}
                          className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                          title={
                            core
                              ? 'NIFTY & SENSEX stay on primary list'
                              : 'Remove'
                          }
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
                <SymbolAutocomplete
                  value={symbol}
                  onChange={setSymbol}
                  onPick={(item) => {
                    setSymbol(item.symbol);
                    setExchange(item.exchange);
                  }}
                  exchange={exchange}
                  placeholder="Search NIFTY, BANKNIFTY, scrips…"
                  className={inputClass}
                  required
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INDIA_INDEX_SYMBOLS.slice(0, 10).map((sym) => {
                    const meta = resolveIndiaIndex(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => {
                          setSymbol(sym);
                          setExchange(meta?.exchange || 'NSE');
                        }}
                        className="rounded-full bg-sky-soft px-2.5 py-1 text-[10px] font-bold text-sky-deep ring-1 ring-[#cfe0ee] hover:bg-sky-deep hover:text-white"
                      >
                        {sym}
                      </button>
                    );
                  })}
                </div>
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
