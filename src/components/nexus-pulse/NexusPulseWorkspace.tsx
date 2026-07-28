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
import type { NexusAtmBoard, NexusPaperTrade, NexusPulseSession } from '@/lib/nexus-pulse/types';
import { fetchAppPost } from '@/lib/local-server';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';
import { useAuth } from '@/components/auth/AuthProvider';

const POLL_MS = NEXUS_PULSE_RULES.tickPollMsFlat;
/** ATM Lab–style quote refresh (broker terminal feel). */
const BOARD_POLL_MS = 1000;

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

type LaneSelectionMode = 'morning_open_stop_15' | 'current_bans' | 'both';
type NexusBacktestSummary = {
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  days: number;
  note: string;
  premiumModel?: string;
  optionFetches?: number;
  byLane?: Partial<
    Record<NexusLaneId, { grossPnl: number; netPnl: number; totalTrades: number; winRate: number }>
  >;
};

function laneModeFromActive(active: NexusLaneId[] | undefined): LaneSelectionMode {
  const lanes = active ?? [];
  const hasA = lanes.includes('current_bans');
  const hasB = lanes.includes('morning_open_stop_15');
  if (hasA && hasB) return 'both';
  if (hasA) return 'current_bans';
  return 'morning_open_stop_15';
}

function activeLanesFromMode(mode: LaneSelectionMode): NexusLaneId[] {
  if (mode === 'both') return ['current_bans', 'morning_open_stop_15'];
  return [mode];
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
  if (reason === 'UT_3M') return 'Sector 7 A (3m)';
  return reason;
}

