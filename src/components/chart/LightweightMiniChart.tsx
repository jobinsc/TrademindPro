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

/** Local mini candlestick chart (Yahoo data) — reliable for NSE/BSE peeks */
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
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [spot, setSpot] = useState<number | null>(null);
  const [err, setErr] = useState('');

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
      timeScale: { borderColor: '#d5e6f0', timeVisible: true, secondsVisible: false },
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

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({ width: wrapRef.current.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [width, height]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErr('');

    async function load() {
      try {
        const params = new URLSearchParams({
          symbol,
          exchange,
          interval,
          limit: '80',
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
        const bars: CandlestickData[] = data.candles.map((c) => ({
          time: Math.floor(new Date(c.t).getTime() / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        seriesRef.current?.setData(bars);
        chartRef.current?.timeScale().fitContent();
        setSpot(data.spot ?? null);
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
          {symbol} · {interval}
        </span>
        <span className="font-semibold tabular-nums text-sky-ink">
          {status === 'loading' && '…'}
          {status === 'ok' && spot != null && `₹${spot.toFixed(2)}`}
          {status === 'error' && '—'}
        </span>
      </div>
      <div ref={wrapRef} className="w-full" style={{ height: height - 28 }} />
      {status === 'error' && (
        <p className="px-2 pb-1 text-[10px] text-rose-500">{err || 'Chart unavailable'}</p>
      )}
    </div>
  );
}
