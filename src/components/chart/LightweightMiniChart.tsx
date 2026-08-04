'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  ColorType,
} from 'lightweight-charts';

type Candle = { t: string; open: number; high: number; low: number; close: number };

type Props = {
  symbol: string;
  exchange?: string;
  width?: number;
  height?: number;
  interval?: string;
  className?: string;
};

const PEEK_DAYS = 3;

function istDateKey(unixSec: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSec * 1000));
}

/** Keep only the last N IST calendar days present in the series. */
function trimToLastDays(bars: CandlestickData[], days: number): CandlestickData[] {
  if (!bars.length || days <= 0) return bars;
  const keysInOrder: string[] = [];
  const seen = new Set<string>();
  for (let i = bars.length - 1; i >= 0; i--) {
    const key = istDateKey(Number(bars[i].time));
    if (!seen.has(key)) {
      seen.add(key);
      keysInOrder.push(key);
      if (keysInOrder.length >= days) break;
    }
  }
  const keep = new Set(keysInOrder);
  return bars.filter((b) => keep.has(istDateKey(Number(b.time))));
}

function dayBoundaryTimes(bars: CandlestickData[]): Time[] {
  const out: Time[] = [];
  let prevKey: string | null = null;
  let prevT: number | null = null;
  for (const b of bars) {
    const t = Number(b.time);
    if (!Number.isFinite(t)) continue;
    const key = istDateKey(t);
    const gapHrs = prevT != null ? (t - prevT) / 3600 : 0;
    if ((prevKey != null && key !== prevKey) || gapHrs >= 6) out.push(b.time);
    prevKey = key;
    prevT = t;
  }
  return out;
}

function buildDayXs(chart: IChartApi, times: Time[]): number[] {
  const ts = chart.timeScale();
  const xs: number[] = [];
  for (const t of times) {
    const x = ts.timeToCoordinate(t);
    if (x == null || !Number.isFinite(x) || x < -2 || x > 10_000) continue;
    xs.push(x);
  }
  return xs;
}

/** Peek chart: last 3 days only, thin day separators (no labels). */
export default function LightweightMiniChart({
  symbol,
  exchange = 'NSE',
  width = 320,
  height = 200,
  interval = '5m',
  className = '',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const dayStartsRef = useRef<Time[]>([]);
  const syncRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [spot, setSpot] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [dayXs, setDayXs] = useState<number[]>([]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width,
      height: height - 28,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#5a7a90',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#eef5fa' },
        horzLines: { color: '#eef5fa' },
      },
      rightPriceScale: { borderColor: '#d5e6f0' },
      timeScale: {
        borderColor: '#d5e6f0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
      },
      crosshair: { mode: 0 },
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

    const syncDayLines = () => {
      if (!chartRef.current) return;
      setDayXs(buildDayXs(chartRef.current, dayStartsRef.current));
    };
    syncRef.current = syncDayLines;
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncDayLines);

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({ width: wrapRef.current.clientWidth });
      syncDayLines();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dayStartsRef.current = [];
      syncRef.current = () => {};
    };
  }, [width, height]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErr('');
    setDayXs([]);

    async function load() {
      try {
        const params = new URLSearchParams({
          symbol,
          exchange,
          interval,
          // Fetch enough raw bars, then trim to 3 IST days client-side
          limit: interval === '1d' ? '10' : '400',
        });
        const res = await fetch(`/api/market/candles?${params}`);
        const data = (await res.json()) as {
          ok?: boolean;
          spot?: number;
          candles?: Candle[];
          error?: string;
        };
        if (cancelled) return;
        if (!data.ok || !data.candles?.length) {
          setStatus('error');
          setErr(data.error || 'No data');
          return;
        }
        const all: CandlestickData[] = data.candles.map((c) => ({
          time: Math.floor(new Date(c.t).getTime() / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const bars =
          interval === '1d' ? all.slice(-PEEK_DAYS) : trimToLastDays(all, PEEK_DAYS);

        dayStartsRef.current = dayBoundaryTimes(bars);
        seriesRef.current?.setData(bars);
        seriesRef.current?.setMarkers([]); // no date labels / markers
        chartRef.current?.timeScale().fitContent();

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) syncRef.current();
          });
        });
        window.setTimeout(() => {
          if (!cancelled) syncRef.current();
        }, 80);

        setSpot(data.spot ?? bars[bars.length - 1]?.close ?? null);
        setStatus('ok');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErr(e instanceof Error ? e.message : 'Failed');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [symbol, exchange, interval]);

  return (
    <div className={`bg-white ${className}`} style={{ width, height }}>
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] text-sky-ink/50">
        <span>
          {symbol} · {interval} · 3d
        </span>
        <span className="font-semibold tabular-nums text-sky-ink">
          {status === 'loading' && '…'}
          {status === 'ok' && spot != null && `₹${spot.toFixed(2)}`}
          {status === 'error' && '—'}
        </span>
      </div>
      <div className="relative w-full overflow-hidden" style={{ height: height - 28 }}>
        <div ref={wrapRef} className="h-full w-full" />
        {dayXs.map((x) => (
          <div
            key={Math.round(x * 10)}
            className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-slate-400/45"
            style={{ left: x }}
          />
        ))}
      </div>
      {status === 'error' && (
        <p className="px-2 pb-1 text-[10px] text-rose-500">{err || 'Chart unavailable'}</p>
      )}
    </div>
  );
}
