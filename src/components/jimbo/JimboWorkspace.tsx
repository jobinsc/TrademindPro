'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  List,
  OctagonX,
  Play,
  Radar,
  RefreshCw,
  Search,
  Send,
  Square,
  Target,
} from 'lucide-react';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import { JimboSettingsPanel } from '@/components/jimbo/JimboSettingsWorkspace';
import { useJimbo } from '@/hooks/useJimbo';
import { JIMBO_NAME, JIMBO_UNIVERSE } from '@/lib/jimbo';
import { NSE_EQUITY_FO_COUNT, NSE_EQUITY_FO_WATCHLIST } from '@/lib/jimbo-fo-universe';
import {
  rankLiquidMomentum,
  readMomentumFocus,
  writeMomentumFocus,
  type MomentumQuote,
  type MomentumRow,
} from '@/lib/jimbo-momentum';
import { normalizeStrategyIds } from '@/lib/nejoic-options';
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
import FullStopBar from '@/components/trading/FullStopBar';
import InfoBubble from '@/components/ui/InfoBubble';

const WATCHLIST_OPEN_KEY = 'trademindpro_jimbo_fo_watchlist_open_v1';
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
    scan,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
    updateSettings,
  } = useJimbo();
  const [prompt, setPrompt] = useState('');
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
  const openTrade = trades.find((t) => t.status === 'open');
  const locked =
    settings.status === 'target_hit' || settings.status === 'stopped_loss';
  const settingsOpen = settings.settingsOpen ?? false;

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
    () => new Set(liquidSymbols),
    [liquidSymbols]
  );

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

  function toggleAuto() {
    setAutoTrade(!settings.autoTrade);
  }

  function jimboForceStop(exitTrade: boolean) {
    setAutoTrade(false);
    if (exitTrade && openTrade) closeOpen();
  }

  const { sorted: displaySignals, sort, toggle } = useSortable(
    signals,
    (s, key) => {
      switch (key) {
        case 'symbol':
          return s.symbol;
        case 'cci':
          return s.cciCurr;
        case 'bias':
          return s.bias;
        case 'atm':
          return s.strike;
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
                Stock options only — liquid Nifty-50 / F&O names. CCI crosses 0 + price action → ATM
                CE (up) or ATM PE (down). Sibling of Nejoic (index).
              </p>
              <p className="mt-2">
                CCI({settings.cciPeriod}) rising through 0 → Call. Falling through 0 → Put. Auto only
                while NSE is open. Hard day limits: +₹{settings.dailyProfitTarget} / -₹
                {settings.dailyMaxLoss}.
              </p>
              <p className="mt-2">
                Watchlist <strong>Active</strong> = liquid CCI scan names.
                <strong> Momentum board</strong> ranks the same liquid list by live thrust vs prev
                close + vs open (no candle wait) → top 5 UP / top 5 DOWN for quick ATM CE/PE.
                Pin them to Focus window, then hover for peek chart / click for full chart.
              </p>
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ModuleSettingsButton
            open={settingsOpen}
            onToggle={() => updateSettings({ settingsOpen: !settingsOpen })}
          />
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

      <div className="mt-5">
        <FullStopBar />
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

      <ModuleSettingsPanel
        open={settingsOpen}
        title={`${JIMBO_NAME} settings`}
        description="Full stock brain — strategies, analysis, timeframes, CCI, liquidity, risk, and SL/target. Same scope as Nejoic, tuned for liquid F&O names."
        controls={
          <>
            <ModuleRunButton variant="start" onClick={() => scan()} disabled={scanning}>
              <Radar className="h-4 w-4" />
              {scanning ? 'Scanning…' : 'Scan liquid stocks'}
            </ModuleRunButton>
            <ModuleRunButton variant="start" onClick={toggleAuto} disabled={settings.autoTrade || locked}>
              <Play className="h-4 w-4" />
              Start auto
            </ModuleRunButton>
            <ModuleRunButton variant="stop" onClick={toggleAuto} disabled={!settings.autoTrade}>
              <Square className="h-4 w-4" />
              Stop auto
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={() => jimboForceStop(false)}>
              <OctagonX className="h-4 w-4" />
              Force stop
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={() => jimboForceStop(true)}>
              <OctagonX className="h-4 w-4" />
              Force stop + exit
            </ModuleRunButton>
          </>
        }
      >
        <JimboSettingsPanel embedded />
      </ModuleSettingsPanel>

      {!settingsOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#cfe0ee] bg-sky-soft/30 px-4 py-3 text-sm text-sky-ink/70">
          <span>
            Auto {settings.autoTrade ? 'ON' : 'OFF'} ·{' '}
            {normalizeStrategyIds(settings.strategyIds, settings.strategyId).length} strategies ·{' '}
            {settings.primaryTimeframe} · CCI({settings.cciPeriod}) · Top {settings.maxLiquidityRank}{' '}
            · SL {settings.stopLossPoints} / Tgt {settings.targetPoints}
          </span>
          <ModuleRunButton variant="start" onClick={() => scan()} disabled={scanning}>
            <Radar className="h-4 w-4" />
            Quick scan
          </ModuleRunButton>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Universe
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {JIMBO_UNIVERSE.length}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            Scan focus · {NSE_EQUITY_FO_COUNT} F&amp;O on watchlist
          </p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Today P&amp;L
          </p>
          <p
            className={`mt-1 font-display text-2xl font-semibold ${
              dayPnl > 0 ? 'text-emerald-600' : dayPnl < 0 ? 'text-rose-500' : 'text-sky-ink'
            }`}
          >
            {formatCurrency(dayPnl)}
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
                {NSE_EQUITY_FO_COUNT} equity F&amp;O names · browse in main window · scan still uses
                top {settings.maxLiquidityRank} liquid focus
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
              <span className="font-semibold text-emerald-700">Active</span> = in Jimbo&apos;s liquid
              CCI scan universe (top {settings.maxLiquidityRank} by liquidity).{' '}
              <span className="font-semibold text-sky-ink/60">Watch</span> = on the full F&amp;O list
              only — shown for browsing/LTP, not scanned every run.
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
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              CCI setups (liquid only)
            </h2>
          </div>
          {signals.length === 0 ? (
            <p className="mt-8 text-center text-sm text-sky-ink/45">
              Click Scan to check CCI zero-crosses across the liquid universe.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
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
                      label="ATM"
                      className="pb-2"
                      active={sort.key === 'atm'}
                      dir={sort.dir}
                      onClick={() => toggle('atm')}
                    />
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
                      <td className="py-2.5">
                        <p className="font-semibold text-sky-ink">{s.symbol}</p>
                        <p className="text-[11px] text-sky-ink/45">₹{s.spot.toFixed(1)}</p>
                      </td>
                      <td className="py-2.5 text-sky-ink/70">
                        {s.cciPrev} → {s.cciCurr}
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
                        {s.bias === 'FLAT' ? '—' : `${s.strike} · ~₹${s.premium}`}
                      </td>
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
          {signals[0] && (
            <p className="mt-3 text-[12px] leading-relaxed text-sky-ink/55">
              {signals[0].reason} {signals[0].paDetail}
            </p>
          )}
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

      <section className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          Jimbo trades (paper stock options)
        </h2>
        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-sky-ink/45">No trades yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-sky-ink/40">
                <tr>
                  <th className="pb-2 font-semibold">Time</th>
                  <th className="pb-2 font-semibold">Contract</th>
                  <th className="pb-2 font-semibold">Entry</th>
                  <th className="pb-2 font-semibold">Exit</th>
                  <th className="pb-2 font-semibold">P&amp;L</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t) => (
                  <tr key={t.id} className="border-t border-[#e8f0f6]">
                    <td className="py-2.5 text-sky-ink/60">
                      {new Date(t.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 font-medium text-sky-ink">
                      {t.symbol} {t.strike} {t.option} × {t.lotSize}
                    </td>
                    <td className="py-2.5">₹{t.entryPremium}</td>
                    <td className="py-2.5">{t.exitPremium != null ? `₹${t.exitPremium}` : '—'}</td>
                    <td
                      className={`py-2.5 font-semibold ${
                        (t.pnl ?? 0) > 0
                          ? 'text-emerald-600'
                          : (t.pnl ?? 0) < 0
                            ? 'text-rose-500'
                            : 'text-sky-ink/50'
                      }`}
                    >
                      {t.pnl != null ? formatCurrency(t.pnl) : '—'}
                    </td>
                    <td className="py-2.5 capitalize text-sky-ink/60">{t.status}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
