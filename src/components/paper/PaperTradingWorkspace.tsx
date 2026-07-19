'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Plus, RotateCcw, X } from 'lucide-react';
import { usePaperTrading } from '@/hooks/usePaperTrading';
import { paperPnL, summarizePaper, type PaperSide } from '@/lib/paper';
import { formatCurrency } from '@/lib/utils';

export default function PaperTradingWorkspace() {
  const { ready, account, trades, openTrade, closeTrade, resetAccount } = usePaperTrading();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<PaperSide>('BUY');
  const [qty, setQty] = useState(1);
  const [entryPrice, setEntryPrice] = useState(0);
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState(0);

  const summary = useMemo(() => summarizePaper(trades, account), [trades, account]);

  function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!symbol.trim() || qty <= 0 || entryPrice <= 0) {
      setError('Symbol, qty, and entry price are required');
      return;
    }
    const result = openTrade({ symbol, side, qty, entryPrice });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setSymbol('');
    setQty(1);
    setEntryPrice(0);
  }

  function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!closingId || exitPrice <= 0) return;
    closeTrade(closingId, exitPrice);
    setClosingId(null);
    setExitPrice(0);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading paper trading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 4 · Paper Trading
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Paper Trading
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Practice with fake money. No real orders are sent to your broker.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Reset paper account to ₹1,00,000 and clear trades?')) {
                resetAccount();
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ee] bg-white px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Plus className="h-4 w-4" />
            New paper trade
          </button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paper cash" value={formatCurrency(summary.cash)} />
        <Stat label="Starting" value={formatCurrency(summary.startingCash)} />
        <Stat
          label="Realized P&L"
          value={formatCurrency(summary.realized)}
          tone={summary.realized > 0 ? 'up' : summary.realized < 0 ? 'down' : 'flat'}
        />
        <Stat label="Open / Closed" value={`${summary.openCount} / ${summary.closedCount}`} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        {trades.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
            <p className="mt-3 font-display text-lg font-semibold text-sky-ink">No paper trades</p>
            <p className="mt-2 text-sm text-sky-ink/55">Open a BUY to start practicing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8f2fa] bg-sky-soft/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Entry / Exit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">P&L</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const pnl = paperPnL(t);
                  return (
                    <tr key={t.id} className="border-b border-[#e8f2fa] last:border-0">
                      <td className="px-4 py-3 font-semibold text-sky-ink">{t.symbol}</td>
                      <td className="px-4 py-3">{t.side}</td>
                      <td className="px-4 py-3 tabular-nums">{t.qty}</td>
                      <td className="px-4 py-3 tabular-nums text-sky-ink/70">
                        {t.entryPrice.toFixed(2)}
                        {t.exitPrice != null ? ` → ${t.exitPrice.toFixed(2)}` : ' → open'}
                      </td>
                      <td className="px-4 py-3 capitalize">{t.status}</td>
                      <td
                        className={`px-4 py-3 font-semibold tabular-nums ${
                          pnl == null
                            ? 'text-sky-ink/35'
                            : pnl >= 0
                              ? 'text-emerald-600'
                              : 'text-rose-500'
                        }`}
                      >
                        {pnl == null ? '—' : formatCurrency(pnl)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => {
                              setClosingId(t.id);
                              setExitPrice(t.entryPrice);
                            }}
                            className="text-xs font-semibold text-sky-deep hover:underline"
                          >
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-5 text-[12px] text-sky-ink/45">
        When ready, switch strategies to live via Auto Execution (still gated by risk).{' '}
        <Link href="/app/automation" className="font-semibold text-sky-deep hover:underline">
          Auto Execution
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>

      {open && (
        <Drawer title="New paper trade" onClose={() => setOpen(false)}>
          <form onSubmit={handleOpen} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <Field label="Symbol">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className={inputClass}
                required
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Side">
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as PaperSide)}
                  className={inputClass}
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </Field>
              <Field label="Qty">
                <input
                  type="number"
                  min={1}
                  value={qty || ''}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Entry">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={entryPrice || ''}
                  onChange={(e) => setEntryPrice(Number(e.target.value))}
                  className={inputClass}
                  required
                />
              </Field>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Open trade
            </button>
          </form>
        </Drawer>
      )}

      {closingId && (
        <Drawer title="Close paper trade" onClose={() => setClosingId(null)}>
          <form onSubmit={handleClose} className="space-y-4">
            <Field label="Exit price">
              <input
                type="number"
                min={0}
                step="0.01"
                value={exitPrice || ''}
                onChange={(e) => setExitPrice(Number(e.target.value))}
                className={inputClass}
                required
              />
            </Field>
            <button
              type="submit"
              className="w-full rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Close trade
            </button>
          </form>
        </Drawer>
      )}
    </div>
  );
}

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-sky-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
        {label}
      </span>
      {children}
    </label>
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

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';
