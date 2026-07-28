'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, Loader2 } from 'lucide-react';
import RequireAdmin from '@/components/auth/RequireAdmin';

type Mode = 'paper' | 'live';

type ArchivedTrade = {
  id: string;
  laneId: string;
  side: string;
  strike: number;
  openedAt?: string;
  closedAt?: string;
  entryPremium: number;
  exitPremium?: number;
  highPremium?: number;
  lowPremium?: number;
  maxFavorablePts?: number;
  maxAdversePts?: number;
  exitReason?: string;
  grossPnl?: number;
  netPnl?: number;
  tradingSymbol?: string;
};

function istTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    day: '2-digit',
    month: 'short',
  });
}

function durationHHMM(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return '—';
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—';
  const totalMin = Math.floor((b - a) / 60_000);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function reasonLabel(r?: string) {
  if (r === 'UT_5M') return 'Sector 7 B';
  if (r === 'UT_3M') return 'Sector 7 B (3m)';
  return r || '—';
}

function ArchiveInner() {
  const [mode, setMode] = useState<Mode>('paper');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [trades, setTrades] = useState<ArchivedTrade[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadDates = useCallback(async (m: Mode) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/nexus-pulse-b/trade-archive?mode=${m}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { ok?: boolean; dates?: string[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      const list = data.dates || [];
      setDates(list);
      setDate(list[0] || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setDates([]);
      setDate('');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDay = useCallback(async (m: Mode, d: string) => {
    if (!d) {
      setTrades([]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/nexus-pulse-b/trade-archive?mode=${m}&date=${d}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        day?: { trades?: ArchivedTrade[] };
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      setTrades(data.day?.trades || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setTrades([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadDates(mode);
  }, [mode, loadDates]);

  useEffect(() => {
    void loadDay(mode, date);
  }, [mode, date, loadDay]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            NexusPulse · Admin only
          </p>
          <h1 className="font-display text-2xl font-bold text-sky-deep">Trade Archive</h1>
          <p className="mt-1 text-[13px] text-sky-ink/60">
            Paper and live trades saved by date under{' '}
            <code className="text-[11px]">.data/nexus-pulse-b/trades/</code> — separate from the
            session file so history is not lost.
          </p>
        </div>
        <Link
          href="/app/nexus-pulse-b"
          className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-deep"
        >
          Back to NexusPulse
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(['paper', 'live'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-xl px-3 py-1.5 text-[12px] font-bold ${
              mode === m
                ? 'bg-sky-deep text-white'
                : 'border border-sky-200 bg-white text-sky-deep'
            }`}
          >
            {m === 'paper' ? 'Paper vault' : 'Live vault'}
          </button>
        ))}
        <select
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[12px]"
        >
          {!dates.length && <option value="">No archived days yet</option>}
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-sky-ink/50" />}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>
      )}

      <section className="mt-5 overflow-x-auto rounded-2xl border border-sky-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-sky-50 px-3 py-2 text-[12px] font-semibold text-sky-deep">
          <Archive className="h-4 w-4" />
          {mode.toUpperCase()} · {date || '—'} · {trades.length} trades
        </div>
        {trades.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-sky-ink/50">
            {mode === 'live'
              ? 'Live vault ready. Trades will archive here when live orders are enabled.'
              : 'No paper trades archived for this date yet. Run NexusPulse paper session to fill it.'}
          </p>
        ) : (
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-sky-50/60 text-[10px] uppercase text-sky-ink/50">
              <tr>
                <th className="px-3 py-2">Lane</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Strike</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Taken</th>
                <th className="px-3 py-2">Entry</th>
                <th className="px-3 py-2">Exit</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-slate-50">
                  <td className="px-3 py-2">{t.laneId}</td>
                  <td className="px-3 py-2 font-semibold">{t.side}</td>
                  <td className="px-3 py-2">{t.strike}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{istTime(t.openedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{istTime(t.closedAt)}</td>
                  <td className="px-3 py-2">{durationHHMM(t.openedAt, t.closedAt)}</td>
                  <td className="px-3 py-2">₹{t.entryPremium.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {t.exitPremium != null ? `₹${t.exitPremium.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2">{reasonLabel(t.exitReason)}</td>
                  <td className="px-3 py-2 font-semibold">
                    {t.netPnl != null ? `₹${t.netPnl.toFixed(0)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default function NexusBTradeArchiveWorkspace() {
  return (
    <RequireAdmin>
      <ArchiveInner />
    </RequireAdmin>
  );
}
