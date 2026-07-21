'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  ColorType,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';
import {
  sixMonthOneMinuteRange,
} from '@/lib/upstox-historical';
import type {
  CandleNarrative,
  ProReplayIndexSession,
  ProReplaySession,
} from '@/lib/blink-pro-narrative';

type ReplayIndex = {
  createdAt: string;
  fromDate: string;
  toDate: string;
  source: string;
  sessions: ProReplayIndexSession[];
  summary: {
    totalBars: number;
    tradingDays: number;
    confirmedIdeas: number;
    hit5: number;
    hit7: number;
    hit5Rate: number;
    hit7Rate: number;
  };
};

export function BlinkProReplayPanel() {
  const defaultRange = useMemo(() => sixMonthOneMinuteRange(), []);
  const [replay, setReplay] = useState<ReplayIndex | null>(null);
  const [session, setSession] = useState<ProReplaySession | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [barIndex, setBarIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const narrative = session?.narratives[barIndex] ?? null;

  useEffect(() => {
    void loadIndex();
  }, []);

  useEffect(() => {
    if (!playing || !session) return;
    const timer = window.setInterval(() => {
      setBarIndex((current) => {
        if (current >= session.bars.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 240);
    return () => window.clearInterval(timer);
  }, [playing, session]);

  async function loadIndex() {
    try {
      const response = await fetch('/api/blink/pro-replay');
      const data = (await response.json()) as {
        ok?: boolean;
        replay?: ReplayIndex | null;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || 'Replay load failed');
      if (data.replay?.sessions.length) {
        setReplay(data.replay);
        const latest = data.replay.sessions[data.replay.sessions.length - 1].date;
        setSelectedDate(latest);
        await loadDay(latest);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Replay load failed');
    }
  }

  async function collectSixMonths() {
    setError('');
    setLoading(true);
    setStatus('Collecting six months of Nifty 1m data and replaying every candle…');
    try {
      if (!isUpstoxConnected()) throw new Error('Connect Upstox first.');
      const token = getUpstoxAccessToken();
      if (!token) throw new Error('Upstox token is missing or expired.');
      const response = await fetch('/api/blink/pro-replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromDate: defaultRange.fromDate,
          toDate: defaultRange.toDate,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        replay?: ReplayIndex;
        chunks?: number;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.replay) {
        throw new Error(data.error || 'Six-month replay collection failed');
      }
      setReplay(data.replay);
      const latest = data.replay.sessions[data.replay.sessions.length - 1]?.date;
      if (latest) {
        setSelectedDate(latest);
        await loadDay(latest);
      }
      setStatus(
        `Stored ${data.replay.summary.totalBars.toLocaleString()} candles across ${data.replay.summary.tradingDays} sessions (${data.chunks ?? 0} API chunks).`
      );
    } catch (collectError) {
      setError(
        collectError instanceof Error ? collectError.message : 'Collection failed'
      );
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  async function loadDay(date: string) {
    if (!date) return;
    setPlaying(false);
    setLoadingDay(true);
    setError('');
    try {
      const response = await fetch(
        `/api/blink/pro-replay?date=${encodeURIComponent(date)}`
      );
      const data = (await response.json()) as {
        ok?: boolean;
        session?: ProReplaySession;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.session) {
        throw new Error(data.error || `Failed to load ${date}`);
      }
      setSession(data.session);
      setBarIndex(Math.min(29, data.session.bars.length - 1));
    } catch (dayError) {
      setError(dayError instanceof Error ? dayError.message : 'Day replay failed');
    } finally {
      setLoadingDay(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">
            Blink Pro · no-lookahead chart reader
          </p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-[16px] font-semibold text-sky-ink">
            <BrainCircuit className="h-5 w-5 text-violet-600" />
            Six-month Nifty 1-minute replay
          </h3>
          <p className="mt-1 max-w-3xl text-[12px] text-sky-ink/60">
            Every decision sees only candles already closed at that moment. Blink maps
            structure, location, candle behavior, confirmation and invalidation before
            grading the next five minutes.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void collectSixMonths()}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {replay ? 'Refresh six months' : 'Collect six months'}
        </button>
      </div>

      {status ? (
        <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-[12px] text-violet-900">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          {error}
        </p>
      ) : null}

      {replay ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            <ReplayStat label="1m candles" value={replay.summary.totalBars.toLocaleString()} />
            <ReplayStat label="Sessions" value={String(replay.summary.tradingDays)} />
            <ReplayStat label="Confirmed reads" value={String(replay.summary.confirmedIdeas)} />
            <ReplayStat label="Sim +5" value={`${replay.summary.hit5Rate}%`} />
            <ReplayStat label="Sim +7" value={`${replay.summary.hit7Rate}%`} />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-[11px] font-semibold text-sky-ink/65">
              Trading session
              <select
                value={selectedDate}
                onChange={(event) => {
                  const date = event.target.value;
                  setSelectedDate(date);
                  void loadDay(date);
                }}
                className="mt-1 block rounded-lg border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink"
              >
                {[...replay.sessions].reverse().map((item) => (
                  <option key={item.date} value={item.date}>
                    {item.date} · range {item.rangePts} · {item.confirmedIdeas} reads · {item.hit5} hit +5
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-2 text-[11px] text-sky-ink/50">
              Stored {replay.fromDate} → {replay.toDate}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-5 text-sm text-violet-900">
          No six-month replay is stored yet. Connect Upstox, then collect it once.
        </p>
      )}

      {loadingDay ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-sky-ink/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Building candle narratives…
        </div>
      ) : session && narrative ? (
        <div className="mt-5">
          <ReplayCandleChart session={session} barIndex={barIndex} narrative={narrative} />

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBarIndex((index) => Math.max(0, index - 1))}
              className="rounded-lg border border-[#cfe0ee] p-2 text-sky-ink"
              aria-label="Previous candle"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-deep px-3 py-2 text-xs font-semibold text-white"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? 'Pause' : 'Replay'}
            </button>
            <button
              type="button"
              onClick={() =>
                setBarIndex((index) => Math.min(session.bars.length - 1, index + 1))
              }
              className="rounded-lg border border-[#cfe0ee] p-2 text-sky-ink"
              aria-label="Next candle"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, session.bars.length - 1)}
              value={barIndex}
              onChange={(event) => {
                setPlaying(false);
                setBarIndex(Number(event.target.value));
              }}
              className="min-w-0 flex-1 accent-violet-700"
            />
            <span className="text-[11px] tabular-nums text-sky-ink/55">
              {barIndex + 1}/{session.bars.length}
            </span>
          </div>

          <NarrativeCard narrative={narrative} />

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
            +5/+7 are simulations, not fills: ATM delta is approximated near 0.50 with
            small convexity. Historical CE/PE LTP, spread, slippage and latency are not
            present in Nifty-only data.
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReplayCandleChart({
  session,
  barIndex,
  narrative,
}: {
  session: ProReplaySession;
  barIndex: number;
  narrative: CandleNarrative;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const chart = createChart(element, {
      height: 390,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#476175',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f0f3f7' },
        horzLines: { color: '#f0f3f7' },
      },
      rightPriceScale: { borderColor: '#dbe5ed' },
      timeScale: {
        borderColor: '#dbe5ed',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#059669',
      downColor: '#e11d48',
      borderVisible: false,
      wickUpColor: '#059669',
      wickDownColor: '#e11d48',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const resize = new ResizeObserver(() => {
      if (hostRef.current) chart.applyOptions({ width: hostRef.current.clientWidth });
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const visible = session.bars.slice(0, barIndex + 1);
    const data: CandlestickData[] = visible.map((bar) => ({
      time: Math.floor(new Date(bar.t).getTime() / 1000) as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    series.setData(data);
    series.setMarkers(
      session.narratives
        .slice(0, barIndex + 1)
        .filter((item) => item.stage === 'CONFIRMED' && item.side !== 'FLAT')
        .map((item) => ({
          time: Math.floor(new Date(item.at).getTime() / 1000) as Time,
          position: item.side === 'CE' ? ('belowBar' as const) : ('aboveBar' as const),
          color: item.side === 'CE' ? '#059669' : '#e11d48',
          shape: item.side === 'CE' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: `${item.side} ${item.confidence}`,
        }))
    );
    for (const priceLine of priceLinesRef.current) series.removePriceLine(priceLine);
    priceLinesRef.current = narrative.levels.slice(0, 8).map((level) =>
      series.createPriceLine({
        price: level.price,
        color: level.label.startsWith('P') ? '#7c3aed' : '#64748b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: level.label,
      })
    );
    chart.timeScale().fitContent();
  }, [session, barIndex, narrative]);

  return <div ref={hostRef} className="w-full overflow-hidden rounded-xl border border-[#dbe5ed]" />;
}

function NarrativeCard({ narrative }: { narrative: CandleNarrative }) {
  const tone =
    narrative.stage === 'CONFIRMED'
      ? narrative.side === 'CE'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-rose-200 bg-rose-50'
      : narrative.stage === 'IDEA'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50';
  const time = new Date(narrative.at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className={`mt-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold">
          {time} · {narrative.stage} · {narrative.side}
        </span>
        <span className="text-xs font-semibold">{narrative.confidence}% evidence</span>
        <span className="text-xs">Room {narrative.roomPts} Nifty pts</span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-sky-ink">
        {narrative.story}
      </p>
      <div className="mt-3 grid gap-3 text-[12px] text-sky-ink/75 md:grid-cols-2">
        <NarrativeLine label="Candle" value={narrative.candleShape} />
        <NarrativeLine label="Location" value={narrative.location} />
        <NarrativeLine label="Structure" value={narrative.structure} />
        <NarrativeLine label="Plan" value={narrative.confirmation} />
      </div>
    </div>
  );
}

function NarrativeLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong className="text-sky-ink">{label}:</strong> {value}
    </p>
  );
}

function ReplayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e2eaf0] bg-sky-soft/35 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-sky-ink/45">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-sky-ink">{value}</p>
    </div>
  );
}