function PriceCard({
  label,
  value,
  hint,
  tone,
  flash,
}: {
  label: string;
  value?: number | null;
  hint: string;
  tone?: 'ce' | 'pe';
  flash?: 'up' | 'down' | null;
}) {
  const border =
    tone === 'ce'
      ? 'border-emerald-200'
      : tone === 'pe'
        ? 'border-rose-200'
        : 'border-sky-100';
  const labelColor =
    tone === 'ce'
      ? 'text-emerald-800/70'
      : tone === 'pe'
        ? 'text-rose-800/70'
        : 'text-sky-ink/45';
  const flashBg =
    flash === 'up'
      ? 'bg-emerald-50'
      : flash === 'down'
        ? 'bg-rose-50'
        : 'bg-white';
  return (
    <div className={`rounded-2xl border ${border} ${flashBg} px-3 py-3 shadow-sm transition-colors duration-200`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${labelColor}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-sky-deep">
        {value != null && Number.isFinite(value) ? value.toFixed(2) : '—'}
      </p>
      <p className="mt-0.5 text-[10px] text-sky-ink/50">{hint}</p>
    </div>
  );
}

export default function NexusPulseWorkspace() {
  const { isAdmin } = useAuth();
  const [session, setSession] = useState<NexusPulseSession | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const [settingsBusy, setSettingsBusy] = useState('');
  const [boardLatencyMs, setBoardLatencyMs] = useState<number | null>(null);
  const [flash, setFlash] = useState<{
    nifty: 'up' | 'down' | null;
    ce: 'up' | 'down' | null;
    pe: 'up' | 'down' | null;
  }>({ nifty: null, ce: null, pe: null });
  const pollRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const boardTimerRef = useRef<number | null>(null);
  const prevBoardRef = useRef<NexusAtmBoard | null>(null);
  const [laneMode, setLaneMode] = useState<LaneSelectionMode>('morning_open_stop_15');
  const [stopAfterLossEnabled, setStopAfterLossEnabled] = useState(false);
  const [stopAfterLossInr, setStopAfterLossInr] = useState(3000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [btFrom, setBtFrom] = useState(monthAgo);
  const [btTo, setBtTo] = useState(new Date().toISOString().slice(0, 10));
  const [backtestBusy, setBacktestBusy] = useState('');
  const [backtestRun, setBacktestRun] = useState<NexusBacktestSummary | null>(null);

  useEffect(() => {
    setLive(isUpstoxConnected());
  }, []);

  useEffect(() => {
    if (!session) return;
    const active = session.settings?.activeLanes ?? [];
    setLaneMode(laneModeFromActive(active));
    setStopAfterLossEnabled(Boolean(session.settings?.stopAfterLossEnabled));
    setStopAfterLossInr(session.settings?.stopAfterLossInr ?? 3000);
  }, [session]);

  const token = () => getUpstoxAccessToken();

  const callApi = useCallback(async (path: string) => {
    const t = token();
    if (!t) throw new Error('Connect Upstox in Settings first.');
    return fetchAppPost<{ ok: boolean; session: NexusPulseSession; error?: string }>({
      path,
      token: t,
    });
  }, []);

  const applyBoardFlash = useCallback((next: NexusAtmBoard) => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = next;
    if (!prev) return;
    const dir = (a?: number | null, b?: number | null): 'up' | 'down' | null => {
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (b > a) return 'up';
      if (b < a) return 'down';
      return null;
    };
    setFlash({
      nifty: dir(prev.spot, next.spot),
      ce: dir(prev.ce?.ltp, next.ce?.ltp),
      pe: dir(prev.pe?.ltp, next.pe?.ltp),
    });
    window.setTimeout(() => setFlash({ nifty: null, ce: null, pe: null }), 350);
  }, []);

  const saveSettings = useCallback(async (next?: { laneMode?: LaneSelectionMode; stopAfterLossEnabled?: boolean; stopAfterLossInr?: number }) => {
    const t = token();
    if (!t) throw new Error('Connect Upstox in Settings first.');
    const nextLaneMode = next?.laneMode ?? laneMode;
    const lossEnabled = next?.stopAfterLossEnabled ?? stopAfterLossEnabled;
    const lossInr = next?.stopAfterLossInr ?? stopAfterLossInr;
    setSettingsBusy('Saving...');
    setError('');
    try {
      const data = await fetchAppPost<{ ok: boolean; session: NexusPulseSession; error?: string }>({
        path: '/api/nexus-pulse/settings',
        token: t,
        body: {
          activeLanes: activeLanesFromMode(nextLaneMode),
          stopAfterLossEnabled: lossEnabled,
          stopAfterLossInr: lossInr,
        },
      });
      setSession(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings save failed');
    } finally {
      setSettingsBusy('');
    }
  }, [laneMode, stopAfterLossEnabled, stopAfterLossInr]);

  const pollBoard = useCallback(async () => {
    const t = token();
    if (!t || !pollRef.current) return;
    try {
      const data = await fetchAppPost<{
        ok: boolean;
        board?: NexusAtmBoard;
        spot?: number;
        latencyMs?: number;
        error?: string;
      }>({
        path: '/api/nexus-pulse/board',
        token: t,
        retries: 0,
      });
      if (data.board) {
        applyBoardFlash(data.board);
        setBoardLatencyMs(data.latencyMs ?? null);
        setSession((prev) =>
          prev
            ? {
                ...prev,
                spot: data.spot ?? data.board!.spot ?? prev.spot,
                board: data.board!,
              }
            : prev
        );
      }
    } catch {
      /* keep last board; strategy tick still runs */
    }
  }, [applyBoardFlash]);

  const scheduleBoard = useCallback(
    (delayMs: number) => {
      if (boardTimerRef.current) window.clearTimeout(boardTimerRef.current);
      boardTimerRef.current = window.setTimeout(() => {
        if (!pollRef.current) return;
        void (async () => {
          await pollBoard();
          scheduleBoard(BOARD_POLL_MS);
        })();
      }, delayMs);
    },
    [pollBoard]
  );

  const scheduleTick = useCallback(
    (delayMs: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!pollRef.current) return;
        void (async () => {
          try {
            const data = await callApi('/api/nexus-pulse/tick');
            if (data.session) {
              setSession((prev) => {
                // Prefer fresher board from 1s poll if tick is older
                if (
                  prev?.board?.quotedAt &&
                  data.session.board?.quotedAt &&
                  prev.board.quotedAt > data.session.board.quotedAt
                ) {
                  return {
                    ...data.session,
                    board: prev.board,
                    spot: prev.spot || data.session.spot,
                  };
                }
                return data.session;
              });
            }
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
      if (data.session?.board) prevBoardRef.current = data.session.board;
      pollRef.current = true;
      setPolling(true);
      scheduleTick(500);
      scheduleBoard(200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start failed');
    } finally {
      setBusy('');
    }
  }, [callApi, scheduleTick, scheduleBoard]);

  const stopPolling = useCallback(() => {
    pollRef.current = false;
    setPolling(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (boardTimerRef.current) window.clearTimeout(boardTimerRef.current);
  }, []);

  const clearPaperTrades = useCallback(async () => {
    setBusy('Clearing…');
    setError('');
    try {
      const data = await callApi('/api/nexus-pulse/reset');
      setSession(data.session);
      if (data.session?.board) prevBoardRef.current = data.session.board;
      stopPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setBusy('');
    }
  }, [callApi, stopPolling]);

  const runBacktest = useCallback(async () => {
    const t = token();
    if (!t) {
      setError('Connect Upstox in Settings first — backtest needs your session token on this phone.');
      return;
    }
    setBacktestBusy('Real option study (Upstox)… may take a few minutes on mobile');
    setError('');
    try {
      const data = await fetchAppPost<{ ok: boolean; run: NexusBacktestSummary; error?: string }>({
        path: '/api/nexus-pulse/backtest',
        token: t,
        body: {
          fromDate: btFrom,
          toDate: btTo,
          activeLanes: activeLanesFromMode(laneMode),
          mode: 'real_options',
        },
      });
      setBacktestRun(data.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setBacktestBusy('');
    }
  }, [btFrom, btTo, laneMode]);

  useEffect(() => {
    return () => {
      pollRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (boardTimerRef.current) window.clearTimeout(boardTimerRef.current);
    };
  }, []);

  const rules = nexusRuleSummary();
  const visibleLaneIds = useMemo<NexusLaneId[]>(
    () => (session?.settings?.activeLanes?.length ? session.settings.activeLanes : activeLanesFromMode(laneMode)),
    [session, laneMode]
  );
  const visibleOpenTrades = useMemo(
    () => (session?.openTrades ?? []).filter((t) => visibleLaneIds.includes(t.laneId)),
    [session, visibleLaneIds]
  );
  const visibleClosedTrades = useMemo(
    () => (session?.closedTrades ?? []).filter((t) => visibleLaneIds.includes(t.laneId)),
    [session, visibleLaneIds]
  );
  const visibleCeTrade = useMemo(
    () => visibleOpenTrades.find((t) => t.side === 'CE') ?? null,
    [visibleOpenTrades]
  );
  const visiblePeTrade = useMemo(
    () => visibleOpenTrades.find((t) => t.side === 'PE') ?? null,
    [visibleOpenTrades]
  );

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
    const closed = visibleClosedTrades;
    const realizedNet = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const wins = closed.filter((t) => (t.netPnl ?? 0) > 0).length;
    const losses = closed.filter((t) => (t.netPnl ?? 0) <= 0).length;
    let unrealizedNet = 0;
    let openGross = 0;
    for (const t of visibleOpenTrades) {
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
  }, [session, visibleClosedTrades, visibleOpenTrades]);

  const closedNewestFirst = useMemo(() => {
    if (!visibleClosedTrades.length) return [];
    return [...visibleClosedTrades].sort((a, b) =>
      (b.closedAt || '').localeCompare(a.closedAt || '')
    );
  }, [visibleClosedTrades]);

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
            Sector 7 A · 3m entry + 5m agree · selected paper lane only by default · shows live P&amp;L and full
            trade details. Isolated from PinaxForge / Blink / ATM Lab.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          PAPER ONLY
        </div>
      </div>

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
            Start Sector 7 A paper session
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
        <button
          type="button"
          disabled={!live || Boolean(busy)}
          onClick={() => void clearPaperTrades()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-700 disabled:opacity-50"
        >
          {busy === 'Clearing…' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Clear paper trades
        </button>
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

      <section className="mt-4 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-sky-deep">Trade controls</h2>
            <p className="mt-1 text-[11px] text-sky-ink/55">
              Set the lane before starting. New trades will be taken only on the selected lane(s).
            </p>
          </div>
          {settingsBusy ? <span className="text-[11px] text-sky-ink/50">{settingsBusy}</span> : null}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-3 text-[12px]">
            <div className="font-semibold text-sky-deep">Active lane</div>
            <div className="mt-2 space-y-2">
              {([
                ['morning_open_stop_15', 'Morning Open / stop 15'],
                ['current_bans', laneTitle('current_bans')],
                ['both', 'Both lanes'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-[12px] text-sky-ink/80">
                  <input
                    type="radio"
                    name="nexus-lane-mode"
                    checked={laneMode === value}
                    onChange={() => {
                      setLaneMode(value);
                      void saveSettings({ laneMode: value });
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-sky-ink/55">
              Default is Morning Open / stop 15 only.
            </div>
          </div>
          <label className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-3 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-sky-deep">Stop after loss</span>
              <input
                type="checkbox"
                checked={stopAfterLossEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setStopAfterLossEnabled(checked);
                  void saveSettings({ stopAfterLossEnabled: checked });
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-sky-ink/55">
              Blocks new entries once day net falls below your limit.
            </div>
          </label>
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-3 text-[12px]">
            <div className="font-semibold text-sky-deep">Daily loss limit</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={100}
                value={stopAfterLossInr}
                onChange={(e) => setStopAfterLossInr(Number(e.target.value || 0))}
                className="w-28 rounded-lg border border-sky-200 bg-white px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveSettings({ stopAfterLossInr })}
                className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-deep disabled:opacity-50"
                disabled={Boolean(settingsBusy)}
              >
                Apply
              </button>
            </div>
            <div className="mt-1 text-[11px] text-sky-ink/55">
              Current guard:{' '}
              {!session
                ? 'Waiting for session'
                : session.guard?.blockedNewEntries
                  ? `STOPPED${session.guard.reason ? ` - ${session.guard.reason}` : ''}`
                  : 'ACTIVE'}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-sky-deep">Real option study (BOTS engine)</h2>
            <p className="mt-1 text-[11px] text-sky-ink/55">
              Replays NexusPulse Style A/B on Upstox Nifty 1m + real ATM option 1m closes (last ~31 days max).
              Paper desk uses the same UT trail/exit rules; strikes use live ₹50+ rule when ATM is cheap.
            </p>
          </div>
          {backtestBusy ? <span className="text-[11px] text-sky-ink/50">{backtestBusy}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-[12px] text-sky-ink/70">
            <div className="mb-1 font-semibold text-sky-deep">From</div>
            <input
              type="date"
              value={btFrom}
              onChange={(e) => setBtFrom(e.target.value)}
              className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="text-[12px] text-sky-ink/70">
            <div className="mb-1 font-semibold text-sky-deep">To</div>
            <input
              type="date"
              value={btTo}
              onChange={(e) => setBtTo(e.target.value)}
              className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!live || Boolean(backtestBusy)}
            onClick={() => void runBacktest()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-[13px] font-semibold text-sky-deep disabled:opacity-50"
          >
            {backtestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run real-option study
          </button>
        </div>
        {backtestRun ? (
          <div className="mt-3 grid gap-3 md:grid-cols-6">
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Range</div>
              <div className="font-semibold">{backtestRun.fromDate} → {backtestRun.toDate}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Trades</div>
              <div className="font-semibold">{backtestRun.totalTrades}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Win rate</div>
              <div className="font-semibold">{backtestRun.winRate}%</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Net</div>
              <div className={`font-semibold ${pnlClass(backtestRun.netPnl)}`}>{fmtInr(backtestRun.netPnl)}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Gross</div>
              <div className={`font-semibold ${pnlClass(backtestRun.grossPnl)}`}>{fmtInr(backtestRun.grossPnl)}</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px]">
              <div className="text-[10px] text-sky-ink/45">Days</div>
              <div className="font-semibold">{backtestRun.days}</div>
            </div>
            <p className="md:col-span-6 text-[11px] text-sky-ink/55">
              {backtestRun.premiumModel ? `${backtestRun.premiumModel}. ` : ''}
              {backtestRun.note}
              {backtestRun.optionFetches != null ? ` Option candle fetches: ${backtestRun.optionFetches}.` : ''}
            </p>
            {backtestRun.byLane && laneMode === 'both' ? (
              <div className="md:col-span-6 grid gap-2 sm:grid-cols-2">
                {(['current_bans', 'morning_open_stop_15'] as NexusLaneId[]).map((id) => {
                  const row = backtestRun.byLane?.[id];
                  if (!row) return null;
                  return (
                    <div key={id} className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-[12px]">
                      <div className="font-semibold text-sky-deep">{laneTitle(id)}</div>
                      <div className="mt-1 text-sky-ink/70">
                        {row.totalTrades} trades · {row.winRate}% win · gross {fmtInr(row.grossPnl)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {session && (
        <>
          {/* Live prices — ATM Lab style (~1s terminal quotes) */}
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-ink/50">
                Live quotes
                {polling ? (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    ● 1s terminal
                  </span>
                ) : null}
              </p>
              <p className="text-[10px] text-sky-ink/45">
                latency {boardLatencyMs != null ? `${boardLatencyMs}ms` : '—'}
                {session.board?.expiry ? ` · expiry ${session.board.expiry}` : ''}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <PriceCard
                label="Nifty"
                value={session.board?.spot ?? session.spot}
                flash={flash.nifty}
                hint={
                  session.board?.quotedAt
                    ? `Live · ${new Date(session.board.quotedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}`
                    : session.updatedAt
                      ? `Updated ${new Date(session.updatedAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}`
                      : 'Waiting for quote…'
                }
              />
              <PriceCard
                label={`Selected ${visibleCeTrade?.strike ?? session.board?.ce?.strike ?? session.board?.atmStrike ?? '—'} CE`}
                value={visibleCeTrade ? openLivePnl(visibleCeTrade).mark : session.board?.ce?.ltp}
                flash={flash.ce}
                hint={
                  visibleCeTrade
                    ? `${visibleCeTrade.tradingSymbol} · entry ${visibleCeTrade.entryPremium.toFixed(2)}`
                    : session.board?.ce
                      ? `Spread ${
                          session.board.ce.bid != null && session.board.ce.ask != null
                            ? (session.board.ce.ask - session.board.ce.bid).toFixed(2)
                            : '—'
                        } · ${session.board.ce.tradingSymbol}`
                      : session.board?.note || 'Resolving CE…'
                }
                tone="ce"
              />
              <PriceCard
                label={`Selected ${visiblePeTrade?.strike ?? session.board?.pe?.strike ?? session.board?.atmStrike ?? '—'} PE`}
                value={visiblePeTrade ? openLivePnl(visiblePeTrade).mark : session.board?.pe?.ltp}
                flash={flash.pe}
                hint={
                  visiblePeTrade
                    ? `${visiblePeTrade.tradingSymbol} · entry ${visiblePeTrade.entryPremium.toFixed(2)}`
                    : session.board?.pe
                      ? `Spread ${
                          session.board.pe.bid != null && session.board.pe.ask != null
                            ? (session.board.pe.ask - session.board.pe.bid).toFixed(2)
                            : '—'
                        } · ${session.board.pe.tradingSymbol}`
                      : session.board?.note || 'Resolving PE…'
                }
                tone="pe"
              />
            </div>
          </section>

          {/* Day P&L strip */}
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
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
                Positions
              </div>
              <div className="mt-1 text-xl font-bold text-sky-deep">
                {visibleOpenTrades.length} open
              </div>
              <div className="text-[10px] text-sky-ink/45">
                {visibleClosedTrades.length} closed
                {session.ut3m?.bars != null ? ` · 3m bars ${session.ut3m.bars}` : ''}
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
                  {(session.ut3m?.bars ?? 0) < 20
                    ? ' · warming up candles (need prior-day history)…'
                    : ''}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-sky-ink/55">Waiting for first Sector 7 A tick…</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">3m Sector 7 A</div>
                {session.ut3m?.last?.pos ?? '—'}
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">3m trail stop</div>
                {session.ut3m?.last?.trailingStop?.toFixed(1) ?? '—'}
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold">5m Sector 7 A</div>
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
              Open positions ({visibleOpenTrades.length})
            </h2>
            {visibleOpenTrades.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-3 py-4 text-[13px] text-sky-ink/55">
                Flat on selected lane(s) — no open paper position. Waiting for aligned Sector 7 A entry.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {visibleOpenTrades.map((t) => {
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
              Closed trades ({visibleClosedTrades.length})
            </h2>
            {closedNewestFirst.length === 0 ? (
              <p className="mt-2 text-[13px] text-sky-ink/55">No closed trades yet for the selected lane(s).</p>
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
            {visibleLaneIds.map((laneId) => {
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
