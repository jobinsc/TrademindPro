'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useTrades } from '@/hooks/useTrades';
import {
  emptyTradeInput,
  isOpenTrade,
  summarizeTrades,
  type Trade,
  type TradeInput,
} from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';
import TradeForm from '@/components/journal/TradeForm';
import TradeTable from '@/components/journal/TradeTable';

type FormMode = 'full' | 'close';
type StatusFilter = 'ALL' | 'OPEN' | 'CLOSED';

export default function JournalWorkspace() {
  const { trades, ready, addTrade, updateTrade, deleteTrade } = useTrades();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('full');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const stats = useMemo(() => summarizeTrades(trades), [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      const q = query.trim().toUpperCase();
      const matchQ =
        !q ||
        t.symbol.includes(q) ||
        t.strategy.toUpperCase().includes(q) ||
        t.tags.toUpperCase().includes(q);
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'OPEN' && isOpenTrade(t)) ||
        (statusFilter === 'CLOSED' && !isOpenTrade(t));
      return matchQ && matchStatus;
    });
  }, [trades, query, statusFilter]);

  function closeDrawer() {
    setOpen(false);
    setEditing(null);
    setFormMode('full');
  }

  function openCreate() {
    setEditing(null);
    setFormMode('full');
    setOpen(true);
  }

  function openEdit(trade: Trade) {
    setEditing(trade);
    setFormMode('full');
    setOpen(true);
  }

  function openClose(trade: Trade) {
    setEditing(trade);
    setFormMode('close');
    setOpen(true);
  }

  function handleSave(input: TradeInput) {
    if (editing) {
      updateTrade(editing.id, input);
    } else {
      addTrade(input);
    }
    closeDrawer();
  }

  function handleDelete(id: string) {
    if (window.confirm('Delete this trade from your journal?')) {
      deleteTrade(id);
    }
  }

  const initialValues: TradeInput = editing
    ? {
        symbol: editing.symbol,
        side: editing.side,
        segment: editing.segment,
        qty: editing.qty,
        entryPrice: editing.entryPrice,
        exitPrice: editing.exitPrice,
        tradeDate: editing.tradeDate,
        exitDate: editing.exitDate,
        strategy: editing.strategy,
        tags: editing.tags,
        emotion: editing.emotion,
        mistakes: editing.mistakes,
        notes: editing.notes,
      }
    : emptyTradeInput();

  const drawerTitle =
    formMode === 'close'
      ? 'Close position'
      : editing
        ? 'Edit trade'
        : 'New trade';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 1 · Journal
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Trade Journal
            </h1>
            <InfoBubble title="About Journal">
              Log a buy as <strong className="font-semibold text-sky-ink">Open</strong>, then close it later when you sell.
              Same stock at different prices = separate entries. Dates cannot be in the future.
            </InfoBubble>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          Add trade
        </button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="All trades" value={String(stats.total)} />
        <Stat label="Open" value={String(stats.open)} />
        <Stat
          label="Realized P&L"
          value={formatCurrency(stats.totalPnL)}
          tone={stats.totalPnL > 0 ? 'up' : stats.totalPnL < 0 ? 'down' : 'flat'}
        />
        <Stat label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
        <Stat label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, strategy, tags…"
            className="w-full rounded-xl border border-[#cfe0ee] bg-white py-2.5 pl-10 pr-3 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2"
          />
        </div>
        <div className="flex rounded-xl border border-[#cfe0ee] bg-white p-1">
          {(['ALL', 'OPEN', 'CLOSED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
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

      <div className="mt-5">
        {!ready ? (
          <div className="rounded-2xl border border-[#cfe0ee] bg-white px-6 py-16 text-center text-sm text-sky-ink/50">
            Loading journal…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#b8d4e8] bg-white px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-sky-ink">
              {trades.length === 0 ? 'No trades yet' : 'No matches'}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-sky-ink/55">
              {trades.length === 0
                ? 'Add a buy with entry price only. Close it later when you sell or hit stop-loss.'
                : 'Try another search or clear filters.'}
            </p>
            {trades.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
              >
                <Plus className="h-4 w-4" />
                Add your first trade
              </button>
            )}
          </div>
        ) : (
          <TradeTable
            trades={filtered}
            onEdit={openEdit}
            onClose={openClose}
            onDelete={handleDelete}
          />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={closeDrawer}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  {drawerTitle}
                </p>
                <h2 className="font-display text-lg font-semibold text-sky-ink">
                  {editing ? editing.symbol : 'Log a trade'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft hover:text-sky-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <TradeForm
                key={`${editing?.id ?? 'new'}-${formMode}`}
                initial={initialValues}
                mode={formMode}
                onSubmit={handleSave}
                onCancel={closeDrawer}
              />
            </div>
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
        className={`mt-1.5 font-display text-xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
