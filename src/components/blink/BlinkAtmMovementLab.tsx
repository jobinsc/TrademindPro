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
  mapCriticalLevels,
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

type ApiResult = {
  ok: boolean;
  sample?: AtmMovementSample;
  latencyMs?: number;
  error?: string;
  saved?: number;
};

export function BlinkAtmMovementLab() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Ready to observe. No order API is used.');
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

  const latest = samples[samples.length - 1] ?? null;
  const minuteBars = useMemo(() => buildOneMinuteCandles(samples), [samples]);
  const summary = useMemo(() => summarizeMovement(events), [events]);
  const ceReadiness = useMemo(
    () => latest ? assessFastScalpReadiness(latest, 'CE') : null,
    [latest]
  );
  const peReadiness = useMemo(
    () => latest ? assessFastScalpReadiness(latest, 'PE') : null,
    [latest]
  );
  const expiryDay = session
    ? session.rolledFromExpiryDay ||
      isExpiryObservationDay(session.date, session.contracts.ce.expiry)
    : false;

  async function callApi(body: object): Promise<ApiResult> {
    const token = getUpstoxAccessToken();
    if (!token) throw new Error('Reconnect Upstox before starting observation.');
    const res = await fetch('/api/blink/atm-movement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as ApiResult;
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `ATM Movement Lab request failed (${res.status})`);
    }
    return data;
  }

  async function flushSamples() {
    if (savingRef.current || !saveQueueRef.current.length) return;
    const active = sessionRef.current;
    if (!active) return;
    const batch = saveQueueRef.current.splice(0, 300);
    savingRef.current = true;
    try {
      await callApi({
        action: 'save',
        date: active.date,
        samples: batch,
      });
      setNotice(`Saved ${batch.length} synchronized samples locally.`);
    } catch (err) {
      saveQueueRef.current.unshift(...batch);
      setError(err instanceof Error ? err.message : 'Could not save samples');
    } finally {
      savingRef.current = false;
    }
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
    if (saveQueueRef.current.length >= 30) void flushSamples();
  }

  async function poll() {
    const active = sessionRef.current;
    if (!runningRef.current || !active) return;
    if (observationCutoffReached(new Date().toISOString())) {
      runningRef.current = false;
      setRunning(false);
      setNotice('Stopped automatically at the 15:15 IST observation cutoff.');
      await flushSamples();
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live sample failed');
    } finally {
      if (runningRef.current) {
        timerRef.current = window.setTimeout(() => void poll(), 1000);
      }
    }
  }

  async function start() {
    if (runningRef.current || loading) return;
    setLoading(true);
    setError('');
    setNotice('Locking current-week ATM CE/PE and loading today’s 1-minute levels…');
    try {
      const token = getUpstoxAccessToken();
      if (!token) throw new Error('Reconnect Upstox before starting observation.');
      const res = await fetch('/api/blink/atm-movement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'init' }),
      });
      const data = (await res.json()) as AtmMovementInit;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Initialization failed (${res.status})`);
      }
      if (observationCutoffReached(data.sample.at)) {
        throw new Error('Observation cutoff reached (15:15 IST). Start next session.');
      }

      const frozenLevels = mapCriticalLevels(data.candles || []);
      const restored = (data.savedSamples || []).filter(
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
      saveQueueRef.current = [data.sample];
      setSession(data);
      setSamples(initialSamples);
      setLevels(frozenLevels);
      setEvents(restoredEvents);
      runningRef.current = true;
      setRunning(true);
      setNotice(
        `Locked ${data.contracts.ce.strike} CE/PE · ${data.expiryMode.replace('_', ' ')} · ${restored.length} prior matching samples restored.`
      );
      timerRef.current = window.setTimeout(() => void poll(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start observation');
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setNotice('Observation stopped. Flushing unsaved samples…');
    await flushSamples();
    setNotice('Observation stopped. Samples are saved; no order was placed.');
  }

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      void flushSamples();
    };
    // Run cleanup only on unmount; refs hold the latest observation state.
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
            One-second synchronized Nifty + locked ATM CE/PE observation.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          OBSERVATION ONLY — NO ORDERS
        </div>
      </div>

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
          Watching level breaks, failed breaks, Nifty momentum bursts and option-leading moves.
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
        <span className={`self-center text-[12px] font-semibold ${running ? 'text-emerald-600' : 'text-sky-ink/45'}`}>
          {running ? '● LIVE PAPER OBSERVER' : '○ STOPPED'}
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
