'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  init,
  dispose,
  CandleType,
  type Chart,
  type KLineData,
} from 'klinecharts';
import { CHART_INTERVALS } from '@/lib/chart';
import {
  patchChartSettings,
  readChartSettings,
  type ChartStylePref,
} from '@/lib/chart-settings';
import {
  Activity,
  BarChart3,
  CandlestickChart,
  Check,
  Crosshair,
  Eraser,
  LineChart,
  Minus,
  MousePointer2,
  MoveDiagonal,
  Ruler,
  Search,
  Spline,
  Tag,
  TrendingUp,
  Type,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Candle = { t: string; open: number; high: number; low: number; close: number };

type Props = {
  symbol: string;
  exchange: string;
  interval: string;
  onIntervalChange?: (id: string) => void;
  height?: number | string;
  className?: string;
};

type ChartStyle = ChartStylePref;

type IndMeta = {
  id: string;
  name: string;
  category: 'Overlay' | 'Oscillators' | 'Volume' | 'Trend' | 'Momentum';
  overlay: boolean; // true = candle pane
};

/** All built-in klinecharts indicators, labeled like a TV picker */
const ALL_INDICATORS: IndMeta[] = [
  { id: 'MA', name: 'Moving Average', category: 'Overlay', overlay: true },
  { id: 'EMA', name: 'Exponential Moving Average', category: 'Overlay', overlay: true },
  { id: 'SMA', name: 'Smoothed Moving Average', category: 'Overlay', overlay: true },
  { id: 'BOLL', name: 'Bollinger Bands', category: 'Overlay', overlay: true },
  { id: 'SAR', name: 'Parabolic SAR', category: 'Overlay', overlay: true },
  { id: 'BBI', name: 'Bull and Bear Index', category: 'Overlay', overlay: true },
  { id: 'AVP', name: 'Average Price', category: 'Overlay', overlay: true },
  { id: 'VOL', name: 'Volume', category: 'Volume', overlay: false },
  { id: 'OBV', name: 'On Balance Volume', category: 'Volume', overlay: false },
  { id: 'PVT', name: 'Price Volume Trend', category: 'Volume', overlay: false },
  { id: 'VR', name: 'Volume Ratio', category: 'Volume', overlay: false },
  { id: 'MACD', name: 'MACD', category: 'Oscillators', overlay: false },
  { id: 'RSI', name: 'Relative Strength Index', category: 'Oscillators', overlay: false },
  { id: 'KDJ', name: 'Stochastic KDJ', category: 'Oscillators', overlay: false },
  { id: 'CCI', name: 'Commodity Channel Index', category: 'Oscillators', overlay: false },
  { id: 'WR', name: 'Williams %R', category: 'Oscillators', overlay: false },
  { id: 'BIAS', name: 'Bias Ratio', category: 'Oscillators', overlay: false },
  { id: 'PSY', name: 'Psychological Line', category: 'Oscillators', overlay: false },
  { id: 'ROC', name: 'Rate of Change', category: 'Momentum', overlay: false },
  { id: 'MTM', name: 'Momentum', category: 'Momentum', overlay: false },
  { id: 'AO', name: 'Awesome Oscillator', category: 'Momentum', overlay: false },
  { id: 'TRIX', name: 'TRIX', category: 'Trend', overlay: false },
  { id: 'DMI', name: 'Directional Movement Index', category: 'Trend', overlay: false },
  { id: 'DMA', name: 'Different of Moving Average', category: 'Trend', overlay: false },
  { id: 'EMV', name: 'Ease of Movement', category: 'Trend', overlay: false },
  { id: 'BRAR', name: 'BRAR', category: 'Momentum', overlay: false },
  { id: 'CR', name: 'Energy Index CR', category: 'Momentum', overlay: false },
];

type DrawTool = {
  id: string | null; // null = cursor
  label: string;
  icon: typeof Minus;
  group: 'cursor' | 'lines' | 'fib' | 'annotate';
};

const DRAW_TOOLS: DrawTool[] = [
  { id: null, label: 'Cursor', icon: MousePointer2, group: 'cursor' },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair, group: 'cursor' },
  { id: 'segment', label: 'Trend Line', icon: MoveDiagonal, group: 'lines' },
  { id: 'rayLine', label: 'Ray', icon: TrendingUp, group: 'lines' },
  { id: 'straightLine', label: 'Extended Line', icon: Spline, group: 'lines' },
  { id: 'horizontalStraightLine', label: 'Horizontal Line', icon: Minus, group: 'lines' },
  { id: 'horizontalRayLine', label: 'Horizontal Ray', icon: Minus, group: 'lines' },
  { id: 'horizontalSegment', label: 'Horizontal Segment', icon: Minus, group: 'lines' },
  { id: 'verticalStraightLine', label: 'Vertical Line', icon: Activity, group: 'lines' },
  { id: 'verticalRayLine', label: 'Vertical Ray', icon: Activity, group: 'lines' },
  { id: 'verticalSegment', label: 'Vertical Segment', icon: Activity, group: 'lines' },
  { id: 'parallelStraightLine', label: 'Parallel Channel', icon: BarChart3, group: 'lines' },
  { id: 'priceChannelLine', label: 'Price Channel', icon: BarChart3, group: 'lines' },
  { id: 'priceLine', label: 'Price Line', icon: LineChart, group: 'lines' },
  { id: 'fibonacciLine', label: 'Fibonacci Retracement', icon: Ruler, group: 'fib' },
  { id: 'simpleAnnotation', label: 'Annotation', icon: Type, group: 'annotate' },
  { id: 'simpleTag', label: 'Price Tag', icon: Tag, group: 'annotate' },
];

