'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anvil,
  CheckCircle2,
  CircleDashed,
  Download,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import {
  PINAX_FORGE_MODULES,
  PINAX_FORGE_NAME,
  PINAX_FORGE_RULES,
  PINAX_FORGE_VERSION,
  pinaxForgeRuleSummary,
} from '@/lib/pinax-forge/rules';
import type { PinaxForgeSession, PinaxOverrideAction } from '@/lib/pinax-forge/types';
import {
  backupPinaxSession,
  loadPinaxSessionBackup,
} from '@/lib/pinax-forge/session-backup';
import {
  fetchLocalPost,
  isLocalAppHost,
  localAppOrigin,
  offlineUserMessage,
  pingLocalServer,
  pinaxForgeLocalUrl,
  type LocalServerState,
} from '@/lib/local-server';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';
import PinaxNiftyLiveFeed from '@/components/pinax-forge/PinaxNiftyLiveFeed';

type StatusPayload = {
  ok?: boolean;
  message?: string;
  serverAt?: string;
  error?: string;
};

const POLL_MS_FLAT = 5_000;
/** With an open paper position — watch premium tightly (near 1s). */
const POLL_MS_IN_TRADE = 1_000;
const SERVER_PROBE_MS = 5000;

function biasColor(bias: string) {
  if (bias === 'UP') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (bias === 'DOWN') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-amber-800 bg-amber-50 border-amber-200';
}

