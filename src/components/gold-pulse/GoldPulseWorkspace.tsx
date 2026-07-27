'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Square, Coins, FlaskConical } from 'lucide-react';
import {
  GOLD_PULSE_NAME,
  GOLD_PULSE_RULES,
  GOLD_PULSE_VERSION,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_SYMBOL,
  goldPulseRuleSummary,
} from '@/lib/gold-pulse/rules';
import { exitReasonLabel } from '@/lib/gold-pulse/signals';
import type { GoldPaperTrade, GoldPulseSession } from '@/lib/gold-pulse/types';
import type { GoldBacktestResult } from '@/lib/gold-pulse/backtest';

function fmtUsd(n: number | null | undefined, signed = true) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = signed ? (n > 0 ? '+' : '') : '';
  return `${sign}$${n.toFixed(2)}`;
}

function utcTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    hour12: false,
  });
}

function pnlClass(n: number) {
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-rose-700';
  return 'text-sky-ink/70';
}

export default function GoldPulseWorkspace() {
  const [session, setSession] = useState<GoldPulseSession | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const [bt, setBt] = useState<GoldBacktestResult | null>(null);
  const pollRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const callApi = useCallback(async (path: string) => {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      session?: GoldPulseSession;
      pollMs?: number;
      error?: string;
    };
    if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, []);

  const scheduleTick = useCallback(
    (delayMs: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!pollRef.current) return;
        void (async () => {
          try {
            const data = await callApi('/api/gold-pulse/tick');
            if (data.session) setSession(data.session);
            setError('');
            scheduleTick(data.pollMs || GOLD_PULSE_RULES.tickPollMsFlat);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Tick failed');
            scheduleTick(20_000);
          }
        })();
      }, delayMs);
    },
    [callApi]
  );

  useEffect(() => {
    return () => {
      pollRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function startDesk() {
    setBusy('Starting GoldPulse (Yahoo)…');
    setError('');
    try {
      const data = await callApi('/api/gold-pulse/init');
      if (data.session) setSession(data.session);
      pollRef.current = true;
      setPolling(true);
      scheduleTick(data.pollMs || GOLD_PULSE_RULES.tickPollMsFlat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Init failed');
    } finally {
      setBusy('');
    }
  }

  function stopDesk() {
    pollRef.current = false;
    setPolling(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }

  async function runBacktest() {
    setBusy(`Backtesting Yahoo ${GOLD_UT_ENTRY.tf} + ${GOLD_UT_HTF.tf}…`);
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/backtest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json()) as GoldBacktestResult | { ok: false; error?: string };
      if (!res.ok || !('tradeCount' in data)) {
        throw new Error(('error' in data && data.error) || 'Backtest failed');
      }
      setBt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setBusy('');
    }
  }

  const closed = session?.closedTrades ?? [];
  const open = session?.openTrades ?? [];
  const dayNet = useMemo(
    () => closed.reduce((s, t) => s + (t.netPnl ?? 0), 0),
    [closed]
  );

  const rules = goldPulseRuleSummary();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Separate agent · Yahoo {GOLD_YAHOO_SYMBOL}
          </p>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold text-sky-deep">
            <Coins className="h-6 w-6 text-amber-600" />
            {GOLD_PULSE_NAME}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-sky-ink/65">
            International gold paper desk. UT on {GOLD_UT_ENTRY.tf} + {GOLD_UT_HTF.tf}. Exit{' '}
            <strong>{GOLD_PULSE_RULES.sector7Label}</strong> when {GOLD_UT_HTF.tf} UT turns against you
            (same idea as NexusPulse Sector 7 A, but for gold — does not change Nifty agents).
          </p>
          <p className="mt-1 text-[11px] text-sky-ink/45">v{GOLD_PULSE_VERSION} · paper only</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runBacktest()}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-bold text-amber-900 disabled:opacity-50"
          >
            {busy.includes('Backtest') ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Backtest {GOLD_UT_ENTRY.tf}+{GOLD_UT_HTF.tf}
          </button>
          {!polling ? (
            <button
              type="button"
              onClick={() => void startDesk()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {busy && !busy.includes('Backtest') ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start paper desk
            </button>
          ) : (
            <button
              type="button"
              onClick={stopDesk}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-[12px] font-bold text-rose-700"
            >
              <Square className="h-4 w-4" />
              Stop polling
            </button>
          )}
        </div>
      </div>

      {busy && <p className="mt-3 text-[12px] text-sky-ink/55">{busy}</p>}
      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>
      )}
      {session?.lastError && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Yahoo note: {session.lastError}
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Gold spot (Yahoo)" value={session ? `$${session.spot.toFixed(2)}` : '—'} />
        <Stat
          label="Signal"
          value={session?.lastSignal?.side || '—'}
          sub={session?.lastSignal?.reason}
        />
        <Stat
          label={`${GOLD_UT_ENTRY.tf} / ${GOLD_UT_HTF.tf} UT`}
          value={`${session?.utEntry?.last?.pos ?? '—'} / ${session?.utHtf?.last?.pos ?? '—'}`}
          sub="+1 bull · -1 bear"
        />
        <Stat label="Day net (paper)" value={fmtUsd(dayNet)} className={pnlClass(dayNet)} />
      </div>

      {bt && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-sky-deep">
            Backtest · {bt.entryTf} + {bt.htfTf} (Yahoo {bt.symbol})
          </h2>
          <p className="mt-1 text-[11px] text-sky-ink/55">{bt.note}</p>
          <p className="mt-1 text-[11px] text-sky-ink/45">
            Bars: {bt.barsEntry} × {bt.entryTf} · {bt.barsHtf} × {bt.htfTf}
            {bt.from && bt.to
              ? ` · ${new Date(bt.from).toISOString().slice(0, 10)} → ${new Date(bt.to).toISOString().slice(0, 10)}`
              : ''}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Stat label="Trades" value={String(bt.tradeCount)} />
            <Stat label="Win rate" value={`${bt.winRate}%`} sub={`W ${bt.wins} / L ${bt.losses}`} />
            <Stat label="Net P&L" value={fmtUsd(bt.netPnl)} className={pnlClass(bt.netPnl)} />
            <Stat label="Max DD" value={fmtUsd(-bt.maxDrawdown, false)} className="text-rose-700" />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Stat label="Gross" value={fmtUsd(bt.grossPnl)} className={pnlClass(bt.grossPnl)} />
            <Stat label="Avg win" value={fmtUsd(bt.avgWin)} />
            <Stat label="Avg loss" value={fmtUsd(bt.avgLoss)} />
          </div>
          <p className="mt-2 text-[11px] text-sky-ink/55">
            Exits:{' '}
            {Object.entries(bt.exitMix)
              .map(([k, v]) => `${exitReasonLabel(k)} ×${v}`)
              .join(' · ') || '—'}
          </p>
          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-sky-50">
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-sky-soft/80 text-[10px] uppercase text-sky-ink/50">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Side</th>
                  <th className="px-2 py-1.5">In → Out</th>
                  <th className="px-2 py-1.5">Exit</th>
                  <th className="px-2 py-1.5">Net</th>
                </tr>
              </thead>
              <tbody>
                {bt.trades.slice(-40).reverse().map((t) => (
                  <tr key={t.id} className="border-t border-sky-50">
                    <td className="px-2 py-1">{t.id}</td>
                    <td className="px-2 py-1 font-semibold">{t.side}</td>
                    <td className="px-2 py-1">
                      {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                    </td>
                    <td className="px-2 py-1">{exitReasonLabel(t.exitReason)}</td>
                    <td className={`px-2 py-1 font-bold ${pnlClass(t.netPnl)}`}>
                      {fmtUsd(t.netPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sky-deep">Open trades</h2>
        {open.length === 0 ? (
          <p className="mt-2 text-[12px] text-sky-ink/50">
            Flat — waiting for aligned {GOLD_UT_ENTRY.tf} + {GOLD_UT_HTF.tf} UT.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((t) => (
              <OpenCard key={t.id} t={t} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-sky-100 bg-white shadow-sm">
        <div className="border-b border-sky-50 px-4 py-3">
          <h2 className="text-sm font-bold text-sky-deep">Closed today (UTC date)</h2>
        </div>
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-sky-soft/40 text-[10px] uppercase tracking-wide text-sky-ink/50">
            <tr>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">In → Out</th>
              <th className="px-3 py-2">Exit</th>
              <th className="px-3 py-2">MFE/MAE</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2">Times (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {closed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-sky-ink/45">
                  No closed paper trades yet.
                </td>
              </tr>
            ) : (
              [...closed].reverse().map((t) => (
                <tr key={t.id} className="border-t border-sky-50">
                  <td className="px-3 py-2 font-semibold">{t.side}</td>
                  <td className="px-3 py-2">
                    {t.entryPrice.toFixed(2)} → {t.exitPrice?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-3 py-2">{exitReasonLabel(t.exitReason)}</td>
                  <td className="px-3 py-2">
                    +{t.maxFavorableUsd.toFixed(1)} / -{t.maxAdverseUsd.toFixed(1)}
                  </td>
                  <td className={`px-3 py-2 font-bold ${pnlClass(t.netPnl ?? 0)}`}>
                    {fmtUsd(t.netPnl)}
                  </td>
                  <td className="px-3 py-2 text-sky-ink/55">
                    {utcTime(t.openedAt)} → {utcTime(t.closedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-2xl border border-sky-100 bg-sky-soft/30 p-4">
        <h2 className="text-sm font-bold text-sky-deep">Rules (this agent only)</h2>
        <ul className="mt-2 space-y-1">
          {rules.map((line) => (
            <li key={line} className="text-[12px] text-sky-ink/70">
              · {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">{label}</p>
      <p className={`mt-1 text-lg font-bold text-sky-deep ${className || ''}`}>{value}</p>
      {sub && <p className="mt-0.5 line-clamp-2 text-[10px] text-sky-ink/50">{sub}</p>}
    </div>
  );
}

function OpenCard({ t }: { t: GoldPaperTrade }) {
  const move = t.side === 'LONG' ? t.markPrice - t.entryPrice : t.entryPrice - t.markPrice;
  const gross = move * t.qty * GOLD_PULSE_RULES.pointValue;
  const net = gross - GOLD_PULSE_RULES.roundTripCostUsd;
  return (
    <li className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-sky-deep">
          {t.side} {t.symbol} @ {t.entryPrice.toFixed(2)}
        </p>
        <p className={`text-[13px] font-bold ${pnlClass(net)}`}>{fmtUsd(net)} live</p>
      </div>
      <p className="mt-1 text-[11px] text-sky-ink/60">
        Mark {t.markPrice.toFixed(2)} · SL {t.stopLoss.toFixed(2)} · Hi/Lo {t.highPrice.toFixed(2)}/
        {t.lowPrice.toFixed(2)} · MFE +{t.maxFavorableUsd.toFixed(1)} MAE -{t.maxAdverseUsd.toFixed(1)}
      </p>
    </li>
  );
}
