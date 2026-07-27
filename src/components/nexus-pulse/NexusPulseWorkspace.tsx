'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, BookLock, FileText, Loader2, Play, Radio, ShieldCheck, Square } from 'lucide-react';
import {
  NEXUS_LANES,
  NEXUS_PULSE_NAME,
  NEXUS_PULSE_RULES,
  NEXUS_PULSE_VERSION,
  nexusRuleSummary,
  type NexusLaneId,
} from '@/lib/nexus-pulse/rules';
import type { NexusPaperTrade, NexusPulseSession } from '@/lib/nexus-pulse/types';
import { fetchLocalPost, isLocalAppHost } from '@/lib/local-server';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';
import { useAuth } from '@/components/auth/AuthProvider';

const POLL_MS = NEXUS_PULSE_RULES.tickPollMsFlat;

function fmtInr(n: number | null | undefined, signed = true) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = signed ? (n > 0 ? '+' : '') : '';
  return `${sign}₹${n.toFixed(0)}`;
}

function fmtPts(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}₹${n.toFixed(2)}`;
}

function istTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

function laneTitle(id: NexusLaneId) {
  return NEXUS_LANES[id]?.title ?? id;
}

/** Live unrealized on open trade (after round-trip cost). */
function openLivePnl(t: NexusPaperTrade) {
  const mark = t.markPremium ?? t.entryPremium;
  const gross = (mark - t.entryPremium) * t.qty * t.lotSize;
  const net = gross - NEXUS_PULSE_RULES.roundTripCostInr;
  return { mark, gross, net, pts: mark - t.entryPremium };
}

function pnlClass(n: number) {
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-rose-700';
  return 'text-sky-ink/70';
}

function exitReasonLabel(reason?: NexusPaperTrade['exitReason']) {
  if (!reason) return '—';
  if (reason === 'UT_5M') return 'Sector 7 A';
  return reason;
}

export default function NexusPulseWorkspace() {
  const { isAdmin } = useAuth();
  const [session, setSession] = useState<NexusPulseSession | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const pollRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setLive(isUpstoxConnected());
  }, []);

  const token = () => getUpstoxAccessToken();

  const callApi = useCallback(async (path: string) => {
    const t = token();
    if (!t) throw new Error('Connect Upstox in Settings first.');
    return fetchLocalPost<{ ok: boolean; session: NexusPulseSession; error?: string }>({
      path,
      token: t,
    });
  }, []);

  const scheduleTick = useCallback(
    (delayMs: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!pollRef.current) return;
        void (async () => {
          try {
            const data = await callApi('/api/nexus-pulse/tick');
            if (data.session) setSession(data.session);
            setError('');
            const inTrade = (data.session?.openTrades?.length ?? 0) > 0;
            scheduleTick(inTrade ? NEXUS_PULSE_RULES.tickPollMsInTrade : POLL_MS);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Tick failed');
            scheduleTick(15000);
          }
        })();
      }, delayMs);
    },
    [callApi]
  );

  const startSession = useCallback(async () => {
    setBusy('Starting…');
    setError('');
    try {
      const data = await callApi('/api/nexus-pulse/init');
      setSession(data.session);
      pollRef.current = true;
      setPolling(true);
      scheduleTick(500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start failed');
    } finally {
      setBusy('');
    }
  }, [callApi, scheduleTick]);

  const stopPolling = useCallback(() => {
    pollRef.current = false;
    setPolling(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const rules = nexusRuleSummary();

  const stats = useMemo(() => {
    if (!session) {
      return {
        realizedNet: 0,
        unrealizedNet: 0,
        dayNet: 0,
        wins: 0,
        losses: 0,
        openGross: 0,
      };
    }
    const closed = session.closedTrades;
    const realizedNet = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const wins = closed.filter((t) => (t.netPnl ?? 0) > 0).length;
    const losses = closed.filter((t) => (t.netPnl ?? 0) <= 0).length;
    let unrealizedNet = 0;
    let openGross = 0;
    for (const t of session.openTrades) {
      const p = openLivePnl(t);
      unrealizedNet += p.net;
      openGross += p.gross;
    }
    return {
      realizedNet,
      unrealizedNet,
      dayNet: realizedNet + unrealizedNet,
      wins,
      losses,
      openGross,
    };
  }, [session]);

  const closedNewestFirst = useMemo(() => {
    if (!session) return [];
    return [...session.closedTrades].sort((a, b) =>
      (b.closedAt || '').localeCompare(a.closedAt || '')
    );
  }, [session]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-deep">
            <Radio className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">{NEXUS_PULSE_NAME}</h1>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
              {NEXUS_PULSE_VERSION}
            </span>
            {polling && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                LIVE PAPER
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[13px] text-sky-ink/65">
            UT Bot (your Pine) · 3m entry + 5m agree · dual paper lanes · shows live P&amp;L and full
            trade details. Isolated from PinaxForge / Blink / ATM Lab.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          PAPER ONLY
        </div>
      </div>

      {!isLocalAppHost() && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Run locally: http://localhost:3000/app/nexus-pulse
        </p>
      )}

      {!live && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          Connect Upstox in Settings — needed for Nifty 3m/5m + option LTP.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      <section className="mt-6 flex flex-wrap gap-2">
        {!polling ? (
          <button
            type="button"
            disabled={!live || Boolean(busy)}
            onClick={() => void startSession()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-deep px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start UT paper session
          </button>
        ) : (
          <button
            type="button"
            onClick={stopPolling}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 px-4 py-2 text-[13px] font-semibold"
          >
            <Square className="h-4 w-4" />
            Stop polling
          </button>
        )}
        {isAdmin && (
          <>
            <Link
              href="/app/nexus-pulse/strategy-note"
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-[13px] font-semibold text-violet-900"
            >
              <BookLock className="h-4 w-4" />
              Strategy Note
            </Link>
            <Link
              href="/app/nexus-pulse/trade-archive"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-4 py-2 text-[13px] font-semibold text-sky-deep"
            >
              <Archive className="h-4 w-4" />
              Trade Archive
            </Link>
            <Link
              href="/app/nexus-pulse/daily-reports"
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-[13px] font-semibold text-violet-900"
            >
              <FileText className="h-4 w-4" />
              Daily Reports
            </Link>
          </>
        )}
      </section>

      {session && (
        <>
          {/* Day P&L strip */}
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Day net (all)
              </div>
              <div className={`mt-1 text-xl font-bold ${pnlClass(stats.dayNet)}`}>
                {fmtInr(stats.dayNet)}
              </div>
              <div className="text-[10px] text-sky-ink/45">realized + open mark</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Realized
              </div>
              <div className={`mt-1 text-xl font-bold ${pnlClass(stats.realizedNet)}`}>
                {fmtInr(stats.realizedNet)}
              </div>
              <div className="text-[10px] text-sky-ink/45">
                W {stats.wins} / L {stats.losses}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Open (unrealized)
              </div>
              <div className={`mt-1 text-xl font-bold ${pnlClass(stats.unrealizedNet)}`}>
                {fmtInr(stats.unrealizedNet)}
              </div>
              <div className="text-[10px] text-sky-ink/45">
                after ₹{NEXUS_PULSE_RULES.roundTripCostInr} cost
              </div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Spot
              </div>
              <div className="mt-1 text-xl font-bold text-sky-deep">
                {session.spot > 0 ? session.spot.toFixed(1) : '—'}
              </div>
              <div className="text-[10px] text-sky-ink/45">{session.sessionDate}</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Positions
              </div>
              <div className="mt-1 text-xl font-bold text-sky-deep">
                {session.openTrades.length} open
              </div>
              <div className="text-[10px] text-sky-ink/45">
                {session.closedTrades.length} closed
              </div>
            </div>
          </section>

          {/* Signal */}
          <section className="mt-4 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-sky-deep">Signal (live)</h2>
            {session.lastSignal ? (
              <p className="mt-2 text-[13px] text-sky-ink/80">
                <span
                  className={
                    session.lastSignal.side === 'CE'
                      ? 'font-bold text-emerald-700'
                      : session.lastSignal.side === 'PE'
                        ? 'font-bold text-rose-700'
                        : 'font-bold'
                  }
                >
                  {session.lastSignal.side}
                </span>{' '}
                · {session.lastSignal.reason}
                <br />
                <span className="text-[12px] text-sky-ink/55">
                  3m buy={String(session.lastSignal.buy3m)} sell=
                  {String(session.lastSignal.sell3m)} · 5m pos={session.lastSignal.pos5m} · edge=
                  {String(session.lastSignal.new3mEdge)}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-sky-ink/55">Waiting for first UT tick…</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">3m UT pos</div>
                {session.ut3m?.last?.pos ?? '—'}
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">3m trail stop</div>
                {session.ut3m?.last?.trailingStop?.toFixed(1) ?? '—'}
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">5m UT pos</div>
                {session.ut5m?.last?.pos ?? '—'}
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">5m trail stop</div>
                {session.ut5m?.last?.trailingStop?.toFixed(1) ?? '—'}
              </div>
            </div>
          </section>

          {/* Open positions — full detail */}
          <section className="mt-6">
            <h2 className="text-sm font-bold text-sky-deep">
              Open positions ({session.openTrades.length})
            </h2>
            {session.openTrades.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-3 py-4 text-[13px] text-sky-ink/55">
                Flat — no open paper position. Waiting for aligned UT entry.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {session.openTrades.map((t) => {
                  const livePnl = openLivePnl(t);
                  return (
                    <div
                      key={t.id}
                      className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-violet-800">
                            {laneTitle(t.laneId)}
                          </div>
                          <div className="mt-0.5 text-base font-bold text-sky-deep">
                            {t.side} {t.strike}{' '}
                            <span className="text-[12px] font-medium text-sky-ink/55">
                              {t.tradingSymbol}
                            </span>
                          </div>
                          <div className="text-[11px] text-sky-ink/50">
                            Opened {istTime(t.openedAt)}
                            {t.expiry ? ` · exp ${t.expiry}` : ''} · lot {t.lotSize}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-sky-ink/45">Live net</div>
                          <div className={`text-2xl font-bold ${pnlClass(livePnl.net)}`}>
                            {fmtInr(livePnl.net)}
                          </div>
                          <div className={`text-[11px] ${pnlClass(livePnl.gross)}`}>
                            gross {fmtInr(livePnl.gross)} · {fmtPts(livePnl.pts)} pts
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4 md:grid-cols-6">
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] text-sky-ink/45">Entry</div>
                          <div className="font-semibold">₹{t.entryPremium.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] text-sky-ink/45">Mark</div>
                          <div className="font-semibold">₹{livePnl.mark.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] text-sky-ink/45">SL</div>
                          <div className="font-semibold">₹{t.stopLossPremium.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] text-sky-ink/45">Entry spot</div>
                          <div className="font-semibold">{t.entrySpot.toFixed(1)}</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                          <div className="text-[10px] text-emerald-800/70">High after entry</div>
                          <div className="font-semibold text-emerald-800">
                            ₹{(t.highPremium ?? t.entryPremium + t.maxFavorablePts).toFixed(2)}
                            <span className="ml-1 text-[10px] font-medium">
                              (+{t.maxFavorablePts.toFixed(2)})
                            </span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-rose-50 px-2 py-1.5">
                          <div className="text-[10px] text-rose-800/70">Low after entry</div>
                          <div className="font-semibold text-rose-800">
                            ₹{(t.lowPremium ?? t.entryPremium - t.maxAdversePts).toFixed(2)}
                            <span className="ml-1 text-[10px] font-medium">
                              (−{t.maxAdversePts.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Closed trades — full table */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-sky-deep">
              Closed trades ({session.closedTrades.length})
            </h2>
            {closedNewestFirst.length === 0 ? (
              <p className="mt-2 text-[13px] text-sky-ink/55">No closed trades yet today.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-sky-100 bg-white shadow-sm">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="border-b border-sky-100 bg-sky-50/60 text-[10px] uppercase tracking-wide text-sky-ink/50">
                    <tr>
                      <th className="px-3 py-2">Lane</th>
                      <th className="px-3 py-2">Side</th>
                      <th className="px-3 py-2">Strike</th>
                      <th className="px-3 py-2">In</th>
                      <th className="px-3 py-2">Out</th>
                      <th className="px-3 py-2">Taken</th>
                      <th className="px-3 py-2">Entry</th>
                      <th className="px-3 py-2">High</th>
                      <th className="px-3 py-2">Low</th>
                      <th className="px-3 py-2">Exit</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedNewestFirst.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {laneTitle(t.laneId).replace(/^A · |^B · /, '')}
                        </td>
                        <td
                          className={`px-3 py-2 font-semibold ${
                            t.side === 'CE' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {t.side}
                        </td>
                        <td className="px-3 py-2">{t.strike}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{istTime(t.openedAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{istTime(t.closedAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{durationHHMM(t.openedAt, t.closedAt)}</td>
                        <td className="px-3 py-2">₹{t.entryPremium.toFixed(2)}</td>
                        <td className="px-3 py-2 text-emerald-700">
                          ₹
                          {(
                            t.highPremium ??
                            t.entryPremium + t.maxFavorablePts
                          ).toFixed(2)}
                          <span className="block text-[9px] text-emerald-700/70">
                            +{t.maxFavorablePts.toFixed(2)} pts
                          </span>
                        </td>
                        <td className="px-3 py-2 text-rose-700">
                          ₹
                          {(
                            t.lowPremium ??
                            t.entryPremium - t.maxAdversePts
                          ).toFixed(2)}
                          <span className="block text-[9px] text-rose-700/70">
                            −{t.maxAdversePts.toFixed(2)} pts
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {t.exitPremium != null ? `₹${t.exitPremium.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2">{exitReasonLabel(t.exitReason)}</td>
                        <td className={`px-3 py-2 font-medium ${pnlClass(t.grossPnl ?? 0)}`}>
                          {fmtInr(t.grossPnl)}
                        </td>
                        <td className={`px-3 py-2 font-bold ${pnlClass(t.netPnl ?? 0)}`}>
                          {fmtInr(t.netPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Per-lane mini summary */}
          <section className="mt-6 grid gap-3 md:grid-cols-2">
            {(Object.keys(NEXUS_LANES) as NexusLaneId[]).map((laneId) => {
              const open = session.openTrades.filter((t) => t.laneId === laneId);
              const closed = session.closedTrades.filter((t) => t.laneId === laneId);
              const realized = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
              const unreal = open.reduce((s, t) => s + openLivePnl(t).net, 0);
              return (
                <div
                  key={laneId}
                  className="rounded-2xl border border-sky-100 bg-sky-50/30 px-4 py-3"
                >
                  <div className="text-sm font-bold text-sky-deep">{NEXUS_LANES[laneId].title}</div>
                  <p className="mt-1 text-[11px] text-sky-ink/55">{NEXUS_LANES[laneId].description}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
                    <span>
                      Open <strong>{open.length}</strong>
                    </span>
                    <span>
                      Closed <strong>{closed.length}</strong>
                    </span>
                    <span className={pnlClass(realized)}>Realized {fmtInr(realized)}</span>
                    <span className={pnlClass(unreal)}>Open {fmtInr(unreal)}</span>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold text-sky-deep">Rules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-sky-ink/60">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
