'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Loader2, Play, ShieldCheck, Square } from 'lucide-react';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import {
  assessFastScalpReadiness,
  buildOneMinuteCandles,
  detectCriticalBreaks,
  detectFastScalpScenarios,
  estimatedNetOptionPoints,
  isExpiryObservationDay,
  mapLevelsWithPriorContext,
  observationCutoffReached,
  replayBreakEvents,
  summarizeMovement,
  updateBreakEvents,
  type AtmBreakEvent,
  type AtmMovementInit,
  type AtmMovementSample,
  type CriticalLevel,
  type FastScalpReadiness,
} from '@/lib/blink-atm-movement';
import {
  buildAtmBlinkBrief,
  type AtmBlinkBrief,
} from '@/lib/blink-atm-blink-brief';
import { splitTodayCandles } from '@/lib/blink-atm-trader-context';

type ApiResult = {
  ok: boolean;
  sample?: AtmMovementSample;
  latencyMs?: number;
  error?: string;
  saved?: number;
};

type LabLinkStatus = 'idle' | 'open' | 'live' | 'offline' | 'closed';

type LocalAtmBackup = {
  date: string;
  keys: AtmMovementInit['keys'];
  strike: number;
  runId?: string;
  samples: AtmMovementSample[];
  pending: AtmMovementSample[];
  events: AtmBreakEvent[];
  savedAt: string;
  summary: ReturnType<typeof summarizeMovement>;
};

const LOCAL_BACKUP_KEY = 'tradepinax.atm-lab.backup';

function notifyLab(title: string, body: string) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
    } else if (Notification.permission === 'default') {
      void Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title, { body });
      });
    }
  } catch {
    /* notifications are optional */
  }
}

function writeLocalBackup(backup: LocalAtmBackup) {
  try {
    // Keep last 4k samples in browser so a crash does not wipe the morning.
    const slim: LocalAtmBackup = {
      ...backup,
      samples: backup.samples.slice(-4000),
      pending: backup.pending.slice(-1500),
      events: backup.events.slice(-500),
    };
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(slim));
  } catch {
    /* quota / private mode */
  }
}

function readLocalBackup(): LocalAtmBackup | null {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalAtmBackup;
  } catch {
    return null;
  }
}