function fmtInr(n: number | undefined | null) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}₹${n.toFixed(0)}`;
}

function istHHMM(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

export default function PinaxForgeWorkspace() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState('');
  const [pageOrigin, setPageOrigin] = useState('');
  const [serverState, setServerState] = useState<LocalServerState>(
    isLocalAppHost() ? 'offline' : 'wrong-host'
  );
  const [session, setSession] = useState<PinaxForgeSession | null>(() =>
    typeof window !== 'undefined' ? loadPinaxSessionBackup() : null
  );
  const [live, setLive] = useState(false);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const [linkLine, setLinkLine] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<PinaxForgeSession | null>(null);
  const pollingRef = useRef(false);
  const fetchFailRef = useRef(0);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
    if (session) backupPinaxSession(session);
  }, [session]);

  useEffect(() => {
    pollingRef.current = polling;
  }, [polling]);

  useEffect(() => {
    setLive(isUpstoxConnected());
    setPageOrigin(localAppOrigin());
    if (!isLocalAppHost()) {
      setServerState('wrong-host');
      return;
    }

    let cancelled = false;
    const probe = async () => {
      const ok = await pingLocalServer();
      if (cancelled) return;
      setServerState(ok ? 'online' : 'offline');
      if (ok && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setLinkLine('Server back online — resuming PinaxForge…');
        setError('');
      }
    };

    void probe();
    const id = window.setInterval(() => void probe(), SERVER_PROBE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isLocalAppHost()) return;
      try {
        const ok = await pingLocalServer();
        if (cancelled) return;
        if (!ok) {
          setServerState('offline');
          return;
        }
        const res = await fetch('/api/pinax-forge/status', { cache: 'no-store' });
        const data = (await res.json()) as StatusPayload;
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(data.error || `Status failed (${res.status})`);
          return;
        }
        setStatus(data);
        setServerState('online');
        setError('');
      } catch {
        if (!cancelled) {
          setServerState('offline');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverState]);

  const callApi = useCallback(async (path: string, body?: object) => {
    const token = getUpstoxAccessToken();
    if (!token) throw new Error('Reconnect Upstox before starting PinaxForge.');
    const data = await fetchLocalPost<{
      ok?: boolean;
      error?: string;
      session?: PinaxForgeSession;
    }>({ path, token, body, retries: 4 });
    if (!data.session) {
      throw new Error(data.error || 'No session in response');
    }
    fetchFailRef.current = 0;
    setServerState('online');
    return data.session;
  }, []);

  const handleTickFailure = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : 'Tick failed';
    fetchFailRef.current += 1;
    wasOfflineRef.current = true;
    setServerState('offline');
    if (sessionRef.current) backupPinaxSession(sessionRef.current);
    setLinkLine(
      `OFFLINE — session saved in browser (${sessionRef.current?.openTrades.length ?? 0} open trades). Auto-retry ${fetchFailRef.current}…`
    );
    setError(message);
  }, []);

  const scheduleTick = useCallback(
    (delayMs: number) => {
      if (tickTimerRef.current) window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = window.setTimeout(() => {
        if (!pollingRef.current) return;
        void (async () => {
          try {
            const s = await callApi('/api/pinax-forge/tick');
            setSession(s);
            setError('');
            const inTrade = (s.openTrades?.length ?? 0) > 0;
            setLinkLine(
              inTrade
                ? 'LIVE PAPER — WS/1s price watch (position open).'
                : 'LIVE PAPER — polling active.'
            );
            setServerState('online');
            scheduleTick(inTrade ? POLL_MS_IN_TRADE : POLL_MS_FLAT);
          } catch (e) {
            handleTickFailure(e);
            scheduleTick(Math.min(15000, 2000 * Math.max(1, fetchFailRef.current)));
          }
        })();
      }, delayMs);
    },
    [callApi, handleTickFailure]
  );

  const runOverride = useCallback(
    async (action: PinaxOverrideAction, extra?: { setupId?: string; tradeId?: string }) => {
      setBusy('Override…');
      setError('');
      try {
        const s = await callApi('/api/pinax-forge/override', { action, ...extra });
        setSession(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Override failed');
      } finally {
        setBusy('');
      }
    },
    [callApi]
  );

  const downloadReview = useCallback(async () => {
    setBusy('Export…');
    try {
      const date = session?.sessionDate || new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/pinax-forge/review?date=${date}&format=markdown`);
      if (!res.ok) throw new Error('Review export failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pinax-forge-review-${date}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy('');
    }
  }, [session?.sessionDate]);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (tickTimerRef.current) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setPolling(false);
    setLinkLine('');
  }, []);

  const runTick = useCallback(async () => {
    try {
      const s = await callApi('/api/pinax-forge/tick');
      setSession(s);
      setError('');
      setLinkLine('LIVE PAPER — tick OK.');
      setServerState('online');
      return s;
    } catch (e) {
      handleTickFailure(e);
      throw e;
    }
  }, [callApi, handleTickFailure]);

  const startSession = useCallback(async () => {
    setBusy('Starting…');
    setError('');
    try {
      const s = await callApi('/api/pinax-forge/init');
      setSession(s);
      setPolling(true);
      pollingRef.current = true;
      setLinkLine('LIVE PAPER — session started.');
      scheduleTick(800);
    } catch (e) {
      setError(e instanceof Error ? e.message : offlineUserMessage());
    } finally {
      setBusy('');
    }
  }, [callApi, scheduleTick]);

  // If paper session already exists and Upstox is live, resume polling without a click.
  const autoResumeRef = useRef(false);
  useEffect(() => {
    if (autoResumeRef.current) return;
    if (!live || polling || serverState !== 'online') return;
    if (!session?.startedAt) return;
    autoResumeRef.current = true;
    setPolling(true);
    pollingRef.current = true;
    setLinkLine('LIVE PAPER — auto-resumed after reload.');
    scheduleTick(500);
  }, [live, polling, serverState, session, scheduleTick]);

  const manualTick = useCallback(async () => {
    setBusy('Tick…');
    try {
      await runTick();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tick failed');
    } finally {
      setBusy('');
    }
  }, [runTick]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const rules = pinaxForgeRuleSummary();
  const perf = session?.performance;
  const morning = session?.morningRead;
  const ctx = session?.morningContext;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Separate agent · Paper only · Not Blink
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Anvil className="h-7 w-7 text-sky-deep" />
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              {PINAX_FORGE_NAME}
            </h1>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-900">
              {PINAX_FORGE_VERSION}
            </span>
            {polling && (
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  serverState === 'online'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {serverState === 'online' ? 'LIVE PAPER' : 'OFFLINE (auto-retry)'}
              </span>
            )}
            {session?.autoPaused && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                AUTO PAUSED
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sky-ink/60">
            Sole aim: make money. Watch every point → analyse past + live → decide → TAKE.
            No fixed trade count — every real opportunity can be taken anytime.
            Front-week 1 lot · drastic flip-close then re-analyse · cost-aware.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          LIVE ORDERS BLOCKED
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-950">
        <strong>Isolation:</strong> PinaxForge does not modify Blink. This page uses its own
        APIs under <code className="font-mono">/api/pinax-forge/*</code>.
      </div>

      {pageOrigin && !isLocalAppHost() && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
          Wrong site: <code className="font-mono">{pageOrigin}</code>. PinaxForge must run locally →{' '}
          <a href={pinaxForgeLocalUrl()} className="underline">
            {pinaxForgeLocalUrl()}
          </a>
        </p>
      )}

      {isLocalAppHost() && serverState === 'offline' && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Server offline</strong> — auto-retrying every few seconds. Session data is kept in
          your browser. Once: Cursor Terminal →{' '}
          <code className="font-mono">npm run live</code> → leave that tab open (watchdog stays running).
        </p>
      )}

      {isLocalAppHost() && serverState === 'online' && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          Local server connected at {pageOrigin}.
          {linkLine ? ` ${linkLine}` : ''}
        </p>
      )}

      {isLocalAppHost() && <PinaxNiftyLiveFeed />}

      {!live && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Connect Upstox first (Settings) — PinaxForge needs live Nifty + option quotes for
          paper fills.
        </p>
      )}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : (
        <p className="mt-4 text-[12px] text-sky-ink/55">
          {status?.message ?? 'Loading…'}
          {status?.serverAt
            ? ` · ${new Date(status.serverAt).toLocaleString('en-IN')}`
            : ''}
        </p>
      )}

      <section className="mt-5 flex flex-wrap items-center gap-2">
        {!polling ? (
          <>
            <button
              type="button"
              disabled={!live || Boolean(busy)}
              onClick={() => void startSession()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-deep px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {session?.openTrades != null ? 'Resume paper session' : 'Start paper session'}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void downloadReview()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-4 py-2 text-[13px] font-semibold text-sky-ink disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              EOD review
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void manualTick()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-4 py-2 text-[13px] font-semibold text-sky-ink disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Tick now
            </button>
            <button
              type="button"
              onClick={stopPolling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-800"
            >
              <Square className="h-4 w-4" />
              Stop polling
            </button>
            {session && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void runOverride(session.autoPaused ? 'resume_auto' : 'pause_auto')
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-900 disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                {session.autoPaused ? 'Resume auto' : 'Pause auto'}
              </button>
            )}
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void downloadReview()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-4 py-2 text-[13px] font-semibold text-sky-ink disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              EOD review
            </button>
          </>
        )}
        {session && (
          <span className="text-[12px] text-sky-ink/50">
            Spot {session.spot.toFixed(1)} · updated{' '}
            {new Date(session.updatedAt).toLocaleTimeString('en-IN')}
          </span>
        )}
      </section>

      {session && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Morning desk
              </h2>
              {morning ? (
                <div className="mt-3 space-y-2 text-[13px] text-sky-ink/75">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${biasColor(morning.bias)}`}
                    >
                      {morning.bias} · {morning.confidence}%
                    </span>
                    <span>
                      Open {morning.fromOpenPts >= 0 ? '+' : ''}
                      {morning.fromOpenPts} pts
                    </span>
                    {ctx?.pdh != null && (
                      <span>
                        PDH {ctx.pdh.toFixed(0)}
                        {morning.vsPdhPts != null ? ` (${morning.vsPdhPts})` : ''}
                      </span>
                    )}
                    {ctx?.pdl != null && (
                      <span>
                        PDL {ctx.pdl.toFixed(0)}
                        {morning.vsPdlPts != null ? ` (${morning.vsPdlPts})` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-sky-ink/55">{ctx?.threeDayNote}</p>
                  <ul className="list-disc pl-5 text-[12px]">
                    {morning.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {session.zones.length > 0 && (
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {session.zones.slice(0, 6).map((z) => (
                        <div
                          key={`${z.anchor}-${z.kind}`}
                          className="rounded-lg border border-[#dbe8f2] bg-sky-soft/20 px-2 py-1.5 text-[11px]"
                        >
                          <span className="font-bold">{z.kind}</span> {z.anchor}{' '}
                          {z.low.toFixed(0)}–{z.high.toFixed(0)}
                          <span className="block text-sky-ink/50">{z.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-sky-ink/50">Waiting for today&apos;s bars…</p>
              )}
              <p className="mt-2 text-[11px] text-sky-ink/45">{session.priceAction.structureText}</p>
            </section>

            <section className="rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Performance (after ₹{PINAX_FORGE_RULES.roundTripCostInr} cost)
              </h2>
              {perf ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <dt className="text-sky-ink/50">Closed</dt>
                    <dd className="font-semibold">{perf.closedTrades}</dd>
                  </div>
                  <div>
                    <dt className="text-sky-ink/50">Win rate</dt>
                    <dd className="font-semibold">{perf.winRate}%</dd>
                  </div>
                  <div>
                    <dt className="text-sky-ink/50">Net P&L</dt>
                    <dd
                      className={`font-semibold ${(perf.netPnl ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                    >
                      {fmtInr(perf.netPnl)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sky-ink/50">Expectancy</dt>
                    <dd className="font-semibold">{fmtInr(perf.expectancy)}/trade</dd>
                  </div>
                  <div className="col-span-2 text-[11px] text-sky-ink/45">
                    RR hits — 1:1 {perf.rrHits['1'] ?? 0} · 1:1.5 {perf.rrHits['1.5'] ?? 0} · 1:2{' '}
                    {perf.rrHits['2'] ?? 0}
                  </div>
                </dl>
              ) : null}
              {session.entryCutoffReached && (
                <p className="mt-2 text-[11px] font-semibold text-amber-800">
                  Entry cutoff reached — no new entries; open trades managed to exit.
                </p>
              )}
              {session.tuning && (
                <div className="mt-3 border-t border-[#eef4f8] pt-2 text-[11px] text-sky-ink/55">
                  <p className="font-semibold text-sky-ink/70">Tuning</p>
                  <p>Min confidence: {session.tuning.minConfidence}%</p>
                  <p>Sample trades: {session.tuning.sampleTrades}</p>
                  {session.tuning.notes.slice(0, 2).map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Latest 1m setups
              </h2>
              {session.lastSetups.length ? (
                <ul className="mt-2 space-y-2">
                  {session.lastSetups.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-[#dbe8f2] bg-sky-soft/10 px-3 py-2 text-[12px]"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">
                          {s.kind.replace(/_/g, ' ')} · {s.side}
                        </span>
                        <span
                          className={
                            s.decision === 'TAKE'
                              ? 'font-bold text-emerald-700'
                              : 'text-sky-ink/50'
                          }
                        >
                          {s.decision} {s.confidence}%
                        </span>
                      </div>
                      <p className="text-sky-ink/55">
                        Level {s.level.toFixed(0)} · spot {s.spot.toFixed(1)}
                      </p>
                      {s.skipReason && (
                        <p className="text-[11px] text-amber-800">{s.skipReason}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={Boolean(busy) || !live}
                          onClick={() => void runOverride('force_take', { setupId: s.id })}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 disabled:opacity-50"
                        >
                          Force take
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void runOverride('force_skip', { setupId: s.id })}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800 disabled:opacity-50"
                        >
                          Force skip
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-sky-ink/50">No setups on last tick.</p>
              )}
            </section>

            <section className="rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Paper trades
              </h2>
              {[...session.openTrades, ...session.closedTrades].length ? (
                <ul className="mt-2 space-y-2">
                  {[...session.openTrades, ...session.closedTrades]
                    .slice(-8)
                    .reverse()
                    .map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl border border-[#dbe8f2] px-3 py-2 text-[12px]"
                      >
                        <div className="flex justify-between">
                          <span className="font-semibold">
                            {t.side} {t.strike} · {t.status.toUpperCase()}
                          </span>
                          <span>{fmtInr(t.netPnl)}</span>
                        </div>
                        <p className="text-sky-ink/55">
                          Entry ₹{t.entryPremium}
                          {t.markPremium != null ? ` · mark ₹${t.markPremium}` : ''}
                          {t.exitPremium != null ? ` · exit ₹${t.exitPremium}` : ''} · SL ₹
                          {t.stopLossPremium}
                        </p>
                        <p className="text-[10px] text-sky-ink/50">
                          Opened {istHHMM(t.openedAt)}
                          {t.status === 'closed' && t.closedAt
                            ? ` · Closed ${istHHMM(t.closedAt)} · Dur ${durationHHMM(t.openedAt, t.closedAt)}`
                            : ''}
                        </p>
                        {(t.maxFavorablePts != null ||
                          t.maxAdversePts != null ||
                          t.highPremium != null ||
                          t.lowPremium != null) && (
                          <p className="text-[10px] text-sky-ink/50">
                            High ₹
                            {(
                              t.highPremium ??
                              t.entryPremium + (t.maxFavorablePts ?? 0)
                            ).toFixed(2)}
                            {' · '}Low ₹
                            {(
                              t.lowPremium ??
                              t.entryPremium - (t.maxAdversePts ?? 0)
                            ).toFixed(2)}
                            {' · '}up +₹{t.maxFavorablePts ?? 0}
                            {' · '}down −₹{t.maxAdversePts ?? 0}
                            {' · '}ever green: {t.everProfit ? 'yes' : 'no'}
                          </p>
                        )}
                        {t.status === 'open' && (
                          <button
                            type="button"
                            disabled={Boolean(busy) || !live}
                            onClick={() => void runOverride('close_trade', { tradeId: t.id })}
                            className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 disabled:opacity-50"
                          >
                            Close at LTP
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-sky-ink/50">No paper trades yet today.</p>
              )}
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm">
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Decision journal
            </h2>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11px] text-sky-ink/70">
              {[...(session.recentJournal ?? [])].reverse().map((j, i) => (
                <li key={`${j.at}-${i}`} className="border-b border-[#eef4f8] py-1">
                  <span className="text-sky-ink/40">
                    {new Date(j.at).toLocaleTimeString('en-IN')}
                  </span>{' '}
                  <span className="font-semibold text-sky-ink/60">[{j.type}]</span> {j.message}
                </li>
              ))}
            </ul>
          </section>

          {session.optionCandidates.length > 0 && (
            <section className="mt-4 rounded-2xl border border-[#dbe8f2] bg-white p-4 shadow-sm">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Front-week options (paper fills)
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {session.optionCandidates.slice(0, 8).map((c) => (
                  <span
                    key={c.instrumentKey}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
                  >
                    {c.side} {c.strike} ₹{c.premium}
                    {c.expiry ? ` · ${c.expiry.slice(5)}` : ''}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="mt-6 rounded-2xl border border-[#dbe8f2] bg-white p-5 shadow-sm">
        <h2 className="font-display text-[16px] font-semibold text-sky-ink">Rulebook</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-sky-ink/75">
          {rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-[#dbe8f2] bg-white p-5 shadow-sm">
        <h2 className="font-display text-[16px] font-semibold text-sky-ink">Modules</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PINAX_FORGE_MODULES.map((mod) => (
            <div
              key={mod.id}
              className="rounded-xl border border-[#dbe8f2] bg-sky-soft/20 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-sky-ink">{mod.title}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-sky-ink/50">
                  {mod.status === 'active' || mod.status === 'shell' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" />
                  )}
                  {mod.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-sky-ink/55">{mod.phase1}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
