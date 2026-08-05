'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  HardDrive,
  List,
  Play,
  Radar,
  RefreshCw,
  Search,
  Send,
  Square,
  Target,
} from 'lucide-react';
import { ModuleRunButton } from '@/components/ui/ModuleTabShell';
import { useJimbo } from '@/hooks/useJimbo';
import {
  JIMBO_NAME,
  JIMBO_SCAN_SCOPE_OPTIONS,
  JIMBO_SCAN_TIMEFRAMES,
  JIMBO_UNIVERSE,
  type JimboScanScope,
} from '@/lib/jimbo';
import { JIMBO_MIN_OPTION_ENTRY_PREMIUM } from '@/lib/paper-exit';
import { NSE_EQUITY_FO_COUNT, NSE_EQUITY_FO_WATCHLIST } from '@/lib/jimbo-fo-universe';
import {
  rankLiquidMomentum,
  readMomentumFocus,
  writeMomentumFocus,
  type MomentumQuote,
  type MomentumRow,
} from '@/lib/jimbo-momentum';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import { formatCurrency } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';
import {
  SymbolChartLink,
  openChartPeekNow,
  moveChartPeek,
  scheduleCloseChartPeek,
  cancelCloseChartPeek,
} from '@/components/chart/SymbolChartLink';
import { useChartPeekEnabled } from '@/hooks/useChartPeekEnabled';
import InfoBubble from '@/components/ui/InfoBubble';
import type { JimboBacktestResult } from '@/lib/jimbo-backtest';

const WATCHLIST_OPEN_KEY = 'trademindpro_jimbo_fo_watchlist_open_v1';
const CCI_SETUPS_OPEN_KEY = 'trademindpro_jimbo_cci_setups_open_v1';
const FO_QUOTE_POLL_MS = 12_000;
const MOMENTUM_POLL_MS = 20_000;

type FoWatchQuote = {
  lastPrice: number;
  open: number;
  change: number | null;
  changePct: number | null;
};

type FoSortKey = 'ltp' | 'chg' | 'pct' | 'scan';

function FoSortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onCycle,
  align = 'right',
  title,
}: {
  label: string;
  sortKey: FoSortKey;
  activeKey: FoSortKey | null;
  dir: 'asc' | 'desc' | null;
  onCycle: (key: FoSortKey) => void;
  align?: 'left' | 'right';
  title: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onCycle(sortKey)}
        title={title}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-sky-soft/80 hover:text-sky-deep ${
          align === 'right' ? 'w-full flex-row-reverse justify-start' : ''
        } ${active ? 'font-bold text-sky-deep' : 'font-semibold text-sky-ink/45'}`}
      >
        <span>{label}</span>
        {active && dir === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        ) : active && dir === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
        )}
      </button>
    </th>
  );
}

function MomentumSideTable({
  title,
  rows,
  tone,
  focus,
  chartPeekOn,
  onToggleFocus,
  onPeek,
  onLeavePeek,
}: {
  title: string;
  rows: MomentumRow[];
  tone: 'up' | 'down';
  focus: string[];
  chartPeekOn: boolean;
  onToggleFocus: (symbol: string) => void;
  onPeek: (row: { symbol: string; name: string }, e: React.MouseEvent) => void;
  onLeavePeek: () => void;
}) {
  return (
    <div className={tone === 'up' ? 'md:border-r md:border-[#e8eef3]' : ''}>
      <div
        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wide ${
          tone === 'up' ? 'bg-emerald-50/80 text-emerald-800' : 'bg-rose-50/80 text-rose-800'
        }`}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-sky-ink/40">
          Waiting for live quotes…
        </p>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead className="text-[10px] uppercase tracking-wide text-sky-ink/40">
            <tr>
              <th className="px-3 py-1.5 font-semibold">#</th>
              <th className="px-3 py-1.5 font-semibold">Symbol</th>
              <th className="px-3 py-1.5 text-right font-semibold">LTP</th>
              <th className="px-3 py-1.5 text-right font-semibold">Day %</th>
              <th className="px-3 py-1.5 text-right font-semibold">Vs open</th>
              <th className="px-3 py-1.5 font-semibold">Bias</th>
              <th className="px-3 py-1.5 font-semibold">Focus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pinned = focus.includes(row.symbol);
              const pctTone =
                row.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600';
              const openTone =
                row.fromOpenPct >= 0 ? 'text-emerald-600' : 'text-rose-600';
              return (
                <tr
                  key={row.symbol}
                  className="border-t border-slate-50 hover:bg-sky-soft/30"
                  onMouseEnter={(e) => chartPeekOn && onPeek(row, e)}
                  onMouseLeave={onLeavePeek}
                  onMouseMove={(e) => {
                    if (chartPeekOn) moveChartPeek(e.clientX, e.clientY);
                  }}
                >
                  <td className="px-3 py-1.5 tabular-nums text-sky-ink/40">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <SymbolChartLink
                      symbol={row.symbol}
                      exchange="NSE"
                      name={row.name}
                      hoverPeek={false}
                      className="text-[12px] font-semibold"
                    >
                      {row.symbol}
                    </SymbolChartLink>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sky-ink">
                    {row.lastPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${pctTone}`}>
                    {row.changePct >= 0 ? '+' : ''}
                    {row.changePct.toFixed(2)}%
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${openTone}`}>
                    {row.fromOpenPct >= 0 ? '+' : ''}
                    {row.fromOpenPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.optionBias === 'CE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {row.optionBias}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleFocus(row.symbol)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        pinned
                          ? 'bg-sky-deep text-white'
                          : 'border border-[#cfe0ee] text-sky-deep hover:bg-sky-soft'
                      }`}
                    >
                      {pinned ? 'Pinned' : 'Pin'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function JimboWorkspace() {
  const {
    ready,
    settings,
    signals,
    lastScanAt,
    trades,
    events,
    chat,
    marketOpen,
    sessionLabel,
    scanning,
    dayPnl,
    openTrade,
    liveMark,
    scan,
    setAutoTrade,
    takeSignal,
    closeOpen,
    clearPaperTrades,
    backupPaperNow,
    repairPaperLive,
    runPaperBacktest,
    ask,
    clearChat,
    updateSettings,
  } = useJimbo();
  const [prompt, setPrompt] = useState('');
  const [backtesting, setBacktesting] = useState(false);
  const [backtestStatus, setBacktestStatus] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [repairingPaper, setRepairingPaper] = useState(false);
  const [backtestSummary, setBacktestSummary] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<JimboBacktestResult | null>(null);
  const [backtestTradesOpen, setBacktestTradesOpen] = useState(true);
  const [backtestSettingsOpen, setBacktestSettingsOpen] = useState(true);
  const istToday = useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    []
  );
  const istMonthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }, []);
  const [btFromDate, setBtFromDate] = useState(istMonthAgo);
  const [btToDate, setBtToDate] = useState(istToday);
  const [btStopLoss, setBtStopLoss] = useState(10);
  const [btTarget, setBtTarget] = useState(18);
  const [btLots, setBtLots] = useState(1);
  const [btMinConf, setBtMinConf] = useState(75);
  const [btMaxPerDay, setBtMaxPerDay] = useState(10);
  const [btEnforcePerDay, setBtEnforcePerDay] = useState(false);
  const [btMaxTotal, setBtMaxTotal] = useState(0);
  const [btEnforceMaxLoss, setBtEnforceMaxLoss] = useState(false);
  const [btDailyMaxLoss, setBtDailyMaxLoss] = useState(1500);
  const [btEnforceTarget, setBtEnforceTarget] = useState(false);
  const [btDailyTarget, setBtDailyTarget] = useState(2500);
  const [cciSetupsOpen, setCciSetupsOpen] = useState(() => {
    try {
      const v = localStorage.getItem(CCI_SETUPS_OPEN_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(() => {
    try {
      return localStorage.getItem(WATCHLIST_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [watchQuery, setWatchQuery] = useState('');
  const [foQuotes, setFoQuotes] = useState<Record<string, FoWatchQuote>>({});
  const [foQuotesLive, setFoQuotesLive] = useState(false);
  const [foQuoteError, setFoQuoteError] = useState<string | null>(null);
  /** null = list order; clicking a column cycles desc → asc → clear */
  const [foSort, setFoSort] = useState<{
    key: FoSortKey;
    dir: 'asc' | 'desc';
  } | null>(null);
  const { enabled: chartPeekOn } = useChartPeekEnabled();
  const foPeekTimer = useRef<number | null>(null);
  const [momentumQuotes, setMomentumQuotes] = useState<Record<string, MomentumQuote>>({});
  const [momentumAt, setMomentumAt] = useState<string | null>(null);
  const [momentumError, setMomentumError] = useState<string | null>(null);
  const [momentumFocus, setMomentumFocus] = useState<string[]>(() => readMomentumFocus());
  const [momentumRefreshing, setMomentumRefreshing] = useState(false);

  const actionable = signals.filter((s) => s.bias !== 'FLAT');
  const liveForOpen =
    openTrade && liveMark && liveMark.tradeId === openTrade.id ? liveMark : null;
  const displayMark = liveForOpen?.ltp ?? openTrade?.markPremium ?? openTrade?.entryPremium;
  const displayPeak =
    liveForOpen?.peak ?? openTrade?.peakPremium ?? openTrade?.entryPremium;
  const displayLow =
    liveForOpen?.low ?? openTrade?.lowPremium ?? openTrade?.entryPremium;
  const openUnrealized =
    openTrade && displayMark != null
      ? Math.round(
          (displayMark - openTrade.entryPremium) * openTrade.lotSize * openTrade.lots
        )
      : 0;
  const dayPnlLive = dayPnl + openUnrealized;
  const locked =
    (settings.enforceDailyTargetLimit && settings.status === 'target_hit') ||
    (settings.enforceMaxLossLimit && settings.status === 'stopped_loss');
  const scanScope = (settings.scanScope || 'liquid') as JimboScanScope;

  const foSymbols = useMemo(
    () => NSE_EQUITY_FO_WATCHLIST.map((s) => s.symbol),
    []
  );

  const liquidUniverse = useMemo(
    () => JIMBO_UNIVERSE.filter((s) => s.liquidityRank <= settings.maxLiquidityRank),
    [settings.maxLiquidityRank]
  );

  const liquidSymbols = useMemo(
    () => liquidUniverse.map((s) => s.symbol),
    [liquidUniverse]
  );

  const momentumBoard = useMemo(
    () => rankLiquidMomentum(liquidUniverse, momentumQuotes, 5),
    [liquidUniverse, momentumQuotes]
  );

  const scanSymbols = useMemo(
    () => new Set(signals.filter((s) => s.bias !== 'FLAT').map((s) => s.symbol)),
    [signals]
  );

  const runCciScan = useCallback(() => {
    const spots: Record<string, { lastPrice?: number; changePct?: number | null }> = {};
    for (const [sym, q] of Object.entries(foQuotes)) {
      if (q?.lastPrice && q.lastPrice > 0) {
        spots[sym] = { lastPrice: q.lastPrice, changePct: q.changePct ?? null };
      }
    }
    void scan(Object.keys(spots).length ? spots : undefined);
  }, [foQuotes, scan]);

  const filteredFo = useMemo(() => {
    const q = watchQuery.trim().toUpperCase();
    if (!q) return NSE_EQUITY_FO_WATCHLIST;
    return NSE_EQUITY_FO_WATCHLIST.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)
    );
  }, [watchQuery]);

  const displayFo = useMemo(() => {
    if (!foSort) return filteredFo;
    const rows = [...filteredFo];
    rows.sort((a, b) => {
      if (foSort.key === 'scan') {
        const sa = scanSymbols.has(a.symbol) ? 1 : 0;
        const sb = scanSymbols.has(b.symbol) ? 1 : 0;
        const diff = sa - sb;
        if (diff !== 0) return foSort.dir === 'desc' ? -diff : diff;
        return a.symbol.localeCompare(b.symbol);
      }

      const qa = foQuotes[a.symbol];
      const qb = foQuotes[b.symbol];
      let pa: number | null = null;
      let pb: number | null = null;
      if (foSort.key === 'ltp') {
        pa = qa?.lastPrice && qa.lastPrice > 0 ? qa.lastPrice : null;
        pb = qb?.lastPrice && qb.lastPrice > 0 ? qb.lastPrice : null;
      } else if (foSort.key === 'chg') {
        pa = qa?.change ?? null;
        pb = qb?.change ?? null;
      } else {
        pa = qa?.changePct ?? null;
        pb = qb?.changePct ?? null;
      }

      if (pa == null && pb == null) return a.symbol.localeCompare(b.symbol);
      if (pa == null) return 1;
      if (pb == null) return -1;
      const diff = pa - pb;
      return foSort.dir === 'asc' ? diff : -diff;
    });
    return rows;
  }, [filteredFo, foQuotes, foSort, scanSymbols]);

  function cycleFoSort(key: FoSortKey) {
    setFoSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  }

  function clearFoPeekTimer() {
    if (foPeekTimer.current) {
      window.clearTimeout(foPeekTimer.current);
      foPeekTimer.current = null;
    }
  }

  function peekFoRow(
    row: { symbol: string; name: string },
    e: React.MouseEvent,
    immediate = false
  ) {
    if (!chartPeekOn) return;
    cancelCloseChartPeek();
    clearFoPeekTimer();
    const open = () =>
      openChartPeekNow({
        symbol: row.symbol,
        exchange: 'NSE',
        name: row.name,
        x: e.clientX,
        y: e.clientY,
      });
    if (immediate) open();
    else foPeekTimer.current = window.setTimeout(open, 120);
  }

  function leaveFoPeek() {
    clearFoPeekTimer();
    scheduleCloseChartPeek(700);
  }

  useEffect(() => {
    if (!watchlistOpen) return;
    let cancelled = false;

    function normalizeFoSymbol(raw: string): string {
      return raw
        .replace(/^(NSE_EQ|BSE_EQ|NSE_FO|BSE_FO)[:|]/i, '')
        .trim()
        .toUpperCase();
    }

    async function pullFoQuotes() {
      const token = getUpstoxAccessToken();
      if (!token) {
        if (!cancelled) {
          setFoQuotesLive(false);
          setFoQuoteError('Connect Upstox to load LTP');
        }
        return;
      }
      try {
        // Resolve trading symbols → real Upstox instrument keys (ISIN form).
        // Passing NSE_EQ|SYMBOL often returns data keyed as ISIN / NSE_EQ:SYM and never matches rows.
        const res = await fetch('/api/market/quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ symbols: foSymbols }),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          quotes?: Array<{
            instrumentKey?: string;
            symbol?: string;
            lastPrice?: number;
            open?: number;
            change?: number;
            changePct?: number;
          }>;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !Array.isArray(data.quotes)) {
          setFoQuotesLive(false);
          setFoQuoteError(data.error || `LTP fetch failed (${res.status})`);
          return;
        }
        const known = new Set(foSymbols);
        const map: Record<string, FoWatchQuote> = {};
        for (const q of data.quotes) {
          const candidates = [q.symbol, q.instrumentKey]
            .filter(Boolean)
            .map((s) => normalizeFoSymbol(String(s)));
          const sym =
            candidates.find((c) => known.has(c)) ||
            candidates.find((c) => c && !/^IN[A-Z0-9]{10}$/i.test(c)) ||
            '';
          const last = Number(q.lastPrice ?? 0);
          if (!sym || !(last > 0)) continue;
          map[sym] = {
            lastPrice: last,
            open: Number(q.open ?? 0),
            change: typeof q.change === 'number' ? q.change : null,
            changePct: typeof q.changePct === 'number' ? q.changePct : null,
          };
        }
        setFoQuotes(map);
        setFoQuotesLive(Object.keys(map).length > 0);
        setFoQuoteError(
          Object.keys(map).length
            ? null
            : 'Upstox returned no equity LTPs — try reconnect or refresh'
        );
      } catch (err) {
        if (!cancelled) {
          setFoQuotesLive(false);
          setFoQuoteError(err instanceof Error ? err.message : 'LTP fetch failed');
        }
      }
    }

    void pullFoQuotes();
    const id = window.setInterval(() => void pullFoQuotes(), FO_QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      clearFoPeekTimer();
    };
  }, [watchlistOpen, foSymbols]);

  // Live momentum board — liquid universe only (fast rank, no candle wait)
  const refreshMomentum = useCallback(
    async (opts?: { pinFocus?: boolean }) => {
      const token = getUpstoxAccessToken();
      if (!token) {
        setMomentumError('Connect Upstox for live momentum');
        return;
      }
      setMomentumRefreshing(true);
      try {
        const res = await fetch('/api/market/quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ symbols: liquidSymbols }),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          quotes?: Array<{
            instrumentKey?: string;
            symbol?: string;
            lastPrice?: number;
            open?: number;
            change?: number;
            changePct?: number;
          }>;
        };
        if (!res.ok || !data.ok || !Array.isArray(data.quotes)) {
          setMomentumError(data.error || `Momentum quotes failed (${res.status})`);
          return;
        }
        const normalizeSym = (raw: string) =>
          raw
            .replace(/^(NSE_EQ|BSE_EQ|NSE_FO|BSE_FO)[:|]/i, '')
            .trim()
            .toUpperCase();
        const known = new Set(liquidSymbols);
        const map: Record<string, MomentumQuote> = {};
        for (const q of data.quotes) {
          const candidates = [q.symbol, q.instrumentKey]
            .filter(Boolean)
            .map((s) => normalizeSym(String(s)));
          const sym =
            candidates.find((c) => known.has(c)) ||
            candidates.find((c) => c && !/^IN[A-Z0-9]{10}$/i.test(c)) ||
            '';
          const last = Number(q.lastPrice ?? 0);
          if (!sym || !(last > 0)) continue;
          map[sym] = {
            lastPrice: last,
            open: Number(q.open ?? 0),
            change: typeof q.change === 'number' ? q.change : null,
            changePct: typeof q.changePct === 'number' ? q.changePct : null,
          };
        }
        setMomentumQuotes(map);
        setMomentumAt(new Date().toISOString());
        setMomentumError(Object.keys(map).length ? null : 'No liquid quotes yet');

        if (opts?.pinFocus) {
          const ranked = rankLiquidMomentum(liquidUniverse, map, 5);
          const next = [
            ...ranked.up.map((r) => r.symbol),
            ...ranked.down.map((r) => r.symbol),
          ];
          setMomentumFocus(next);
          writeMomentumFocus(next);
        }
      } catch (err) {
        setMomentumError(err instanceof Error ? err.message : 'Momentum fetch failed');
      } finally {
        setMomentumRefreshing(false);
      }
    },
    [liquidSymbols, liquidUniverse]
  );

  useEffect(() => {
    void refreshMomentum();
    const id = window.setInterval(() => void refreshMomentum(), MOMENTUM_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshMomentum]);

  function setFocusSymbols(symbols: string[]) {
    const next = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 20);
    setMomentumFocus(next);
    writeMomentumFocus(next);
  }

  function pinMomentumBoard() {
    setFocusSymbols([
      ...momentumBoard.up.map((r) => r.symbol),
      ...momentumBoard.down.map((r) => r.symbol),
    ]);
  }

  function toggleFocusSymbol(symbol: string) {
    const s = symbol.toUpperCase();
    setFocusSymbols(
      momentumFocus.includes(s)
        ? momentumFocus.filter((x) => x !== s)
        : [...momentumFocus, s]
    );
  }

  function toggleWatchlist() {
    setWatchlistOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(WATCHLIST_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleCciSetups() {
    setCciSetupsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CCI_SETUPS_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleAuto() {
    setAutoTrade(!settings.autoTrade);
  }

  const cciMatches = useMemo(
    () => signals.filter((s) => s.bias === 'CE' || s.bias === 'PE'),
    [signals]
  );

  const { sorted: displaySignals, sort, toggle } = useSortable(
    cciMatches,
    (s, key) => {
      switch (key) {
        case 'symbol':
          return s.symbol;
        case 'cci':
          return s.cciCurr;
        case 'bias':
          return s.bias;
        case 'atm':
          return s.premium > 0 ? s.premium : s.strike;
        case 'conf':
          return s.confidence;
        default:
          return '';
      }
    },
    { key: 'conf', dir: 'desc' }
  );

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Waking {JIMBO_NAME}…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Specialist Agent
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              {JIMBO_NAME}
            </h1>
            <InfoBubble title="How Jimbo works">
              <p>
                Stock options on the full NSE F&amp;O watchlist. CCI crosses 0 + price action → ATM
                CE (up) or ATM PE (down) with live Upstox option premium. Sibling of Nejoic (index).
              </p>
              <p className="mt-2">
                CCI({settings.cciPeriod}) rising through 0 → Call. Falling through 0 → Put. Auto only
                while Jimbo session is open (until 15:12 IST). Max-loss / max-trades are optional
                toggles (off by default).
              </p>
              <p className="mt-2">
                Watchlist <strong>Active</strong> = passed CCI rules on last scan (shows live ATM).
                <strong> Momentum board</strong> still ranks a liquid focus list by day % for quick
                CE/PE ideas — separate from CCI setups.
              </p>
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              marketOpen
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          </span>
          <p className="max-w-[220px] text-right text-[11px] text-sky-ink/45">{sessionLabel}</p>
        </div>
      </div>

      {/* Opening / intraday momentum shortlist — liquid only */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eef3] px-4 py-3">
          <div>
            <p className="font-display text-[15px] font-semibold text-sky-ink">
              Momentum focus · top 5 up / down
            </p>
            <p className="mt-0.5 max-w-2xl text-[11px] text-sky-ink/50">
              Ranks liquid scan names by day % + % from open. Use UP for ATM CE, DOWN for ATM PE.
              Click Refresh to reload ranks and select the new top 5+5 into Focus.
              {momentumAt
                ? ` · updated ${new Date(momentumAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshMomentum({ pinFocus: true })}
              disabled={momentumRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#cfe0ee] bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-deep hover:bg-sky-soft disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${momentumRefreshing ? 'animate-spin' : ''}`}
                strokeWidth={2}
              />
              {momentumRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={pinMomentumBoard}
              disabled={!momentumBoard.up.length && !momentumBoard.down.length}
              className="rounded-lg bg-sky-deep px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-ink disabled:opacity-40"
            >
              Pin 5+5 to Focus
            </button>
            <button
              type="button"
              onClick={() => setFocusSymbols([])}
              disabled={!momentumFocus.length}
              className="rounded-lg border border-[#cfe0ee] px-3 py-1.5 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
            >
              Clear Focus
            </button>
          </div>
        </div>

        {momentumError ? (
          <p className="px-4 py-3 text-[12px] text-amber-800">{momentumError}</p>
        ) : null}

        <div className="grid gap-0 md:grid-cols-2">
          <MomentumSideTable
            title="UP · ATM CE bias"
            rows={momentumBoard.up}
            tone="up"
            focus={momentumFocus}
            chartPeekOn={chartPeekOn}
            onToggleFocus={toggleFocusSymbol}
            onPeek={peekFoRow}
            onLeavePeek={leaveFoPeek}
          />
          <MomentumSideTable
            title="DOWN · ATM PE bias"
            rows={momentumBoard.down}
            tone="down"
            focus={momentumFocus}
            chartPeekOn={chartPeekOn}
            onToggleFocus={toggleFocusSymbol}
            onPeek={peekFoRow}
            onLeavePeek={leaveFoPeek}
          />
        </div>

        {momentumFocus.length ? (
          <div className="border-t border-[#e8eef3] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Focus window ({momentumFocus.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {momentumFocus.map((sym) => {
                const up = momentumBoard.up.find((r) => r.symbol === sym);
                const down = momentumBoard.down.find((r) => r.symbol === sym);
                const row = up || down;
                const bias = row?.optionBias ?? '—';
                return (
                  <span
                    key={sym}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      bias === 'CE'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : bias === 'PE'
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : 'border-[#cfe0ee] bg-sky-soft/50 text-sky-ink'
                    }`}
                  >
                    <SymbolChartLink
                      symbol={sym}
                      exchange="NSE"
                      name={row?.name}
                      hoverPeek={false}
                      className="text-[11px] font-semibold"
                    >
                      {sym}
                    </SymbolChartLink>
                    <span>{bias}</span>
                    <button
                      type="button"
                      onClick={() => toggleFocusSymbol(sym)}
                      className="opacity-50 hover:opacity-100"
                      aria-label={`Remove ${sym} from focus`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
              CCI scan controls
            </p>
            <p className="mt-1 text-[12px] text-sky-ink/55">
              Pick candle TF + which stocks to scan. Start auto rescans and takes the best paper trade
              on <strong>live Upstox option LTP</strong> while the market is open (no simulation).
            </p>
          </div>
          <p className="text-[12px] font-semibold text-sky-ink/70">
            Auto {settings.autoTrade ? 'ON' : 'OFF'} · until 15:12 · SL{' '}
            {settings.stopLossPoints} / Tgt {settings.targetPoints} pts
            {settings.mfeProfitTrail !== false
              ? ` · MFE trail@${settings.mfeTrailTriggerPts || 7}`
              : ''}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-sky-ink/70">
            TF
            <select
              value={settings.primaryTimeframe}
              onChange={(e) => updateSettings({ primaryTimeframe: e.target.value })}
              className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
            >
              {JIMBO_SCAN_TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[12px] font-semibold text-sky-ink/70">
            Stocks
            <select
              value={scanScope}
              onChange={(e) =>
                updateSettings({ scanScope: e.target.value as JimboScanScope })
              }
              className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
              title={
                JIMBO_SCAN_SCOPE_OPTIONS.find((o) => o.id === scanScope)?.hint ?? ''
              }
            >
              {JIMBO_SCAN_SCOPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label
            className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-ink/70"
            title="Option premium stop-loss in points (per share)"
          >
            SL
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={settings.stopLossPoints || 10}
              onChange={(e) =>
                updateSettings({
                  stopLossPoints: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                })
              }
              className="w-16 rounded-lg border border-[#cfe0ee] bg-white px-2 py-1.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
          </label>

          <label
            className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-ink/70"
            title="Option premium target in points (per share)"
          >
            Tgt
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={settings.targetPoints || 18}
              onChange={(e) =>
                updateSettings({
                  targetPoints: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                })
              }
              className="w-16 rounded-lg border border-[#cfe0ee] bg-white px-2 py-1.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
          </label>

          <ModuleRunButton variant="start" onClick={() => runCciScan()} disabled={scanning}>
            <Radar className="h-4 w-4" />
            {scanning ? 'Scanning…' : 'Scan CCI'}
          </ModuleRunButton>

          {!settings.autoTrade ? (
            <ModuleRunButton
              variant="start"
              onClick={toggleAuto}
              disabled={locked || !marketOpen}
            >
              <Play className="h-4 w-4" />
              Start auto
            </ModuleRunButton>
          ) : (
            <ModuleRunButton variant="stop" onClick={toggleAuto}>
              <Square className="h-4 w-4" />
              Stop auto
            </ModuleRunButton>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#e8eef3] bg-sky-soft/25 px-3 py-2.5">
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-sky-ink/75">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
              checked={settings.mfeProfitTrail !== false}
              onChange={(e) => updateSettings({ mfeProfitTrail: e.target.checked })}
            />
            MFE profit trail
            {settings.mfeProfitTrail !== false ? (
              <>
                <span className="font-normal text-sky-ink/50">arm</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={settings.mfeTrailTriggerPts || 7}
                  onChange={(e) =>
                    updateSettings({
                      mfeTrailTriggerPts: Math.max(
                        1,
                        Math.min(100, Number(e.target.value) || 7)
                      ),
                    })
                  }
                  className="w-12 rounded-md border border-[#cfe0ee] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-sky-ink"
                  title="Arm after this many premium points of peak profit"
                />
                <span className="font-normal text-sky-ink/50">pts · keep</span>
                <input
                  type="number"
                  min={10}
                  max={90}
                  step={5}
                  value={Math.round((settings.mfeTrailKeepFrac ?? 0.5) * 100)}
                  onChange={(e) =>
                    updateSettings({
                      mfeTrailKeepFrac: Math.min(
                        0.9,
                        Math.max(0.1, (Number(e.target.value) || 50) / 100)
                      ),
                    })
                  }
                  className="w-12 rounded-md border border-[#cfe0ee] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-sky-ink"
                  title="Exit when open profit falls below this % of peak MFE"
                />
                <span className="font-normal text-sky-ink/50">%</span>
              </>
            ) : (
              <span className="font-normal text-sky-ink/45">off</span>
            )}
          </label>
          <span className="hidden h-4 w-px bg-[#cfe0ee] sm:inline-block" aria-hidden />
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-sky-ink/75">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
              checked={Boolean(settings.enforceMaxLossLimit)}
              onChange={(e) => updateSettings({ enforceMaxLossLimit: e.target.checked })}
            />
            Max loss limit
            {settings.enforceMaxLossLimit ? (
              <input
                type="number"
                min={100}
                max={100000}
                step={100}
                value={settings.dailyMaxLoss || 1500}
                onChange={(e) =>
                  updateSettings({
                    dailyMaxLoss: Math.max(100, Math.min(100000, Number(e.target.value) || 1500)),
                  })
                }
                className="w-20 rounded-md border border-[#cfe0ee] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-sky-ink"
                title="Daily max loss in ₹"
              />
            ) : (
              <span className="font-normal text-emerald-700/80">off</span>
            )}
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-sky-ink/75">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
              checked={Boolean(settings.enforceMaxTradesLimit)}
              onChange={(e) => updateSettings({ enforceMaxTradesLimit: e.target.checked })}
            />
            Max trades/day
            {settings.enforceMaxTradesLimit ? (
              <input
                type="number"
                min={1}
                max={99}
                value={settings.maxTradesPerDay || 10}
                onChange={(e) =>
                  updateSettings({
                    maxTradesPerDay: Math.max(1, Math.min(99, Number(e.target.value) || 10)),
                  })
                }
                className="w-14 rounded-md border border-[#cfe0ee] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-sky-ink"
              />
            ) : (
              <span className="font-normal text-emerald-700/80">off</span>
            )}
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-sky-ink/75">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
              checked={Boolean(settings.enforceDailyTargetLimit)}
              onChange={(e) =>
                updateSettings({ enforceDailyTargetLimit: e.target.checked })
              }
            />
            Daily target
            {settings.enforceDailyTargetLimit ? (
              <input
                type="number"
                min={100}
                max={100000}
                step={100}
                value={settings.dailyProfitTarget || 2500}
                onChange={(e) =>
                  updateSettings({
                    dailyProfitTarget: Math.max(
                      100,
                      Math.min(100000, Number(e.target.value) || 2500)
                    ),
                  })
                }
                className="w-20 rounded-md border border-[#cfe0ee] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-sky-ink"
                title="Daily profit target in ₹"
              />
            ) : (
              <span className="font-normal text-emerald-700/80">off</span>
            )}
          </label>
        </div>

        <p className="mt-2 text-[11px] text-sky-ink/45">
          {scanScope === 'full'
            ? 'Full F&O (~190) — slower, widest net.'
            : scanScope === 'focus'
              ? `Focus list (${momentumFocus.length || 'empty → falls back to liquid'}) — use Momentum refresh first.`
              : 'Liquid 25 — fastest, best for session auto paper.'}{' '}
          Set <strong>SL / Tgt</strong> in premium points (e.g. 10 / 18). Jimbo{' '}
          <strong>does not trade</strong> stock options with premium{' '}
          <strong>below ₹{JIMBO_MIN_OPTION_ENTRY_PREMIUM}</strong> (skipped at entry; any open
          under that floor is flattened at live Upstox LTP). With{' '}
          <strong>MFE profit trail</strong> on: after peak profit hits the arm (default 7 pts),
          exit if open profit falls below keep% of that peak (Sector 7 A/B style). Hard Tgt still
          books at full target. Optional day ₹ limits stay off by default — auto runs until{' '}
          <strong>15:12 IST</strong>. Still one open trade at a time.
        </p>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Universe
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {scanScope === 'full'
              ? NSE_EQUITY_FO_COUNT
              : scanScope === 'focus'
                ? momentumFocus.length || '—'
                : liquidSymbols.length}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            {scanScope === 'full'
              ? 'Full F&O · CCI scan universe'
              : scanScope === 'focus'
                ? 'Focus chips · CCI scan universe'
                : 'Liquid names · CCI scan universe'}
          </p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Today P&amp;L
          </p>
          <p
            className={`mt-1 font-display text-2xl font-semibold ${
              dayPnlLive > 0
                ? 'text-emerald-600'
                : dayPnlLive < 0
                  ? 'text-rose-500'
                  : 'text-sky-ink'
            }`}
          >
            {formatCurrency(dayPnlLive)}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            {openTrade
              ? `closed ${formatCurrency(dayPnl)} · open ${formatCurrency(openUnrealized)}`
              : 'realized'}
          </p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Actionable
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {actionable.length}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            {lastScanAt
              ? `Last scan ${new Date(lastScanAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Not scanned yet'}
          </p>
        </div>
      </div>

      {/* Collapsible full NSE F&O watchlist — main window */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white shadow-sm">
        <button
          type="button"
          onClick={toggleWatchlist}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sky-soft/40"
        >
          <div className="flex min-w-0 items-center gap-2">
            <List className="h-4 w-4 shrink-0 text-sky-deep" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold text-sky-ink">
                NSE F&amp;O watchlist
              </p>
              <p className="text-[11px] text-sky-ink/50">
                {NSE_EQUITY_FO_COUNT} equity F&amp;O names · live LTP · CCI scan filters this list
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#cfe0ee] bg-sky-soft/50 px-2.5 py-1 text-[11px] font-semibold text-sky-deep">
            {watchlistOpen ? (
              <>
                Collapse <ChevronDown className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Expand <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        </button>

        {watchlistOpen ? (
          <div className="border-t border-[#e8eef3] px-4 pb-4 pt-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-ink/35" />
              <input
                type="search"
                value={watchQuery}
                onChange={(e) => setWatchQuery(e.target.value)}
                placeholder="Search symbol or name…"
                className="w-full rounded-xl border border-[#cfe0ee] bg-white py-2 pl-9 pr-3 text-sm text-sky-ink outline-none focus:border-sky-mid"
              />
            </div>
            <p className="mt-2 text-[11px] text-sky-ink/45">
              Showing {displayFo.length} of {NSE_EQUITY_FO_COUNT}
              {scanSymbols.size ? ` · ${scanSymbols.size} in active CCI scan` : ''}
              {foQuotesLive
                ? ` · LTP live (Upstox · ${Object.keys(foQuotes).length})`
                : foQuoteError
                  ? ` · ${foQuoteError}`
                  : ' · connect Upstox for LTP'}
              {chartPeekOn
                ? ' · Peek ON — hover a row to show mini chart'
                : ' · Peek OFF (top bar) — turn Peek charts ON to see mini charts on hover'}
              {foSort?.key === 'ltp'
                ? foSort.dir === 'desc'
                  ? ' · sorted Price high → low'
                  : ' · sorted Price low → high'
                : foSort?.key === 'chg'
                  ? foSort.dir === 'desc'
                    ? ' · sorted ₹ chg high → low'
                    : ' · sorted ₹ chg low → high'
                  : foSort?.key === 'pct'
                    ? foSort.dir === 'desc'
                      ? ' · sorted % chg high → low'
                      : ' · sorted % chg low → high'
                    : foSort?.key === 'scan'
                      ? foSort.dir === 'desc'
                        ? ' · sorted Scan Active → Watch'
                        : ' · sorted Scan Watch → Active'
                      : ' · click Price / Chg ₹ / Chg % / Scan to sort'}
            </p>
            <p className="mt-1 text-[11px] text-sky-ink/50">
              <span className="font-semibold text-emerald-700">Active</span> = passed CCI setup on
              last scan (shown in CCI setups with live ATM).{' '}
              <span className="font-semibold text-sky-ink/60">Watch</span> = on the F&amp;O list with
              live equity LTP — scanned every CCI run.
            </p>
            <div className="mt-3 max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-[#e8eef3] [scrollbar-width:thin]">
              <table className="w-full min-w-[860px] text-left text-[12px]">
                <thead className="sticky top-0 z-10 border-b border-[#e8eef3] bg-[#f8fafc] text-[10px] uppercase tracking-wide text-sky-ink/45">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Symbol</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <FoSortHeader
                      label="Price"
                      sortKey="ltp"
                      activeKey={foSort?.key ?? null}
                      dir={foSort?.dir ?? null}
                      onCycle={cycleFoSort}
                      title="Sort by price: high→low, then low→high, then clear"
                    />
                    <FoSortHeader
                      label="Chg ₹"
                      sortKey="chg"
                      activeKey={foSort?.key ?? null}
                      dir={foSort?.dir ?? null}
                      onCycle={cycleFoSort}
                      title="Sort by net ₹ change: high→low, then low→high, then clear"
                    />
                    <FoSortHeader
                      label="Chg %"
                      sortKey="pct"
                      activeKey={foSort?.key ?? null}
                      dir={foSort?.dir ?? null}
                      onCycle={cycleFoSort}
                      title="Sort by % change: high→low, then low→high, then clear"
                    />
                    <th className="px-3 py-2 font-semibold">Lot</th>
                    <FoSortHeader
                      label="Scan"
                      sortKey="scan"
                      align="left"
                      activeKey={foSort?.key ?? null}
                      dir={foSort?.dir ?? null}
                      onCycle={cycleFoSort}
                      title="Sort by Scan: Active first, then Watch first, then clear"
                    />
                  </tr>
                </thead>
                <tbody>
                  {displayFo.map((row, i) => {
                    const inScan = scanSymbols.has(row.symbol);
                    const quote = foQuotes[row.symbol];
                    const chg = quote?.change;
                    const pct = quote?.changePct;
                    const chgTone =
                      chg == null
                        ? 'text-sky-ink/30'
                        : chg >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600';
                    const pctTone =
                      pct == null
                        ? 'text-sky-ink/30'
                        : pct >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600';
                    return (
                      <tr
                        key={row.symbol}
                        className="border-b border-slate-50 last:border-0 hover:bg-sky-soft/30"
                        onMouseEnter={(e) => peekFoRow(row, e)}
                        onMouseLeave={leaveFoPeek}
                        onMouseMove={(e) => {
                          if (chartPeekOn) moveChartPeek(e.clientX, e.clientY);
                        }}
                      >
                        <td className="px-3 py-1.5 tabular-nums text-sky-ink/40">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <SymbolChartLink
                            symbol={row.symbol}
                            exchange="NSE"
                            name={row.name}
                            hoverPeek={false}
                            className="min-h-[28px] text-[12px] font-semibold"
                          >
                            {row.symbol}
                          </SymbolChartLink>
                        </td>
                        <td className="px-3 py-1.5 text-sky-ink/75">{row.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-sky-ink">
                          {quote && quote.lastPrice > 0
                            ? quote.lastPrice.toLocaleString('en-IN', {
                                maximumFractionDigits: 2,
                              })
                            : <span className="font-normal text-sky-ink/30">—</span>}
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${chgTone}`}>
                          {chg == null
                            ? '—'
                            : `${chg >= 0 ? '+' : ''}${chg.toLocaleString('en-IN', {
                                maximumFractionDigits: 2,
                              })}`}
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${pctTone}`}>
                          {pct == null
                            ? '—'
                            : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-sky-ink/60">{row.lotSize}</td>
                        <td className="px-3 py-1.5">
                          {inScan ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="text-[10px] text-sky-ink/35">Watch</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {displayFo.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sky-ink/45">No match for “{watchQuery}”.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={locked || !actionable.length || Boolean(openTrade)}
          onClick={() => takeSignal()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          <Target className="h-4 w-4" />
          Take best paper trade
        </button>
        <button
          type="button"
          disabled={!openTrade}
          onClick={() => closeOpen()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
        >
          <Square className="h-4 w-4" />
          Exit trade
        </button>
        <button
          type="button"
          disabled={!trades.length}
          onClick={() => clearPaperTrades()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
        >
          Clear paper trades
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <section className="overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white lg:col-span-3">
          <button
            type="button"
            onClick={toggleCciSetups}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sky-soft/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Radar className="h-4 w-4 shrink-0 text-sky-deep" strokeWidth={1.75} />
              <div className="min-w-0">
                <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                  CCI setups (F&amp;O matches · {cciMatches.length})
                </h2>
                <p className="text-[11px] text-sky-ink/50">
                  Live ATM CE/PE ideas from last scan · click Expand for full table
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#cfe0ee] bg-sky-soft/50 px-2.5 py-1 text-[11px] font-semibold text-sky-deep">
              {cciSetupsOpen ? (
                <>
                  Collapse <ChevronDown className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Expand <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </span>
          </button>

          {cciSetupsOpen ? (
            <div className="border-t border-[#e8eef3] px-4 pb-4 pt-3">
              {cciMatches.length === 0 ? (
                <p className="py-6 text-center text-sm text-sky-ink/45">
                  Click Scan to run CCI on the NSE F&amp;O watchlist. Matches show live ATM option
                  premium.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Stock"
                          className="pb-2"
                          active={sort.key === 'symbol'}
                          dir={sort.dir}
                          onClick={() => toggle('symbol')}
                        />
                        <SortableTh
                          label="CCI"
                          className="pb-2"
                          active={sort.key === 'cci'}
                          dir={sort.dir}
                          onClick={() => toggle('cci')}
                        />
                        <SortableTh
                          label="Bias"
                          className="pb-2"
                          active={sort.key === 'bias'}
                          dir={sort.dir}
                          onClick={() => toggle('bias')}
                        />
                        <SortableTh
                          label="ATM LTP"
                          className="pb-2"
                          active={sort.key === 'atm'}
                          dir={sort.dir}
                          onClick={() => toggle('atm')}
                        />
                        <th className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-ink/40">
                          Lot
                        </th>
                        <SortableTh
                          label="Conf"
                          className="pb-2"
                          active={sort.key === 'conf'}
                          dir={sort.dir}
                          onClick={() => toggle('conf')}
                        />
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {displaySignals.slice(0, 20).map((s) => (
                        <tr key={s.id} className="border-t border-[#e8f0f6] align-top">
                          <td className="py-2.5 pr-2">
                            <p className="font-semibold text-sky-ink">{s.symbol}</p>
                            <p className="text-[11px] text-sky-ink/45">
                              {s.name} · spot ₹{s.spot.toFixed(1)}
                            </p>
                            <p className="mt-1 max-w-[220px] text-[10px] leading-snug text-sky-ink/50">
                              {s.reason}
                            </p>
                            <p className="max-w-[220px] text-[10px] leading-snug text-sky-ink/40">
                              {s.paDetail}
                            </p>
                          </td>
                          <td className="py-2.5 text-sky-ink/70">
                            <span className="tabular-nums">
                              {s.cciPrev} → {s.cciCurr}
                            </span>
                            <p className="text-[10px] text-sky-ink/40">CCI({s.cciPeriod})</p>
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                s.bias === 'CE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : s.bias === 'PE'
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'bg-sky-soft text-sky-ink/50'
                              }`}
                            >
                              {s.bias}
                            </span>
                          </td>
                          <td className="py-2.5 text-sky-ink/70">
                            {s.bias === 'FLAT'
                              ? '—'
                              : s.premium > 0
                                ? `${s.strike} ${s.bias} · ₹${s.premium.toFixed(2)}`
                                : `${s.strike} ${s.bias} · ATM pending`}
                          </td>
                          <td className="py-2.5 tabular-nums text-sky-ink/60">{s.lotSize}</td>
                          <td className="py-2.5 text-sky-ink/60">{s.confidence}%</td>
                          <td className="py-2.5 text-right">
                            {s.bias !== 'FLAT' && (
                              <button
                                type="button"
                                disabled={locked || Boolean(openTrade)}
                                onClick={() => takeSignal(s)}
                                className="text-[12px] font-semibold text-sky-deep hover:underline disabled:opacity-40"
                              >
                                Trade
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-1 flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
                <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                  Ask {JIMBO_NAME}
                </h2>
              </div>
              {chat.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="text-[11px] font-semibold text-sky-ink/40 hover:text-sky-deep"
                >
                  Clear
                </button>
              )}
            </div>
            <div
              className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl bg-sky-soft/50 p-3"
              style={{ minHeight: 200, maxHeight: 280 }}
            >
              {chat.length === 0 ? (
                <p className="py-8 text-center text-sm text-sky-ink/45">
                  Ask about CCI scans or stock option ideas.
                </p>
              ) : (
                chat.map((m) => (
                  <div
                    key={m.id}
                    className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'ml-6 bg-sky-deep text-white'
                        : 'mr-4 bg-white text-sky-ink/80 ring-1 ring-[#cfe0ee]'
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!prompt.trim()) return;
                ask(prompt);
                setPrompt('');
              }}
            >
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask Jimbo…"
                className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-sky-deep px-3 py-2 text-white"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Scan', 'Suggest trade', 'Rules'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => ask(c)}
                  className="rounded-full bg-sky-soft px-2.5 py-1 text-[11px] font-semibold text-sky-deep"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Activity</h2>
            </div>
            <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto text-[12px] text-sky-ink/60">
              {events.length === 0 ? (
                <p>No events yet.</p>
              ) : (
                [...events].reverse().map((e) => (
                  <p key={e.id}>
                    <span className="text-sky-ink/35">
                      {new Date(e.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    {e.text}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-[15px] font-semibold text-sky-ink">
              Paper study &amp; backup
            </p>
            <p className="mt-0.5 max-w-2xl text-[11px] text-sky-ink/50">
              Upstox original prices — equity V3 + real option OHLC. Trades are{' '}
              <strong>intraday only</strong> (flat same day by 15:12, no overnight). Live paper
              auto-saves under <code className="text-[10px]">.data/jimbo/trades/paper/</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBacktestSettingsOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-[12px] font-semibold text-sky-ink hover:bg-sky-soft"
            >
              {backtestSettingsOpen ? (
                <>
                  Hide settings <ChevronDown className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Show settings <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
            <button
              type="button"
              disabled={backtesting}
              onClick={() => {
                setBacktesting(true);
                setBacktestSummary(null);
                setBacktestResult(null);
                setBacktestStatus(
                  `Running Upstox backtest ${btFromDate} → ${btToDate} · SL ${btStopLoss} / Tgt ${btTarget} · intraday · real option OHLC. Long ranges can take 3–8 minutes — keep this tab open.`
                );
                void runPaperBacktest({
                  fromDate: btFromDate,
                  toDate: btToDate,
                  maxTradesTotal: btMaxTotal > 0 ? btMaxTotal : 0,
                  btStopLossPoints: btStopLoss,
                  btTargetPoints: btTarget,
                  btMaxLotsPerTrade: btLots,
                  btMinConfidence: btMinConf,
                  btMaxTradesPerDay: btMaxPerDay,
                  btEnforceMaxTradesPerDay: btEnforcePerDay,
                  btEnforceMaxLoss: btEnforceMaxLoss,
                  btDailyMaxLoss: btDailyMaxLoss,
                  btEnforceDailyTarget: btEnforceTarget,
                  btDailyProfitTarget: btDailyTarget,
                  primaryTimeframe: settings.primaryTimeframe,
                  scanScope: settings.scanScope === 'full' ? 'liquid' : settings.scanScope,
                })
                  .then((data) => {
                    if (!data || !data.ok) {
                      setBacktestSummary(
                        'Backtest did not finish — connect Upstox, keep this tab open (1y can take 5–8 min), or try Last 30 days first to verify.'
                      );
                      return;
                    }
                    const result = data as JimboBacktestResult & { backupPath?: string };
                    setBacktestResult(result);
                    setBacktestTradesOpen(true);
                    if (result.fromDate !== btFromDate || result.toDate !== btToDate) {
                      setBtFromDate(result.fromDate);
                      setBtToDate(result.toDate);
                    }
                    setBacktestSummary(
                      `${result.fromDate} → ${result.toDate} · ${result.trades.length} trades · win ${result.winRate}% · net ₹${result.netPnl} · ${result.candleOk}/${result.scanned} names · SL ${btStopLoss}/Tgt ${btTarget}${
                        result.backupPath ? ` · saved ${result.backupPath}` : ''
                      }`
                    );
                  })
                  .finally(() => {
                    setBacktesting(false);
                    setBacktestStatus(null);
                  });
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-deep px-3.5 py-2 text-[12px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
            >
              <Target className="h-3.5 w-3.5" />
              {backtesting ? 'Backtesting… (wait)' : 'Run Upstox backtest'}
            </button>
            <button
              type="button"
              disabled={backingUp}
              onClick={() => {
                setBackingUp(true);
                void backupPaperNow().finally(() => setBackingUp(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-3.5 py-2 text-[12px] font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
            >
              <HardDrive className="h-3.5 w-3.5" />
              {backingUp ? 'Saving…' : 'Backup paper now'}
            </button>
            <button
              type="button"
              disabled={repairingPaper || !trades.length}
              onClick={() => {
                setRepairingPaper(true);
                void repairPaperLive().finally(() => setRepairingPaper(false));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
              title="Reprice theoretical SL/Tgt exits and attach Upstox instrument keys"
            >
              {repairingPaper ? 'Repairing…' : 'Repair paper → Upstox live'}
            </button>
          </div>
        </div>

        {backtestSettingsOpen ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-[#e8eef3] bg-sky-soft/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              From date
              <input
                type="date"
                value={btFromDate}
                max={btToDate}
                onChange={(e) => setBtFromDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              To date
              <input
                type="date"
                value={btToDate}
                min={btFromDate}
                max={istToday}
                onChange={(e) => setBtToDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Stop loss (premium pts)
              <input
                type="number"
                min={1}
                max={200}
                value={btStopLoss}
                onChange={(e) => setBtStopLoss(Math.max(1, Number(e.target.value) || 25))}
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Target (premium pts)
              <input
                type="number"
                min={1}
                max={400}
                value={btTarget}
                onChange={(e) => setBtTarget(Math.max(1, Number(e.target.value) || 40))}
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Lots / trade
              <input
                type="number"
                min={1}
                max={3}
                value={btLots}
                onChange={(e) =>
                  setBtLots(Math.max(1, Math.min(3, Number(e.target.value) || 1)))
                }
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Min confidence %
              <input
                type="number"
                min={50}
                max={95}
                value={btMinConf}
                onChange={(e) =>
                  setBtMinConf(Math.max(50, Math.min(95, Number(e.target.value) || 75)))
                }
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Max trades / day
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={btEnforcePerDay}
                  onChange={(e) => setBtEnforcePerDay(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
                />
                <input
                  type="number"
                  min={1}
                  max={50}
                  disabled={!btEnforcePerDay}
                  value={btMaxPerDay}
                  onChange={(e) =>
                    setBtMaxPerDay(Math.max(1, Math.min(50, Number(e.target.value) || 5)))
                  }
                  className="w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink disabled:opacity-40"
                />
              </div>
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70">
              Max trades total (0 = off)
              <input
                type="number"
                min={0}
                max={500}
                value={btMaxTotal}
                onChange={(e) =>
                  setBtMaxTotal(Math.max(0, Math.min(500, Number(e.target.value) || 0)))
                }
                className="mt-1 w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70 sm:col-span-2">
              Day max loss ₹
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={btEnforceMaxLoss}
                  onChange={(e) => setBtEnforceMaxLoss(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
                />
                <span className="text-[10px] text-sky-ink/45">{btEnforceMaxLoss ? 'ON' : 'off'}</span>
                <input
                  type="number"
                  min={100}
                  disabled={!btEnforceMaxLoss}
                  value={btDailyMaxLoss}
                  onChange={(e) => setBtDailyMaxLoss(Math.max(100, Number(e.target.value) || 1500))}
                  className="w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink disabled:opacity-40"
                />
              </div>
            </label>
            <label className="block text-[11px] font-semibold text-sky-ink/70 sm:col-span-2">
              Day profit target ₹
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={btEnforceTarget}
                  onChange={(e) => setBtEnforceTarget(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#cfe0ee]"
                />
                <span className="text-[10px] text-sky-ink/45">{btEnforceTarget ? 'ON' : 'off'}</span>
                <input
                  type="number"
                  min={100}
                  disabled={!btEnforceTarget}
                  value={btDailyTarget}
                  onChange={(e) => setBtDailyTarget(Math.max(100, Number(e.target.value) || 2500))}
                  className="w-full rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1.5 text-sm font-semibold text-sky-ink disabled:opacity-40"
                />
              </div>
            </label>
            <p className="sm:col-span-2 lg:col-span-4 text-[11px] text-sky-ink/45">
              Uses desk TF <strong>{settings.primaryTimeframe}</strong> and Liquid names (capped for
              long runs). Upstox real equity + option OHLC, intraday only. Defaults:{' '}
              <strong>SL 10 / Tgt 18</strong>, no day/total trade cap — so every valid CCI day can
              trade (still max 1 open at a time). 1-year runs chunk history (~3–8 min).
            </p>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => {
                  setBtStopLoss(10);
                  setBtTarget(18);
                  setBtLots(1);
                  setBtMinConf(75);
                  setBtEnforcePerDay(false);
                  setBtMaxTotal(0);
                  setBtEnforceMaxLoss(false);
                  setBtEnforceTarget(false);
                  const d = new Date();
                  d.setFullYear(d.getFullYear() - 1);
                  setBtFromDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
                  setBtToDate(istToday);
                }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                1 year · SL10 / Tgt18 · no trade caps
              </button>
              <button
                type="button"
                onClick={() => {
                  setBtFromDate(istMonthAgo);
                  setBtToDate(istToday);
                }}
                className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft"
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setBtFromDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
                  setBtToDate(istToday);
                }}
                className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft"
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => {
                  // Previous calendar month (e.g. in Aug → July 1–31)
                  const now = new Date(
                    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
                  );
                  const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
                  const lastPrev = new Date(firstThis.getTime() - 86400000);
                  const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
                  const fmt = (x: Date) =>
                    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(
                      x.getDate()
                    ).padStart(2, '0')}`;
                  setBtFromDate(fmt(firstPrev));
                  setBtToDate(fmt(lastPrev));
                }}
                className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft"
              >
                Previous calendar month
              </button>
              <button
                type="button"
                onClick={() => {
                  setBtStopLoss(10);
                  setBtTarget(18);
                  setBtLots(1);
                  setBtMinConf(75);
                  setBtMaxPerDay(10);
                  setBtEnforcePerDay(false);
                  setBtMaxTotal(0);
                  setBtEnforceMaxLoss(false);
                  setBtEnforceTarget(false);
                }}
                className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft"
              >
                Reset study defaults
              </button>
            </div>
          </div>
        ) : null}
        {backtestStatus ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-ink">
            {backtestStatus}
          </p>
        ) : null}
        {backtestSummary ? (
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[12px] font-medium text-emerald-900">
            {backtestSummary}
          </p>
        ) : null}
        {backtestResult?.note ? (
          <p className="mt-2 text-[11px] leading-relaxed text-sky-ink/50">{backtestResult.note}</p>
        ) : null}
        {backtestResult && backtestResult.trades.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e8eef3]">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-soft/30 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setBacktestTradesOpen((v) => !v)}
                className="flex items-center gap-2 text-left"
              >
                <span className="text-[13px] font-semibold text-sky-ink">
                  Backtest trades — full details ({backtestResult.trades.length}) ·{' '}
                  {backtestResult.fromDate} → {backtestResult.toDate}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-deep">
                  {backtestTradesOpen ? (
                    <>
                      Collapse <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Expand <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(backtestResult, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `jimbo-backtest-${backtestResult.fromDate}-${backtestResult.toDate}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-lg border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink hover:bg-sky-soft"
              >
                Download JSON
              </button>
            </div>
            {backtestTradesOpen ? (
              <div className="max-h-[520px] overflow-auto px-2 pb-2">
                <table className="w-full min-w-[1100px] text-left text-[12px]">
                  <thead className="sticky top-0 z-[1] bg-white text-[10px] uppercase tracking-wide text-sky-ink/40">
                    <tr>
                      <th className="px-2 py-2 font-semibold">#</th>
                      <th className="px-2 py-2 font-semibold">Entry</th>
                      <th className="px-2 py-2 font-semibold">Exit</th>
                      <th className="px-2 py-2 font-semibold">Stock / strike</th>
                      <th className="px-2 py-2 font-semibold">CCI cross</th>
                      <th className="px-2 py-2 font-semibold">Side</th>
                      <th className="px-2 py-2 font-semibold">Spot</th>
                      <th className="px-2 py-2 font-semibold">Lots×size</th>
                      <th className="px-2 py-2 font-semibold">Entry ₹</th>
                      <th className="px-2 py-2 font-semibold">Exit ₹</th>
                      <th className="px-2 py-2 font-semibold">P&amp;L</th>
                      <th className="px-2 py-2 font-semibold">Exit why</th>
                      <th className="px-2 py-2 font-semibold">Conf</th>
                      <th className="px-2 py-2 font-semibold">PA / note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResult.trades.map((t, i) => (
                      <tr key={t.id} className="border-t border-[#e8f0f6] align-top">
                        <td className="px-2 py-2 text-sky-ink/40">{i + 1}</td>
                        <td className="px-2 py-2 tabular-nums text-sky-ink/70">
                          {new Date(t.entryAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-sky-ink/70">
                          {new Date(t.exitAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-2 py-2 font-semibold text-sky-ink">
                          {t.symbol} {t.strike} {t.option}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-sky-ink/70">
                          <p>
                            {t.cciPrev} → {t.cciCurr}
                          </p>
                          <p className="text-[10px] text-sky-ink/40">
                            CCI({t.cciPeriod}) ·{' '}
                            {t.crossDir === 'up_through_zero' ? '− to +' : '+ to −'}
                          </p>
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              t.option === 'CE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-600'
                            }`}
                          >
                            ATM {t.option}
                          </span>
                        </td>
                        <td className="px-2 py-2 tabular-nums">₹{t.spot.toFixed(1)}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {t.lots} × {t.lotSize} = {t.lots * t.lotSize}
                        </td>
                        <td className="px-2 py-2 tabular-nums">₹{t.entryPremium.toFixed(2)}</td>
                        <td className="px-2 py-2 tabular-nums">₹{t.exitPremium.toFixed(2)}</td>
                        <td
                          className={`px-2 py-2 font-semibold tabular-nums ${
                            t.pnl > 0
                              ? 'text-emerald-600'
                              : t.pnl < 0
                                ? 'text-rose-500'
                                : 'text-sky-ink/50'
                          }`}
                        >
                          {formatCurrency(t.pnl)}
                        </td>
                        <td className="px-2 py-2 text-sky-ink/60">{t.exitWhy}</td>
                        <td className="px-2 py-2 tabular-nums text-sky-ink/60">{t.confidence}%</td>
                        <td className="max-w-[260px] px-2 py-2 text-[10px] leading-snug text-sky-ink/50">
                          <p>{t.paDetail}</p>
                          <p className="mt-0.5 text-sky-ink/40">{t.note}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : backtestResult && backtestResult.trades.length === 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-950">
            {backtestResult.emptyReason === 'no_history_in_range' ? (
              <>
                <p className="font-semibold">0 trades — selected dates have no Yahoo candle history</p>
                <p className="mt-1 leading-relaxed">
                  You chose <strong>{backtestResult.fromDate}</strong> →{' '}
                  <strong>{backtestResult.toDate}</strong>, but Yahoo only returned about{' '}
                  <strong>{backtestResult.dataFromDate || '?'}</strong> →{' '}
                  <strong>{backtestResult.dataToDate || '?'}</strong> for{' '}
                  {backtestResult.timeframe}. Intraday (5m/15m) is only ~last 30 days. Use{' '}
                  <strong>Last 7 days</strong> / <strong>Last 30 days</strong>, or pick dates inside
                  that available window, then run again.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">0 trades — no CCI setups in this window</p>
                <p className="mt-1 leading-relaxed">
                  Candles existed in range ({backtestResult.barsInWindow ?? 0} bars) but no CCI
                  zero-cross + PA confirm passed your filters (TF {backtestResult.timeframe}, min
                  conf, scope).
                </p>
              </>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Jimbo trades (paper stock options)
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={backingUp}
              onClick={() => {
                setBackingUp(true);
                void backupPaperNow().finally(() => setBackingUp(false));
              }}
              className="rounded-lg border border-[#cfe0ee] px-3 py-1.5 text-[12px] font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
            >
              Backup
            </button>
            <button
              type="button"
              disabled={!trades.length}
              onClick={() => clearPaperTrades()}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
            >
              Clear paper trades
            </button>
          </div>
        </div>

        {openTrade ? (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      liveForOpen ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                  Open · {liveForOpen ? 'live Upstox' : 'waiting Upstox…'}
                  {liveForOpen ? (
                    <span className="font-normal normal-case tracking-normal text-sky-ink/45">
                      {liveForOpen.latencyMs}ms ·{' '}
                      {new Date(liveForOpen.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-base font-bold text-sky-deep">
                  {openTrade.symbol} {openTrade.strike} {openTrade.option}{' '}
                  <span className="text-[12px] font-medium text-sky-ink/55">
                    {openTrade.tradingSymbol || ''}
                  </span>
                </p>
                <p className="text-[11px] text-sky-ink/50">
                  Opened{' '}
                  {new Date(openTrade.at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-sky-ink/45">Live P&amp;L</div>
                {(() => {
                  const mark = displayMark ?? openTrade.entryPremium;
                  const pts = mark - openTrade.entryPremium;
                  const pnl = Math.round(pts * openTrade.lotSize * openTrade.lots);
                  return (
                    <>
                      <div
                        className={`text-2xl font-bold tabular-nums ${
                          pnl > 0
                            ? 'text-emerald-600'
                            : pnl < 0
                              ? 'text-rose-500'
                              : 'text-sky-ink/50'
                        }`}
                      >
                        {formatCurrency(pnl)}
                      </div>
                      <div
                        className={`text-[11px] tabular-nums ${
                          pts > 0
                            ? 'text-emerald-600'
                            : pts < 0
                              ? 'text-rose-500'
                              : 'text-sky-ink/45'
                        }`}
                      >
                        {pts >= 0 ? '+' : ''}
                        {pts.toFixed(2)} pts · qty {openTrade.lots * openTrade.lotSize}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3 md:grid-cols-6">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <div className="text-[10px] text-sky-ink/45">Entry</div>
                <div className="font-semibold tabular-nums">
                  ₹{openTrade.entryPremium.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5">
                <div className="text-[10px] text-sky-ink/45">Live LTP</div>
                <div className="font-bold tabular-nums text-sky-deep">
                  ₹{(displayMark ?? openTrade.entryPremium).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                <div className="text-[10px] text-emerald-800/70">High after buy</div>
                <div className="font-semibold tabular-nums text-emerald-800">
                  ₹{(displayPeak ?? openTrade.entryPremium).toFixed(2)}
                  <span className="ml-1 text-[10px] font-medium">
                    (+
                    {(
                      (displayPeak ?? openTrade.entryPremium) - openTrade.entryPremium
                    ).toFixed(2)}
                    )
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-rose-50 px-2 py-1.5">
                <div className="text-[10px] text-rose-800/70">Low after buy</div>
                <div className="font-semibold tabular-nums text-rose-800">
                  ₹{(displayLow ?? openTrade.entryPremium).toFixed(2)}
                  <span className="ml-1 text-[10px] font-medium">
                    (−
                    {(
                      openTrade.entryPremium - (displayLow ?? openTrade.entryPremium)
                    ).toFixed(2)}
                    )
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <div className="text-[10px] text-sky-ink/45">Lots × size</div>
                <div className="font-semibold">
                  {openTrade.lots} × {openTrade.lotSize}
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => closeOpen()}
                  className="w-full rounded-lg bg-rose-500 px-2.5 py-2 text-[12px] font-bold text-white hover:bg-rose-600"
                >
                  Exit @ live LTP
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-sky-ink/45">No trades yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-sky-ink/40">
                <tr>
                  <th className="pb-2 font-semibold">Opened</th>
                  <th className="pb-2 font-semibold">Closed</th>
                  <th className="pb-2 font-semibold">Contract</th>
                  <th className="pb-2 font-semibold">Qty</th>
                  <th className="pb-2 font-semibold">Entry</th>
                  <th className="pb-2 font-semibold">Live / Exit</th>
                  <th className="pb-2 font-semibold">High</th>
                  <th className="pb-2 font-semibold">Low</th>
                  <th className="pb-2 font-semibold">P&amp;L</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Details</th>
                  <th className="pb-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t) => {
                  const openDetail = expandedTradeId === t.id;
                  const rowLive =
                    t.status === 'open' && liveMark && liveMark.tradeId === t.id
                      ? liveMark
                      : null;
                  const mark =
                    t.status === 'open'
                      ? (rowLive?.ltp ?? t.markPremium ?? t.entryPremium)
                      : t.exitPremium;
                  const livePts =
                    t.status === 'open' && mark != null
                      ? mark - t.entryPremium
                      : null;
                  const livePnl =
                    livePts != null
                      ? Math.round(livePts * t.lotSize * t.lots)
                      : t.pnl;
                  const high = rowLive?.peak ?? t.peakPremium ?? t.entryPremium;
                  const low = rowLive?.low ?? t.lowPremium ?? t.entryPremium;
                  return (
                    <Fragment key={t.id}>
                      <tr className="border-t border-[#e8f0f6] align-top">
                        <td className="py-2.5 text-[12px] tabular-nums text-sky-ink/60">
                          {new Date(t.at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 text-[12px] tabular-nums text-sky-ink/60">
                          {t.exitAt
                            ? new Date(t.exitAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="py-2.5 font-medium text-sky-ink">
                          {t.symbol} {t.strike} {t.option}
                          {t.tradingSymbol ? (
                            <div className="text-[10px] font-normal text-sky-ink/45">
                              {t.tradingSymbol}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 tabular-nums">{t.lots * t.lotSize}</td>
                        <td className="py-2.5 tabular-nums">₹{t.entryPremium.toFixed(2)}</td>
                        <td className="py-2.5 tabular-nums">
                          {t.status === 'open' ? (
                            <span className="font-semibold text-sky-deep">
                              ₹{(t.markPremium ?? t.entryPremium).toFixed(2)}
                              <span className="ml-1 text-[10px] font-medium text-sky-ink/45">
                                live
                              </span>
                            </span>
                          ) : t.exitPremium != null ? (
                            `₹${t.exitPremium.toFixed(2)}`
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 tabular-nums text-emerald-700">
                          ₹{high.toFixed(2)}
                          <span className="ml-1 text-[10px] text-emerald-700/70">
                            (+{(high - t.entryPremium).toFixed(2)})
                          </span>
                        </td>
                        <td className="py-2.5 tabular-nums text-rose-600">
                          ₹{low.toFixed(2)}
                          <span className="ml-1 text-[10px] text-rose-600/70">
                            (−{(t.entryPremium - low).toFixed(2)})
                          </span>
                        </td>
                        <td
                          className={`py-2.5 font-semibold ${
                            (livePnl ?? 0) > 0
                              ? 'text-emerald-600'
                              : (livePnl ?? 0) < 0
                                ? 'text-rose-500'
                                : 'text-sky-ink/50'
                          }`}
                        >
                          {livePnl != null ? formatCurrency(livePnl) : '—'}
                          {t.status === 'open' ? (
                            <span className="ml-1 text-[10px] font-medium text-sky-ink/40">
                              live
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 capitalize text-sky-ink/60">{t.status}</td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTradeId((id) => (id === t.id ? null : t.id))
                            }
                            className="text-[11px] font-semibold text-sky-deep hover:underline"
                          >
                            {openDetail ? 'Hide' : 'Show'}
                          </button>
                        </td>
                        <td className="py-2.5">
                          {t.status === 'open' ? (
                            <button
                              type="button"
                              onClick={() => closeOpen()}
                              className="rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-600"
                            >
                              Exit
                            </button>
                          ) : (
                            <span className="text-sky-ink/30">—</span>
                          )}
                        </td>
                      </tr>
                      {openDetail ? (
                        <tr className="border-t border-[#eef4f8] bg-sky-soft/20">
                          <td
                            colSpan={12}
                            className="px-3 py-3 text-[12px] leading-relaxed text-sky-ink/70"
                          >
                            <p>
                              <span className="font-semibold text-sky-ink">Lot size</span> {t.lotSize}{' '}
                              · <span className="font-semibold text-sky-ink">Qty</span>{' '}
                              {t.lots * t.lotSize} ·{' '}
                              <span className="font-semibold text-sky-ink">Id</span> {t.id}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold text-sky-ink">Note / setup</span> —{' '}
                              {t.note || '—'}
                            </p>
                            <p className="mt-1 text-[11px] text-sky-ink/45">
                              Also backed up under{' '}
                              <code className="text-[10px]">.data/jimbo/trades/paper/</code>
                            </p>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