export function BlinkAtmMovementLab() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    'Ready. Start observation — OPEN/LIVE/OFFLINE status will notify clearly.'
  );
  const [linkStatus, setLinkStatus] = useState<LabLinkStatus>('idle');
  const [lastBeatAt, setLastBeatAt] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [session, setSession] = useState<AtmMovementInit | null>(null);
  const [samples, setSamples] = useState<AtmMovementSample[]>([]);
  const [levels, setLevels] = useState<CriticalLevel[]>([]);
  const [events, setEvents] = useState<AtmBreakEvent[]>([]);

  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef<AtmMovementInit | null>(null);
  const samplesRef = useRef<AtmMovementSample[]>([]);
  const levelsRef = useRef<CriticalLevel[]>([]);
  const eventsRef = useRef<AtmBreakEvent[]>([]);
  const saveQueueRef = useRef<AtmMovementSample[]>([]);
  const savingRef = useRef(false);
  const fetchFailRef = useRef(0);
  const wasOfflineRef = useRef(false);
  const linkStatusRef = useRef<LabLinkStatus>('idle');
  const savedCountRef = useRef(0);

  const latest = samples[samples.length - 1] ?? null;
  const minuteBars = useMemo(() => buildOneMinuteCandles(samples), [samples]);
  const summary = useMemo(() => summarizeMovement(events), [events]);
  const blinkBrief = useMemo(
    () =>
      buildAtmBlinkBrief(
        samples,
        levels,
        session?.candles ?? [],
        session?.traderContext ?? null
      ),
    [samples, levels, session?.candles, session?.traderContext]
  );
  const ceReadiness = useMemo(
    () => (latest ? assessFastScalpReadiness(latest, 'CE') : null),
    [latest]
  );
  const peReadiness = useMemo(
    () => (latest ? assessFastScalpReadiness(latest, 'PE') : null),
    [latest]
  );
  const expiryDay = session
    ? session.rolledFromExpiryDay ||
      isExpiryObservationDay(session.date, session.contracts.ce.expiry)
    : false;

  function setLink(next: LabLinkStatus, message?: string) {
    linkStatusRef.current = next;
    setLinkStatus(next);
    if (message) setNotice(message);
  }

  function snapshotBackup(extraPending: AtmMovementSample[] = []) {
    const active = sessionRef.current;
    if (!active) return;
    const pending = [...saveQueueRef.current, ...extraPending];
    writeLocalBackup({
      date: active.date,
      keys: active.keys,
      strike: active.contracts.ce.strike,
      runId: active.sample.runId,
      samples: samplesRef.current,
      pending,
      events: eventsRef.current,
      savedAt: new Date().toISOString(),
      summary: summarizeMovement(eventsRef.current),
    });
  }

  async function callApi(body: object): Promise<ApiResult & Partial<AtmMovementInit>> {
    const token = getUpstoxAccessToken();
    if (!token) throw new Error('Reconnect Upstox before starting observation.');
    let res: Response;
    try {
      res = await fetch('/api/blink/atm-movement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(
        'LOCAL SERVER OFFLINE (Failed to fetch). In Cursor: open Terminal → run npm run live → leave that tab open.'
      );
    }
    const data = (await res.json()) as ApiResult & Partial<AtmMovementInit>;
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `ATM Movement Lab request failed (${res.status})`);
    }
    return data;
  }

  async function flushSamples(reason = 'periodic') {
    if (savingRef.current || !saveQueueRef.current.length) {
      snapshotBackup();
      return;
    }
    const active = sessionRef.current;
    if (!active) return;
    const batch = saveQueueRef.current.splice(0, 300);
    savingRef.current = true;
    snapshotBackup();
    try {
      const result = await callApi({
        action: 'save',
        date: active.date,
        samples: batch,
      });
      const n = result.saved ?? batch.length;
      savedCountRef.current += n;
      setSavedCount(savedCountRef.current);
      snapshotBackup();
      if (reason !== 'periodic') {
        setNotice(`Saved ${n} samples (${reason}). Total saved this run: ${savedCountRef.current}.`);
      }
    } catch (err) {
      // Keep data — put batch back and rely on browser backup until server returns.
      saveQueueRef.current.unshift(...batch);
      snapshotBackup();
      setError(err instanceof Error ? err.message : 'Could not save samples');
    } finally {
      savingRef.current = false;
    }
  }

  async function flushPendingFromBackup() {
    const backup = readLocalBackup();
    const active = sessionRef.current;
    if (!backup?.pending?.length || !active) return 0;
    if (
      backup.date !== active.date ||
      backup.keys.ce !== active.keys.ce ||
      backup.keys.pe !== active.keys.pe
    ) {
      return 0;
    }
    // Merge any leftover pending into the live queue (dedupe by timestamp).
    const seen = new Set(saveQueueRef.current.map((s) => s.at));
    for (const sample of backup.pending) {
      if (!seen.has(sample.at)) {
        saveQueueRef.current.push(sample);
        seen.add(sample.at);
      }
    }
    await flushSamples('resume-after-offline');
    return backup.pending.length;
  }

  function applySample(sample: AtmMovementSample) {
    const previous = samplesRef.current[samplesRef.current.length - 1];
    let nextEvents = updateBreakEvents(eventsRef.current, sample);
    if (previous) {
      nextEvents = [
        ...nextEvents,
        ...detectCriticalBreaks(previous, sample, levelsRef.current, nextEvents),
        ...detectFastScalpScenarios(
          previous,
          sample,
          levelsRef.current,
          nextEvents
        ),
      ];
    }
    eventsRef.current = nextEvents;
    setEvents(nextEvents);

    const nextSamples = [...samplesRef.current, sample].slice(-10000);
    samplesRef.current = nextSamples;
    setSamples(nextSamples);
    saveQueueRef.current.push(sample);
    setLastBeatAt(sample.at);
    snapshotBackup();
    if (saveQueueRef.current.length >= 10) void flushSamples('batch');
  }

  async function handleOffline(message: string) {
    fetchFailRef.current += 1;
    wasOfflineRef.current = true;
    snapshotBackup();
    // Try one emergency server save; if it fails, browser backup already holds results.
    await flushSamples('emergency-offline');
    setError(message);
    setLink(
      'offline',
      `ATM LAB OFFLINE — previous results saved locally (${samplesRef.current.length} samples, ${eventsRef.current.length} events). Auto-retry ${fetchFailRef.current}…`
    );
    if (fetchFailRef.current === 1 || fetchFailRef.current % 5 === 0) {
      notifyLab(
        'ATM Lab OFFLINE',
        `Saved ${samplesRef.current.length} samples locally. Waiting for server…`
      );
    }
  }

  async function handleOnlineAgain() {
    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;
    const pending = await flushPendingFromBackup();
    setLink(
      'live',
      `ATM LAB BACK ONLINE — restored/continued. Flushed ${pending} pending samples. Saving continues.`
    );
    notifyLab(
      'ATM Lab OPEN again',
      `Back online. Continued from saved results (${samplesRef.current.length} samples).`
    );
  }

  async function poll() {
    const active = sessionRef.current;
    if (!runningRef.current || !active) return;
    if (observationCutoffReached(new Date().toISOString())) {
      runningRef.current = false;
      setRunning(false);
      await flushSamples('session-cutoff');
      snapshotBackup();
      setLink('closed', 'ATM LAB CLOSED — 15:15 IST cutoff. All queued samples flushed.');
      notifyLab('ATM Lab CLOSED', 'Stopped at 15:15 IST. Results saved.');
      return;
    }

    try {
      const result = await callApi({
        action: 'sample',
        keys: active.keys,
        runId: active.sample.runId,
        strike: active.contracts.ce.strike,
      });
      if (result.sample) {
        applySample({ ...result.sample, latencyMs: result.latencyMs });
        setError('');
        fetchFailRef.current = 0;
        if (linkStatusRef.current !== 'live') {
          await handleOnlineAgain();
          setLink('live');
        } else {
          setLinkStatus('live');
          linkStatusRef.current = 'live';
        }
      }
      if (runningRef.current) {
        timerRef.current = window.setTimeout(() => void poll(), 1000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Live sample failed';
      const offline = message.includes('LOCAL SERVER OFFLINE');
      if (offline) await handleOffline(message);
      else {
        setError(message);
        snapshotBackup();
      }
      if (!runningRef.current) return;
      timerRef.current = window.setTimeout(
        () => void poll(),
        offline ? Math.min(10000, 2000 * Math.max(1, fetchFailRef.current)) : 1000
      );
    }
  }

  async function start() {
    if (runningRef.current || loading) return;
    setLoading(true);
    setError('');
    setLink('open', 'ATM LAB OPENING — locking ATM + loading prior 3 sessions…');
    try {
      const data = (await callApi({ action: 'init' })) as AtmMovementInit;
      if (!data.ok) {
        throw new Error(data.error || 'Initialization failed');
      }
      if (observationCutoffReached(data.sample.at)) {
        throw new Error('Observation cutoff reached (15:15 IST). Start next session.');
      }

      const { today } = splitTodayCandles(data.candles || [], data.date);
      const frozenLevels = mapLevelsWithPriorContext(
        today.length ? today : data.candles || [],
        data.traderContext
      );

      const local = readLocalBackup();
      const localMatches =
        local &&
        local.date === data.date &&
        local.keys.ce === data.keys.ce &&
        local.keys.pe === data.keys.pe
          ? local
          : null;

      const restored = [
        ...(data.savedSamples || []),
        ...(localMatches?.samples || []),
      ].filter(
        (sample) =>
          sample.ceKey === data.keys.ce &&
          sample.peKey === data.keys.pe &&
          Number.isFinite(sample.nifty) &&
          Number.isFinite(sample.ce) &&
          Number.isFinite(sample.pe) &&
          sample.nifty > 10000 &&
          sample.ce > 0 &&
          sample.ce < 5000 &&
          sample.pe > 0 &&
          sample.pe < 5000 &&
          Math.abs(sample.nifty - data.sample.nifty) < 1000
      );
      const initialSamples = [...restored, data.sample]
        .sort((a, b) => a.at.localeCompare(b.at))
        .filter((sample, index, all) => index === 0 || sample.at !== all[index - 1].at);
      const restoredEvents = replayBreakEvents(initialSamples, frozenLevels);

      sessionRef.current = data;
      samplesRef.current = initialSamples;
      levelsRef.current = frozenLevels;
      eventsRef.current = restoredEvents;
      saveQueueRef.current = [
        ...(localMatches?.pending || []),
        data.sample,
      ];
      fetchFailRef.current = 0;
      wasOfflineRef.current = false;
      savedCountRef.current = 0;
      setSavedCount(0);
      setSession(data);
      setSamples(initialSamples);
      setLevels(frozenLevels);
      setEvents(restoredEvents);
      setLastBeatAt(data.sample.at);
      runningRef.current = true;
      setRunning(true);
      snapshotBackup();
      await flushSamples('open');

      const days = data.traderContext?.priorDays?.length ?? 0;
      setLink(
        'live',
        `ATM LAB OPEN · LIVE — ${data.contracts.ce.strike} CE/PE · restored ${initialSamples.length} samples (${localMatches ? 'server+browser' : 'server'}) · ${days} prior sessions`
      );
      notifyLab(
        'ATM Lab OPEN',
        `Watching ${data.contracts.ce.strike} CE/PE. Restored ${initialSamples.length} samples.`
      );
      timerRef.current = window.setTimeout(() => void poll(), 1000);
    } catch (err) {
      setLink('closed');
      setError(err instanceof Error ? err.message : 'Could not start observation');
      notifyLab('ATM Lab failed to open', err instanceof Error ? err.message : 'Start failed');
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setLink('closed', 'ATM LAB CLOSING — flushing and saving all results…');
    await flushSamples('manual-stop');
    snapshotBackup();
    setLink(
      'closed',
      `ATM LAB CLOSED — saved. Samples in memory ${samplesRef.current.length}, events ${eventsRef.current.length}, flushed this run ${savedCountRef.current}.`
    );
    notifyLab(
      'ATM Lab CLOSED',
      `Saved session. ${samplesRef.current.length} samples / ${eventsRef.current.length} events kept.`
    );
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
    const onHide = () => {
      if (!runningRef.current) return;
      snapshotBackup();
      void flushSamples('tab-hidden');
    };
    const onUnload = () => {
      snapshotBackup();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      runningRef.current = false;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      snapshotBackup();
      void flushSamples('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="mt-6 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600" />
            <h2 className="font-display text-[16px] font-semibold text-sky-ink">
              ATM Movement Lab
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-sky-ink/55">
            One-second Nifty + ATM CE/PE watch · Blink decides STALK/PREPARE before the move.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={linkStatus} lastBeatAt={lastBeatAt} savedCount={savedCount} />
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
            OBSERVATION ONLY — NO ORDERS
          </div>
        </div>
      </div>

      {linkStatus === 'offline' ? (
        <div className="mt-3 rounded-xl border border-rose-400 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-950">
          ATM LAB OFFLINE — previous results are saved in browser + disk queue.
          When the server returns, saving continues automatically from where it stopped.
        </div>
      ) : null}
      {linkStatus === 'open' || linkStatus === 'live' ? (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-950">
          ATM LAB {linkStatus.toUpperCase()} — heartbeat{' '}
          {lastBeatAt ? new Date(lastBeatAt).toLocaleTimeString('en-IN') : '…'} · samples{' '}
          {samples.length} · events {events.length} · flushed {savedCount}
        </div>
      ) : null}
      {linkStatus === 'closed' ? (
        <div className="mt-3 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-800">
          ATM LAB CLOSED — results kept. Start again to restore and continue saving.
        </div>
      ) : null}

      {session ? (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${
            expiryDay
              ? 'border-amber-300 bg-amber-50 text-amber-950'
              : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          <strong>
            {session.rolledFromExpiryDay
              ? 'EXPIRY DAY · NEXT-WEEK ATM LOCKED'
              : expiryDay
                ? 'EXPIRY DAY WATCH'
                : `Expiry ${session.contracts.ce.expiry}`}
          </strong>
          {' · '}
          Watching levels, EMA/RSI, compression, option-lead tape and chart patterns.
          Blink prepares CE/PE <em>before</em> the break — confirmation still required.
          {session.rolledFromExpiryDay
            ? ` Avoiding the expiring contract’s severe same-day theta. Watching ${session.contracts.ce.expiry}; lower gamma may make +5/+7 slower.`
            : expiryDay
              ? ' Premium decay and gamma can reverse quotes abruptly; movement is not proof of a fill.'
            : ''}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={loading || running}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Start observation
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={!running}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-40"
        >
          <Square className="h-4 w-4" />
          Stop
        </button>
        <span
          className={`self-center text-[12px] font-semibold ${
            linkStatus === 'live'
              ? 'text-emerald-600'
              : linkStatus === 'offline'
                ? 'text-rose-600'
                : linkStatus === 'open'
                  ? 'text-amber-600'
                  : 'text-sky-ink/45'
          }`}
        >
          {linkStatus === 'live'
            ? '● LIVE'
            : linkStatus === 'offline'
              ? '● OFFLINE (auto-save on)'
              : linkStatus === 'open'
                ? '● OPENING'
                : linkStatus === 'closed'
                  ? '○ CLOSED'
                  : '○ STOPPED'}
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-sky-ink/55">{notice}</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <PriceCard label="Nifty" value={latest?.nifty} hint={`${minuteBars.length} observed 1m bars`} />
        <PriceCard
          label={`ATM ${session?.contracts.ce.strike ?? '—'} CE`}
          value={latest?.ce}
          hint={`Spread ${latest?.ceSpread?.toFixed(2) ?? '—'}`}
        />
        <PriceCard
          label={`ATM ${session?.contracts.pe.strike ?? '—'} PE`}
          value={latest?.pe}
          hint={`Spread ${latest?.peSpread?.toFixed(2) ?? '—'} · latency ${latest?.latencyMs ?? '—'}ms`}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <GreekWatch
          option="CE"
          greek={latest?.ceGreeks}
          readiness={ceReadiness}
        />
        <GreekWatch
          option="PE"
          greek={latest?.peGreeks}
          readiness={peReadiness}
        />
      </div>

      <BlinkDecisionPanel brief={blinkBrief} />

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        <Metric label="All scenarios" value={String(summary.events)} />
        <Metric label="+5 captured" value={`${summary.hit5}/${summary.events} · ${summary.hit5Rate}%`} />
        <Metric label="+7 captured" value={`${summary.hit7}/${summary.events} · ${summary.hit7Rate}%`} />
        <Metric label="+8 captured" value={`${summary.hit8}/${summary.events} · ${summary.hit8Rate}%`} />
        <Metric label="Avg MFE / MAE" value={`${summary.avgMfe} / ${summary.avgMae} pts`} />
      </div>

      <div className="mt-4 rounded-xl border border-[#dbe8f2] bg-sky-soft/30 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-ink/50">
          Frozen critical levels
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {levels.length ? levels.map((level) => (
            <span key={`${level.kind}-${level.price}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink">
              {level.kind.replace('_', ' ')} {level.price.toFixed(1)}
            </span>
          )) : <span className="text-[11px] text-sky-ink/45">Start to map today’s OR/session/swing levels.</span>}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-ink/50">
          Latest scenario outcomes · gross versus estimated net
        </p>
        {events.length ? (
          <div className="mt-2 space-y-2">
            {[...events].reverse().slice(0, 8).map((event) => {
              const lot = event.option === 'CE'
                ? session?.contracts.ce.lotSize ?? 1
                : session?.contracts.pe.lotSize ?? 1;
              return (
                <div key={event.id} className="rounded-xl border border-[#dbe8f2] px-3 py-2 text-[11px] text-sky-ink/75">
                  <p className="font-semibold text-sky-ink">
                    {event.option} · {event.scenario.replaceAll('_', ' ')} ·{' '}
                    {event.kind.replaceAll('_', ' ')} @ {event.level.toFixed(1)}
                  </p>
                  <p className="mt-1">
                    MFE {event.maxFavorableOptionPts.toFixed(2)} · estimated net{' '}
                    {estimatedNetOptionPoints(event.maxFavorableOptionPts, lot).toFixed(2)} · MAE{' '}
                    {event.maxAdverseOptionPts.toFixed(2)} · Nifty MFE {event.maxFavorableNiftyPts.toFixed(1)}
                    {' · '}realized Δ {event.realizedDelta?.toFixed(2) ?? '—'}
                  </p>
                  <p className="mt-0.5 text-sky-ink/50">
                    +5 {formatHit(event.hit5AtMs)} · +7 {formatHit(event.hit7AtMs)} · +8 {formatHit(event.hit8AtMs)} · 5/15/30/60s{' '}
                    {[5, 15, 30, 60].map((s) => event.horizonMoves[s as 5 | 15 | 30 | 60]?.toFixed(2) ?? '…').join(' / ')}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-sky-ink/45">
            No level-break, failed-break, momentum-burst or option-leading scenario has triggered yet.
          </p>
        )}
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-sky-ink/40">
        Estimated net subtracts ₹175/lot round-trip costs plus 0.5 option-point slippage.
        One-second REST quotes cannot verify a millisecond execution. Review 30–50 events across
        normal and expiry sessions before changing strategy. Every persisted sample includes the
        available delta, gamma, theta, IV, OI, spread and latency for later analysis.
      </p>
    </section>
  );
}

function StatusPill({
  status,
  lastBeatAt,
  savedCount,
}: {
  status: LabLinkStatus;
  lastBeatAt: string | null;
  savedCount: number;
}) {
  const tone =
    status === 'live'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : status === 'offline'
        ? 'border-rose-400 bg-rose-50 text-rose-950'
        : status === 'open'
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : status === 'closed'
            ? 'border-slate-300 bg-slate-50 text-slate-800'
            : 'border-sky-200 bg-sky-50 text-sky-900';
  return (
    <div className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${tone}`}>
      {status.toUpperCase()}
      {lastBeatAt ? ` · ${new Date(lastBeatAt).toLocaleTimeString('en-IN')}` : ''}
      {savedCount ? ` · saved ${savedCount}` : ''}
    </div>
  );
}

function BlinkDecisionPanel({ brief }: { brief: AtmBlinkBrief | null }) {
  if (!brief) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-3 py-3 text-[12px] text-violet-900/70">
        Start observation — Blink will analyse Nifty + ATM CE/PE and only prepare before a move, never chase after it.
      </div>
    );
  }

  const tone =
    brief.mode === 'PREPARE_CE'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
      : brief.mode === 'PREPARE_PE'
        ? 'border-rose-300 bg-rose-50 text-rose-950'
        : brief.mode === 'WAIT_CONFIRM'
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : 'border-violet-200 bg-violet-50 text-violet-950';

  return (
    <div className={`mt-4 rounded-xl border px-3 py-3 text-[12px] ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">
            Blink agent · pre-move decision
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-snug">{brief.headline}</p>
        </div>
        <div className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold">
          {brief.mode.replaceAll('_', ' ')} · {brief.bias} · {brief.confidence}%
        </div>
      </div>

      <p className="mt-2 leading-relaxed opacity-90">{brief.thesis}</p>

      {brief.desk || brief.context ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <MiniStat
            label="Desk bias (today)"
            value={
              brief.desk
                ? `${brief.desk.bias} · ${brief.desk.fromOpenPts} pts from open`
                : '—'
            }
          />
          <MiniStat
            label="3-day backdrop"
            value={brief.context?.threeDayTrend ?? '—'}
          />
          <MiniStat
            label="PDH / PDL"
            value={
              brief.context?.pdh != null && brief.context?.pdl != null
                ? `${brief.context.pdh.toFixed(1)} / ${brief.context.pdl.toFixed(1)}`
                : '—'
            }
          />
        </div>
      ) : null}

      {brief.context?.priorDays?.length ? (
        <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-[11px]">
          <p className="text-[9px] font-semibold uppercase tracking-wide opacity-50">
            Prior sessions used
          </p>
          <p className="mt-1 font-medium">
            {brief.context.priorDays
              .map(
                (d) =>
                  `${d.date.slice(5)} ${d.changePts >= 0 ? '+' : ''}${d.changePts}`
              )
              .join(' · ')}
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MiniStat
          label="EMA 9 / 21"
          value={
            brief.indicators.ema9 != null && brief.indicators.ema21 != null
              ? `${brief.indicators.ema9} / ${brief.indicators.ema21}`
              : '—'
          }
        />
        <MiniStat label="RSI 14" value={brief.indicators.rsi?.toFixed(0) ?? '—'} />
        <MiniStat label="Trend" value={brief.indicators.trend} />
        <MiniStat
          label="Nearest level"
          value={
            brief.indicators.nearestLevel
              ? `${brief.indicators.nearestLevel.kind.replaceAll('_', ' ')} ${brief.indicators.nearestLevel.price.toFixed(1)} (${brief.indicators.nearestLevel.distance} pts)`
              : '—'
          }
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Δ Nifty 1s" value={String(brief.tape.niftyDelta1s)} />
        <MiniStat label="Δ CE 1s" value={String(brief.tape.ceDelta1s)} />
        <MiniStat label="Δ PE 1s" value={String(brief.tape.peDelta1s)} />
        <MiniStat
          label="Option lead"
          value={brief.tape.optionLeadsSpot ?? 'none'}
        />
      </div>

      {brief.patterns.length ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">
            Patterns / indicators Blink sees
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-90">
            {brief.patterns.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">
          Must happen first (before any move / idea)
        </p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 font-medium">
          {brief.mustHappenFirst.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 opacity-80">
          <strong>Invalidation:</strong> {brief.invalidation}
        </p>
      </div>

      <div
        className={`mt-3 rounded-lg border px-2.5 py-2 ${
          brief.tradingIdeaPossible
            ? 'border-emerald-400/60 bg-white/70'
            : 'border-black/10 bg-white/50'
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">
          Can we find a trading idea from this data?
        </p>
        <p className="mt-1 font-semibold leading-snug">{brief.ideaVerdict}</p>
        {brief.indicators.compression ? (
          <p className="mt-1 text-[11px] opacity-75">
            Compression flagged — Blink expects a break soon, but will not call direction until acceptance.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide opacity-50">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold">{value}</p>
    </div>
  );
}

function formatHit(ms: number | null) {
  return ms == null ? 'no' : `${(ms / 1000).toFixed(1)}s`;
}

function PriceCard({ label, value, hint }: { label: string; value?: number; hint: string }) {
  return (
    <div className="rounded-xl border border-[#dbe8f2] bg-white px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/40">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-sky-ink">
        {value != null ? value.toFixed(2) : '—'}
      </p>
      <p className="mt-0.5 text-[10px] text-sky-ink/45">{hint}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-violet-50 px-3 py-2">
      <p className="text-[10px] font-semibold text-violet-700/60">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-violet-950">{value}</p>
    </div>
  );
}

function GreekWatch({
  option,
  greek,
  readiness,
}: {
  option: 'CE' | 'PE';
  greek?: AtmMovementSample['ceGreeks'];
  readiness: FastScalpReadiness | null;
}) {
  if (!greek || !readiness) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-900">
        {option} Greeks unavailable—price movement is still recorded.
      </div>
    );
  }
  const tone =
    readiness.label === 'GOOD WATCH'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : readiness.label === 'CAUTION'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-rose-200 bg-rose-50 text-rose-950';
  return (
    <div className={`rounded-xl border px-3 py-3 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <strong>{option} GREEKS WATCH</strong>
        <span className="font-bold">{readiness.label} · {readiness.score}/100</span>
      </div>
      <p className="mt-1">
        Δ {greek.delta.toFixed(3)} · Γ {greek.gamma.toFixed(5)} · Θ {greek.theta.toFixed(2)}
        {' · '}IV {(greek.iv * 100).toFixed(1)}%
      </p>
      <p className="mt-0.5">
        Model: +5 needs ~{readiness.requiredNiftyFor5} Nifty pts · +7 needs ~
        {readiness.requiredNiftyFor7} pts · theta/min ~{readiness.thetaPerTradingMinute}
      </p>
      <p className="mt-0.5 opacity-70">
        OI {greek.oi.toLocaleString('en-IN')} · volume {greek.volume.toLocaleString('en-IN')}
        {' · '}{readiness.reasons.join(', ')}
      </p>
    </div>
  );
}
