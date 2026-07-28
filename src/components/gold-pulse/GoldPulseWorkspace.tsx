'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Square, Coins, FlaskConical, Trash2, FileText, Eye, X } from 'lucide-react';
import {
  GOLD_PULSE_NAME,
  GOLD_PULSE_RULES,
  GOLD_PULSE_VERSION,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_SYMBOL,
  goldPulseRuleSummary,
} from '@/lib/gold-pulse/rules';
import {
  GOLD_STRATEGIES,
  goldStrategyParams,
  goldStrategySummaryLines,
  type GoldStrategyId,
} from '@/lib/gold-pulse/strategies';
import { exitReasonLabel } from '@/lib/gold-pulse/signals';
import type { GoldPaperTrade, GoldPulseSession } from '@/lib/gold-pulse/types';
import type { GoldBacktestResult } from '@/lib/gold-pulse/backtest';
import type { GoldStudyReportMeta } from '@/lib/gold-pulse/study-report';

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

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function utcDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function reportListLabel(r: GoldStudyReportMeta) {
  const strat =
    r.strategyId && GOLD_STRATEGIES[r.strategyId] ? ` · ${GOLD_STRATEGIES[r.strategyId].badge}` : '';
  if (r.reportKind === 'detailed_strategy') return `Detailed${strat} · ${r.studyRange?.from ?? r.date}`;
  if (r.studyRange) return `${r.studyRange.from} → ${r.studyRange.to}${strat}`;
  if (r.reportKind === 'end_study') return `Full Yahoo window${strat}`;
  return `${r.date}${strat}`;
}

function strategyBadge(id?: GoldStrategyId | null) {
  if (!id || !GOLD_STRATEGIES[id]) return null;
  return GOLD_STRATEGIES[id].badge;
}