function toYahooInterval(tvId: string): string {
  return CHART_INTERVALS.find((i) => i.id === tvId)?.yahoo || '1d';
}

function paneIdFor(ind: IndMeta) {
  return ind.overlay ? 'candle_pane' : `pane_${ind.id}`;
}

/** TradingView-style Yahoo chart: left draw bar + Indicators window */
export default function LocalAdvancedChart({
  symbol,
  exchange,
  interval,
  onIntervalChange,
  height = '100%',
  className = '',
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [spot, setSpot] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(true);
  const [style, setStyle] = useState<ChartStyle>('candle');
  const [activeDraw, setActiveDraw] = useState<string | null>(null);
  const [activeInds, setActiveInds] = useState<Set<string>>(() => new Set());
  const [indOpen, setIndOpen] = useState(false);
  const [indQuery, setIndQuery] = useState('');
  const [indCategory, setIndCategory] = useState<string>('All');
  const [savedFlash, setSavedFlash] = useState(false);

  // Load global settings once (same for every symbol)
  useEffect(() => {
    const s = readChartSettings();
    setStyle(s.style);
    setActiveInds(new Set(s.indicators));
    setHydrated(true);
  }, []);

  // Persist whenever style / indicators change (after hydrate)
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    patchChartSettings({
      style,
      indicators: Array.from(activeInds),
    });
    setSavedFlash(true);
    const t = window.setTimeout(() => setSavedFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [style, activeInds, hydrated]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(ALL_INDICATORS.map((i) => i.category)))],
    []
  );

  const filteredInds = useMemo(() => {
    const q = indQuery.trim().toUpperCase();
    return ALL_INDICATORS.filter((i) => {
      if (indCategory !== 'All' && i.category !== indCategory) return false;
      if (!q) return true;
      return (
        i.id.includes(q) ||
        i.name.toUpperCase().includes(q) ||
        i.category.toUpperCase().includes(q)
      );
    });
  }, [indQuery, indCategory]);

  // Init chart
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const chart = init(el, {
      styles: {
        grid: {
          horizontal: { color: '#e8eef5' },
          vertical: { color: '#eef3f8' },
        },
        candle: {
          type: CandleType.CandleSolid,
          bar: {
            upColor: '#089981',
            downColor: '#f23645',
            noChangeColor: '#787b86',
            upBorderColor: '#089981',
            downBorderColor: '#f23645',
            upWickColor: '#089981',
            downWickColor: '#f23645',
          },
          priceMark: {
            high: { color: '#089981' },
            low: { color: '#f23645' },
            last: {
              upColor: '#089981',
              downColor: '#f23645',
              noChangeColor: '#787b86',
            },
          },
        },
        crosshair: {
          horizontal: { line: { color: '#9598a1' } },
          vertical: { line: { color: '#9598a1' } },
        },
        indicator: { lastValueMark: { show: true } },
      },
    });
    if (!chart) return;
    chartRef.current = chart;
    // Indicators applied from saved settings via the sync effect

    return () => {
      dispose(el);
      chartRef.current = null;
    };
  }, []);

  // Chart style
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const type =
      style === 'area'
        ? CandleType.Area
        : style === 'ohlc'
          ? CandleType.Ohlc
          : CandleType.CandleSolid;
    chart.setStyles({ candle: { type } });
  }, [style]);

  // Sync indicators to chart whenever selection changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const meta of ALL_INDICATORS) {
      const paneId = paneIdFor(meta);
      const on = activeInds.has(meta.id);
      try {
        if (meta.overlay) {
          chart.removeIndicator('candle_pane', meta.id);
        } else {
          chart.removeIndicator(paneId);
        }
      } catch {
        /* ignore */
      }
      if (on) {
        try {
          if (meta.overlay) {
            chart.createIndicator({ name: meta.id }, true, { id: 'candle_pane' });
          } else {
            chart.createIndicator(meta.id, false, { id: paneId });
          }
        } catch {
          /* ignore */
        }
      }
    }
  }, [activeInds]);

  // Load Yahoo candles
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErr('');

    async function load() {
      try {
        const yahooIv = toYahooInterval(interval);
        const params = new URLSearchParams({
          symbol,
          exchange,
          interval: yahooIv,
          limit: '5000',
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
          setErr(data.error || `No candles for ${symbol}`);
          return;
        }
        const list: KLineData[] = data.candles.map((c) => ({
          timestamp: new Date(c.t).getTime(),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: Math.max(1, Math.abs(c.high - c.low) * 1000),
        }));
        chartRef.current?.applyNewData(list);
        setSpot(data.spot ?? list[list.length - 1]?.close ?? null);
        setStatus('ok');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErr(e instanceof Error ? e.message : 'Load failed');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [symbol, exchange, interval]);

  function selectDraw(tool: DrawTool) {
    const chart = chartRef.current;
    if (!chart) return;
    if (tool.id == null || tool.id === 'crosshair') {
      setActiveDraw(tool.id);
      return;
    }
    setActiveDraw(tool.id);
    chart.createOverlay(tool.id);
  }

  function clearDrawings() {
    chartRef.current?.removeOverlay();
    setActiveDraw(null);
  }

  function toggleIndicator(id: string) {
    setActiveInds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeList = ALL_INDICATORS.filter((i) => activeInds.has(i.id));

  return (
    <div
      className={cn(
        'relative flex h-full min-h-[520px] w-full flex-col overflow-hidden rounded-xl border border-[#cfd6dd] bg-white shadow-sm',
        className
      )}
      style={{ height }}
    >
      {/* Top bar — TradingView style */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#e0e3eb] bg-[#f8f9fd] px-2">
        <div className="flex items-center gap-1.5 pr-2">
          <CandlestickChart className="h-4 w-4 text-[#2962ff]" strokeWidth={2} />
          <span className="text-[13px] font-bold text-[#131722]">
            {symbol}
          </span>
          <span className="text-[11px] font-semibold text-[#787b86]">
            {exchange}
          </span>
          {status === 'ok' && spot != null && (
            <span className="ml-1 text-[12px] font-semibold tabular-nums text-[#131722]">
              {spot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          )}
          {status === 'loading' && (
            <span className="text-[11px] text-[#787b86]">Loading…</span>
          )}
          {status === 'error' && (
            <span className="text-[11px] text-[#f23645]">{err}</span>
          )}
        </div>

        <div className="mx-1 h-5 w-px bg-[#e0e3eb]" />

        {/* Timeframes */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {CHART_INTERVALS.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => onIntervalChange?.(tf.id)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-semibold',
                interval === tf.id
                  ? 'bg-[#2962ff]/12 text-[#2962ff]'
                  : 'text-[#131722]/70 hover:bg-[#e0e3eb]/70'
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-[#e0e3eb]" />

        {/* Chart type */}
        {(
          [
            ['candle', 'Candles'],
            ['ohlc', 'Bars'],
            ['area', 'Area'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStyle(id)}
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-semibold',
              style === id
                ? 'bg-[#2962ff]/12 text-[#2962ff]'
                : 'text-[#131722]/70 hover:bg-[#e0e3eb]/70'
            )}
          >
            {label}
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-[#e0e3eb]" />

        <button
          type="button"
          onClick={() => setIndOpen(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold text-[#131722] hover:bg-[#e0e3eb]/80"
        >
          <BarChart3 className="h-3.5 w-3.5 text-[#2962ff]" />
          Indicators
          {activeInds.size > 0 && (
            <span className="rounded bg-[#2962ff] px-1 text-[9px] font-bold text-white">
              {activeInds.size}
            </span>
          )}
        </button>

        {savedFlash && (
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-[#089981]/15 px-2 py-0.5 text-[10px] font-bold text-[#089981]">
            <Check className="h-3 w-3" strokeWidth={2.5} />
            Saved for all charts
          </span>
        )}

        {/* Active indicator chips */}
        <div className="ml-1 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
          {activeList.slice(0, 6).map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggleIndicator(i.id)}
              title={`Remove ${i.name}`}
              className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#131722] ring-1 ring-[#e0e3eb] hover:ring-[#f23645]"
            >
              {i.id}
              <X className="h-2.5 w-2.5 text-[#787b86]" />
            </button>
          ))}
        </div>
      </div>

      {/* Body: left draw toolbar + chart */}
      <div className="relative flex min-h-0 flex-1">
        {/* Left drawing toolbar — TradingView style */}
        <aside className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-[#e0e3eb] bg-[#f8f9fd] py-1">
          {DRAW_TOOLS.filter((t) => t.group === 'cursor').map((tool) => {
            const Icon = tool.icon;
            const on = activeDraw === tool.id;
            return (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                onClick={() => selectDraw(tool)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md transition',
                  on
                    ? 'bg-[#2962ff]/15 text-[#2962ff]'
                    : 'text-[#131722]/75 hover:bg-[#e0e3eb]'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            );
          })}
          <div className="my-1 h-px w-7 bg-[#e0e3eb]" />
          {DRAW_TOOLS.filter((t) => t.group === 'lines').map((tool) => {
            const Icon = tool.icon;
            const on = activeDraw === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.label}
                onClick={() => selectDraw(tool)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md transition',
                  on
                    ? 'bg-[#2962ff]/15 text-[#2962ff]'
                    : 'text-[#131722]/75 hover:bg-[#e0e3eb]'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            );
          })}
          <div className="my-1 h-px w-7 bg-[#e0e3eb]" />
          {DRAW_TOOLS.filter((t) => t.group === 'fib' || t.group === 'annotate').map(
            (tool) => {
              const Icon = tool.icon;
              const on = activeDraw === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.label}
                  onClick={() => selectDraw(tool)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md transition',
                    on
                      ? 'bg-[#2962ff]/15 text-[#2962ff]'
                      : 'text-[#131722]/75 hover:bg-[#e0e3eb]'
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>
              );
            }
          )}
          <div className="mt-auto flex flex-col items-center gap-0.5 pb-1">
            <button
              type="button"
              title="Remove drawings"
              onClick={clearDrawings}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#f23645] hover:bg-[#f23645]/10"
            >
              <Eraser className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </aside>

        {/* Chart canvas */}
        <div ref={hostRef} className="min-h-0 min-w-0 flex-1 bg-white" />

        {/* Indicators window / modal */}
        {indOpen && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-[#131722]/35 p-4 backdrop-blur-[1px]">
            <div className="mt-8 flex h-[min(560px,80vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#e0e3eb] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#e0e3eb] px-4 py-3">
                <div>
                  <p className="text-[15px] font-bold text-[#131722]">Indicators</p>
                  <p className="text-[11px] text-[#787b86]">
                    Changes save automatically and apply to every chart you open
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIndOpen(false)}
                  className="rounded-lg p-1.5 text-[#787b86] hover:bg-[#f0f3fa] hover:text-[#131722]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-[#e0e3eb] px-4 py-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#787b86]" />
                  <input
                    value={indQuery}
                    onChange={(e) => setIndQuery(e.target.value)}
                    placeholder="Search indicators…"
                    autoFocus
                    className="w-full rounded-lg border border-[#e0e3eb] bg-[#f8f9fd] py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#2962ff] focus:ring-2 focus:ring-[#2962ff]/20"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setIndCategory(c)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold',
                        indCategory === c
                          ? 'bg-[#2962ff] text-white'
                          : 'bg-[#f0f3fa] text-[#131722]/70 hover:bg-[#e0e3eb]'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredInds.map((ind) => {
                  const on = activeInds.has(ind.id);
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => toggleIndicator(ind.id)}
                      className={cn(
                        'flex w-full items-center justify-between border-b border-[#f0f3fa] px-4 py-2.5 text-left transition hover:bg-[#f8f9fd]',
                        on && 'bg-[#2962ff]/06'
                      )}
                    >
                      <div>
                        <p className="text-[13px] font-semibold text-[#131722]">
                          {ind.name}
                        </p>
                        <p className="text-[11px] text-[#787b86]">
                          {ind.id} · {ind.category}
                          {ind.overlay ? ' · Overlay' : ' · Separate pane'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          on
                            ? 'bg-[#089981] text-white'
                            : 'bg-[#f0f3fa] text-[#787b86]'
                        )}
                      >
                        {on ? 'Added' : 'Add'}
                      </span>
                    </button>
                  );
                })}
                {filteredInds.length === 0 && (
                  <p className="px-4 py-10 text-center text-[13px] text-[#787b86]">
                    No indicators match “{indQuery}”
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[#e0e3eb] bg-[#f8f9fd] px-4 py-2.5">
                <p className="text-[11px] text-[#787b86]">
                  {activeInds.size} active on chart
                </p>
                <button
                  type="button"
                  onClick={() => setIndOpen(false)}
                  className="rounded-lg bg-[#2962ff] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#1e53e5]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