function SectionBlock({ title, lines }: { title: string; lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-bold text-sky-deep">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line, i) => (
          <li key={`${title}-${i}`} className="text-[12px] leading-relaxed text-sky-ink/80">
            · {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GoldPulseWorkspace() {
  const [session, setSession] = useState<GoldPulseSession | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState('');
  const [bt, setBt] = useState<GoldBacktestResult | null>(null);
  const [studyFromDate, setStudyFromDate] = useState(() => utcDaysAgo(30));
  const [studyToDate, setStudyToDate] = useState(utcToday);
  const [studyStrategyId, setStudyStrategyId] = useState<GoldStrategyId>('v12_max');
  const [paperStrategyId, setPaperStrategyId] = useState<GoldStrategyId | null>(null);
  const [studyReports, setStudyReports] = useState<GoldStudyReportMeta[]>([]);
  const [viewer, setViewer] = useState<GoldStudyReportMeta | null>(null);
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

  const loadStudyList = useCallback(async () => {
    const res = await fetch('/api/gold-pulse/study-report', { credentials: 'include' });
    const data = (await res.json()) as { ok?: boolean; reports?: GoldStudyReportMeta[] };
    if (res.ok && data.ok) setStudyReports(data.reports || []);
  }, []);

  const loadPaperStrategy = useCallback(async () => {
    const res = await fetch('/api/gold-pulse/strategy', { credentials: 'include' });
    const data = (await res.json()) as { ok?: boolean; paperStrategyId?: GoldStrategyId | null };
    if (res.ok && data.ok) setPaperStrategyId(data.paperStrategyId ?? null);
  }, []);

  useEffect(() => {
    void loadStudyList().catch(() => undefined);
    void loadPaperStrategy().catch(() => undefined);
  }, [loadStudyList, loadPaperStrategy]);

  useEffect(() => {
    if (session?.paperStrategyId !== undefined) {
      setPaperStrategyId(session.paperStrategyId);
    }
  }, [session?.paperStrategyId]);

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

  async function clearPaper() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm("Clear today's GoldPulse paper trades and archive?")
    ) {
      return;
    }
    setBusy('Clearing paper…');
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: utcToday() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        session?: GoldPulseSession;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Clear failed');
      if (data.session) setSession(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setBusy('');
    }
  }

  async function setPaperStrategy(id: GoldStrategyId, enable: boolean) {
    setBusy(enable ? `Enabling ${GOLD_STRATEGIES[id].badge}…` : 'Disabling paper strategy…');
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/strategy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: enable ? 'enable' : 'disable', strategyId: id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        paperStrategyId?: GoldStrategyId | null;
        session?: GoldPulseSession;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Strategy update failed');
      setPaperStrategyId(data.paperStrategyId ?? null);
      if (data.session) setSession(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Strategy update failed');
    } finally {
      setBusy('');
    }
  }

  async function runBacktest(forStrategyId?: GoldStrategyId) {
    const sid = forStrategyId ?? studyStrategyId;
    setBusy(`Official Yahoo · ${GOLD_STRATEGIES[sid].badge}…`);
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/backtest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: studyFromDate,
          toDate: studyToDate,
          strategyId: sid,
        }),
      });
      const data = (await res.json()) as GoldBacktestResult | { ok: false; error?: string };
      if (!res.ok || !('tradeCount' in data)) {
        throw new Error(('error' in data && data.error) || 'Study failed');
      }
      setBt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Study failed');
    } finally {
      setBusy('');
    }
  }

  async function generateDetailedReport(strategyId: GoldStrategyId) {
    if (studyFromDate > studyToDate) {
      setError('Start date must be on or before end date');
      return;
    }
    setBusy(`Detailed trades · ${GOLD_STRATEGIES[strategyId].badge}…`);
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/study-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_detailed',
          strategyId,
          fromDate: studyFromDate,
          toDate: studyToDate,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        report?: GoldStudyReportMeta;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.report) throw new Error(data.error || 'Detailed report failed');
      setViewer(data.report);
      await loadStudyList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detailed report failed');
    } finally {
      setBusy('');
    }
  }

  async function generateRangeStudy(strategyId?: GoldStrategyId) {
    const sid = strategyId ?? studyStrategyId;
    if (studyFromDate > studyToDate) {
      setError('Start date must be on or before end date');
      return;
    }
    setBusy(`Study report · ${GOLD_STRATEGIES[sid].badge} ${studyFromDate} → ${studyToDate}…`);
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/study-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          fromDate: studyFromDate,
          toDate: studyToDate,
          strategyId: sid,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        report?: GoldStudyReportMeta;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.report) throw new Error(data.error || 'Study report failed');
      setViewer(data.report);
      await loadStudyList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Study report failed');
    } finally {
      setBusy('');
    }
  }

  async function fillFullYahooWindow() {
    setBusy('Loading Yahoo window…');
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/backtest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json()) as GoldBacktestResult | { ok: false; error?: string };
      if (!res.ok || !('from' in data) || !data.from || !data.to) {
        throw new Error(('error' in data && data.error) || 'Could not read Yahoo window');
      }
      setStudyFromDate(data.from.slice(0, 10));
      setStudyToDate(data.to.slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load window failed');
    } finally {
      setBusy('');
    }
  }

  async function openStudy(d: string) {
    setBusy('Opening…');
    setError('');
    try {
      const res = await fetch(`/api/gold-pulse/study-report?date=${d}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        report?: GoldStudyReportMeta;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.report) throw new Error(data.error || 'Not found');
      setViewer(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open failed');
    } finally {
      setBusy('');
    }
  }

  async function removeStudy(d: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Remove GoldPulse study report for ${d}?`)
    ) {
      return;
    }
    setBusy(`Removing ${d}…`);
    setError('');
    try {
      const res = await fetch('/api/gold-pulse/study-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', date: d }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Remove failed');
      if (viewer?.date === d) setViewer(null);
      await loadStudyList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
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
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Separate agent · Yahoo {GOLD_YAHOO_SYMBOL} · LOCKED desk
          </p>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold text-sky-deep">
            <Coins className="h-6 w-6 text-amber-600" />
            {GOLD_PULSE_NAME}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-sky-ink/65">
            Two Yahoo strategies on {GOLD_UT_ENTRY.tf}+{GOLD_UT_HTF.tf}:{' '}
            <strong>v12 Max</strong> (UTC 7–21) and <strong>Sweep peak</strong> (24h). Enable one for
            paper only; study and detailed reports are per strategy.
          </p>
          {paperStrategyId && (
            <p className="mt-1 text-[12px] font-semibold text-emerald-800">
              Paper active: {GOLD_STRATEGIES[paperStrategyId].title}
            </p>
          )}
          <p className="mt-1 text-[11px] text-sky-ink/45">v{GOLD_PULSE_VERSION} · paper only</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runBacktest()}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-bold text-amber-900 disabled:opacity-50"
          >
            {busy.includes('Official') ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Official study
          </button>
          <button
            type="button"
            onClick={() => void clearPaper()}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[12px] font-bold text-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Clear paper
          </button>
          {!polling ? (
            <button
              type="button"
              onClick={() => void startDesk()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {busy.includes('Starting') ? (
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

      <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sky-deep">Paper strategies (GoldPulse only)</h2>
        <p className="mt-1 text-[11px] text-sky-ink/55">
          Enable exactly one strategy for live paper polling. Disabling stops new entries; open trades
          still manage exits.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(Object.keys(GOLD_STRATEGIES) as GoldStrategyId[]).map((id) => {
            const s = GOLD_STRATEGIES[id];
            const active = paperStrategyId === id;
            return (
              <article
                key={id}
                className={`rounded-xl border p-4 ${
                  active ? 'border-emerald-400 bg-emerald-50/50' : 'border-sky-100 bg-sky-50/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-bold text-sky-deep">{s.title}</p>
                    <p className="mt-1 text-[11px] text-sky-ink/60">{s.description}</p>
                  </div>
                  <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    {s.badge}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {active ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void setPaperStrategy(id, false)}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Disable paper
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(busy) || (paperStrategyId != null && !active)}
                      onClick={() => void setPaperStrategy(id, true)}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Enable paper
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void generateDetailedReport(id)}
                    className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-800 disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Detailed report (dates below)
                  </button>
                </div>
                {paperStrategyId != null && !active && (
                  <p className="mt-2 text-[10px] text-sky-ink/45">
                    Disable {GOLD_STRATEGIES[paperStrategyId].badge} first to switch.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sky-deep">Study report (Yahoo replay)</h2>
        <p className="mt-1 text-[11px] text-sky-ink/55">
          Pick <strong>start</strong> and <strong>end</strong> dates (UTC). Trades count when the{' '}
          <strong>open</strong> time falls in that range. Choose strategy for summary reports below.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(GOLD_STRATEGIES) as GoldStrategyId[]).map((id) => (
            <button
              key={`study-${id}`}
              type="button"
              onClick={() => setStudyStrategyId(id)}
              className={`rounded-lg px-3 py-1 text-[11px] font-bold ${
                studyStrategyId === id
                  ? 'bg-sky-deep text-white'
                  : 'border border-sky-200 bg-white text-sky-deep'
              }`}
            >
              {GOLD_STRATEGIES[id].badge}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-sky-ink/70">
            <div className="mb-1 font-semibold text-sky-deep">Start date (UTC)</div>
            <input
              type="date"
              value={studyFromDate}
              onChange={(e) => setStudyFromDate(e.target.value)}
              className="rounded-lg border border-sky-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-[12px] text-sky-ink/70">
            <div className="mb-1 font-semibold text-sky-deep">End date (UTC)</div>
            <input
              type="date"
              value={studyToDate}
              onChange={(e) => setStudyToDate(e.target.value)}
              className="rounded-lg border border-sky-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void fillFullYahooWindow()}
            className="inline-flex min-h-[36px] items-center rounded-xl border border-sky-200 bg-white px-3 py-2 text-[11px] font-bold text-sky-deep disabled:opacity-50"
          >
            Use full Yahoo window
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void generateRangeStudy()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            Create study report ({GOLD_STRATEGIES[studyStrategyId].badge})
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {studyReports.length === 0 ? (
            <p className="text-[12px] text-sky-ink/50">No saved reports yet.</p>
          ) : (
            studyReports.map((r) => (
              <article
                key={r.date}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-bold text-sky-deep">{reportListLabel(r)}</p>
                  <p className="text-[11px] text-sky-ink/55">
                    {r.summary.tradeCount} trades · W {r.summary.wins}/L {r.summary.losses} · Net{' '}
                    {fmtUsd(r.summary.netAfterCost)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void openStudy(r.date)}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void removeStudy(r.date)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {bt && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-sky-deep">
                Official Yahoo study · {bt.entryTf} + {bt.htfTf} ({bt.symbol})
              </h2>
              <p className="mt-1 text-[11px] text-sky-ink/55">{bt.note}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void runBacktest()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 disabled:opacity-50"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Re-run
              </button>
              <button
                type="button"
                onClick={() => setBt(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear results
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-sky-ink/45">
            Range: {studyFromDate} → {studyToDate} (UTC open days) · Bars: {bt.barsEntry} ×{' '}
            {bt.entryTf} · {bt.barsHtf} × {bt.htfTf}
            {bt.from && bt.to
              ? ` · trade window ${new Date(bt.from).toISOString().slice(0, 10)} → ${new Date(bt.to)
                  .toISOString()
                  .slice(0, 10)}`
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
                {bt.trades
                  .slice(-40)
                  .reverse()
                  .map((t) => (
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
              <th className="px-3 py-2">Strategy</th>
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
                <td colSpan={7} className="px-3 py-4 text-sky-ink/45">
                  No closed paper trades yet.
                </td>
              </tr>
            ) : (
              [...closed].reverse().map((t) => (
                <tr key={t.id} className="border-t border-sky-50">
                  <td className="px-3 py-2 text-[11px] text-sky-ink/55">
                    {strategyBadge(t.strategyId) ?? '—'}
                  </td>
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
        <h2 className="text-sm font-bold text-sky-deep">Agent notes</h2>
        <ul className="mt-2 space-y-1">
          {rules.map((line) => (
            <li key={line} className="text-[12px] text-sky-ink/70">
              · {line}
            </li>
          ))}
        </ul>
        {(Object.keys(GOLD_STRATEGIES) as GoldStrategyId[]).map((id) => (
          <div key={`rules-${id}`} className="mt-4">
            <h3 className="text-[12px] font-bold text-amber-900">{GOLD_STRATEGIES[id].badge}</h3>
            <ul className="mt-1 space-y-1">
              {goldStrategySummaryLines(id).map((line) => (
                <li key={`${id}-${line}`} className="text-[11px] text-sky-ink/65">
                  · {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 border-b border-sky-100 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                GoldPulse Yahoo study
              </p>
              <h2 className="text-base font-bold text-sky-deep">{viewer.title}</h2>
              {viewer.strategyId && (
                <p className="text-[11px] font-semibold text-amber-800">
                  {GOLD_STRATEGIES[viewer.strategyId]?.title}
                </p>
              )}
              {viewer.studyRange && (
                <p className="text-[11px] text-sky-ink/55">
                  UTC open days: {viewer.studyRange.from} → {viewer.studyRange.to}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (viewer.studyRange) {
                    setStudyFromDate(viewer.studyRange.from);
                    setStudyToDate(viewer.studyRange.to);
                    if (viewer.strategyId) setStudyStrategyId(viewer.strategyId);
                    if (viewer.reportKind === 'detailed_strategy' && viewer.strategyId) {
                      void generateDetailedReport(viewer.strategyId);
                    } else {
                      void generateRangeStudy(viewer.strategyId);
                    }
                  } else {
                    void openStudy(viewer.date);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 disabled:opacity-50"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Re-run
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void removeStudy(viewer.date)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete report
              </button>
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-deep"
              >
                Clear view
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setViewer(null)}
                className="rounded-lg bg-sky-deep p-2 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-[12px] text-sky-ink/55">
              <span className="font-semibold text-amber-800">Yahoo study replay · </span>
              {viewer.summary.tradeCount} trades · W {viewer.summary.wins} / L{' '}
              {viewer.summary.losses} · Gross {fmtUsd(viewer.summary.gross)} · Cost $
              {viewer.summary.brokerage.toFixed(0)} · Net {fmtUsd(viewer.summary.netAfterCost)}
            </p>
            <SectionBlock title="1. What happened" lines={viewer.sections.opening} />
            <SectionBlock title="2. Market / rules" lines={viewer.sections.market} />
            <SectionBlock title="3. Overall calculation" lines={viewer.sections.calc} />
            {viewer.sections.tradeBlocks.length ? (
              <div className="mt-4">
                <h3 className="text-[13px] font-bold text-sky-deep">4. Each trade</h3>
                <div className="mt-2 space-y-3">
                  {viewer.sections.tradeBlocks.map((block, i) => (
                    <div
                      key={`tb-${i}`}
                      className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"
                    >
                      {block.map((line, j) => (
                        <p
                          key={`tb-${i}-${j}`}
                          className={`text-[12px] leading-relaxed ${
                            j === 0 ? 'font-bold text-sky-deep' : 'text-sky-ink/75'
                          }`}
                        >
                          {j === 0 ? line : `· ${line}`}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <SectionBlock title="5. Summary" lines={viewer.sections.deskSummary} />
            <SectionBlock title="6. Suggestions" lines={viewer.sections.suggestions} />
            {viewer.dailyDetails?.length ? (
              <div className="mt-6">
                <h3 className="text-[13px] font-bold text-sky-deep">Daily trade detail</h3>
                <div className="mt-3 space-y-4">
                  {viewer.dailyDetails.map((day) => (
                    <div key={day.date} className="rounded-xl border border-sky-100 bg-white p-3">
                      <p className="text-[12px] font-bold text-sky-deep">
                        {day.date} · {day.tradeCount} trade(s) · Net {fmtUsd(day.dayNet)}
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-left text-[11px]">
                          <thead className="text-[10px] uppercase text-sky-ink/50">
                            <tr>
                              <th className="px-2 py-1">#</th>
                              <th className="px-2 py-1">Side</th>
                              <th className="px-2 py-1">Open → Close (UTC)</th>
                              <th className="px-2 py-1">Prices</th>
                              <th className="px-2 py-1">Exit</th>
                              <th className="px-2 py-1">MFE/MAE</th>
                              <th className="px-2 py-1">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {day.trades.map((t) => (
                              <tr key={`${day.date}-${t.id}`} className="border-t border-sky-50">
                                <td className="px-2 py-1">{t.id}</td>
                                <td className="px-2 py-1 font-semibold">{t.side}</td>
                                <td className="px-2 py-1 whitespace-nowrap">
                                  {utcTime(t.openUtc)} → {utcTime(t.closeUtc)}
                                </td>
                                <td className="px-2 py-1">
                                  {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                                </td>
                                <td className="px-2 py-1">{t.exitLabel}</td>
                                <td className="px-2 py-1">
                                  +{t.mfe.toFixed(1)} / -{t.mae.toFixed(1)}
                                </td>
                                <td className={`px-2 py-1 font-bold ${pnlClass(t.netPnl)}`}>
                                  {fmtUsd(t.netPnl)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
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
  const cost = t.strategyId ? goldStrategyParams(t.strategyId).roundTripCostUsd : 5;
  const net = gross - cost;
  return (
    <li className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-sky-deep">
          {strategyBadge(t.strategyId) ? `${strategyBadge(t.strategyId)} · ` : ''}
          {t.side} {t.symbol} @ {t.entryPrice.toFixed(2)}
        </p>
        <p className={`text-[13px] font-bold ${pnlClass(net)}`}>{fmtUsd(net)} live</p>
      </div>
      <p className="mt-1 text-[11px] text-sky-ink/60">
        Mark {t.markPrice.toFixed(2)} · SL {t.stopLoss.toFixed(2)} · Hi/Lo {t.highPrice.toFixed(2)}/
        {t.lowPrice.toFixed(2)} · MFE +{t.maxFavorableUsd.toFixed(1)} MAE -
        {t.maxAdverseUsd.toFixed(1)}
      </p>
    </li>
  );
}
