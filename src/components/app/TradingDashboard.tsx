'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Briefcase,
  CandlestickChart,
  LineChart,
  RefreshCw,
  BookOpen,
  Monitor,
  Bot,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  Search,
  Shield,
} from 'lucide-react';
import { useTrades } from '@/hooks/useTrades';
import { useHoldings } from '@/hooks/useHoldings';
import { useBroker } from '@/hooks/useBroker';
import {
  buildAnalytics,
  calcPnL,
  isOpenTrade,
  summarizeTrades,
  type Trade,
} from '@/lib/trades';
import { holdingPnL, holdingValue, summarizeHoldings } from '@/lib/holdings';
import {
  deskForcedTimeframe,
  deskLabel,
  deskPrimaryAsset,
  getActiveDesk,
  istClock,
  isIndiaCashSession,
  type MarketDesk,
} from '@/lib/market-desk';
import { realizedToday, type NejoicTrade } from '@/lib/nejoic';
import { cn, formatCurrency } from '@/lib/utils';

type MarketRow = {
  key: string;
  name: string;
  ok: boolean;
  spot: number | null;
  change: number | null;
  changePct: number | null;
};

type WorldRow = MarketRow & {
  region: 'INDIA' | 'US' | 'EUROPE' | 'ASIA';
};

const GREEN = '#059669';
const ROSE = '#e11d48';
const BLUE = '#1a6ba8';

const REGION_LABEL: Record<WorldRow['region'], string> = {
  INDIA: 'India',
  US: 'America',
  EUROPE: 'Europe',
  ASIA: 'Asia',
};

function tone(n: number | null | undefined) {
  if (n == null || n === 0) return 'text-sky-ink';
  return n > 0 ? 'text-emerald-600' : 'text-rose-500';
}

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function istDateKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function daysAgoKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return istDateKey(d);
}

function periodPnL(trades: Trade[], fromKey: string) {
  return trades.reduce((acc, t) => {
    if (isOpenTrade(t)) return acc;
    const day = (t.exitDate || t.tradeDate || '').slice(0, 10);
    if (!day || day < fromKey) return acc;
    return acc + (calcPnL(t) ?? 0);
  }, 0);
}

function loadNejoicDayPnl(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('trademindpro_nejoic_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { trades?: NejoicTrade[] };
    if (!Array.isArray(parsed.trades)) return null;
    return realizedToday(parsed.trades);
  } catch {
    return null;
  }
}

function deskFocusCopy(desk: MarketDesk): { title: string; body: string } {
  if (desk === 'INDIA') {
    return {
      title: 'Trade focus: Nifty (India cash)',
      body: 'Session 09:15–15:30 IST · journal Nifty / options carefully.',
    };
  }
  if (desk === 'GOLD') {
    return {
      title: 'Trade focus: Gold only (15m)',
      body: 'After hours — Gold desk · no Nifty / no BTC on this board.',
    };
  }
  return {
    title: 'Trade focus: BTC only (weekend)',
    body: 'Saturday–Sunday — Bitcoin only on desk.',
  };
}

export default function TradingDashboard() {
  const { trades, ready } = useTrades();
  const { holdings } = useHoldings();
  const { connection } = useBroker();
  const [now, setNow] = useState(() => new Date());
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [world, setWorld] = useState<WorldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardOk, setBoardOk] = useState(false);
  const [worldOk, setWorldOk] = useState(false);
  const [nejoicDayPnl, setNejoicDayPnl] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setNejoicDayPnl(loadNejoicDayPnl());
    const id = window.setInterval(() => setNejoicDayPnl(loadNejoicDayPnl()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function loadBoard() {
    setLoading(true);
    try {
      const [boardRes, worldRes] = await Promise.all([
        fetch('/api/market/board', { cache: 'no-store' }),
        fetch('/api/market/world', { cache: 'no-store' }),
      ]);
      const boardData = (await boardRes.json()) as { ok?: boolean; markets?: MarketRow[] };
      const worldData = (await worldRes.json()) as { ok?: boolean; markets?: WorldRow[] };
      setMarkets(Array.isArray(boardData.markets) ? boardData.markets : []);
      setBoardOk(Boolean(boardData.ok));
      setWorld(Array.isArray(worldData.markets) ? worldData.markets : []);
      setWorldOk(Boolean(worldData.ok));
    } catch {
      setBoardOk(false);
      setWorldOk(false);
      setMarkets([]);
      setWorld([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBoard();
    const id = window.setInterval(() => void loadBoard(), 3000);
    return () => window.clearInterval(id);
  }, []);

  const summary = useMemo(() => summarizeTrades(trades), [trades]);
  const analytics = useMemo(() => buildAnalytics(trades), [trades]);
  const portfolio = useMemo(() => summarizeHoldings(holdings), [holdings]);

  const todayKey = istDateKey(now);
  const weekPnL = useMemo(() => periodPnL(trades, daysAgoKey(7)), [trades, todayKey]);
  const monthPnL = useMemo(() => periodPnL(trades, daysAgoKey(30)), [trades, todayKey]);
  const todayPnL = useMemo(
    () =>
      trades
        .filter((t) => (t.tradeDate || '').slice(0, 10) === todayKey)
        .reduce((a, t) => a + (calcPnL(t) ?? 0), 0),
    [trades, todayKey]
  );

  const openTrades = useMemo(() => trades.filter(isOpenTrade), [trades]);
  const openNotional = useMemo(
    () => openTrades.reduce((a, t) => a + t.entryPrice * t.qty, 0),
    [openTrades]
  );

  const desk = getActiveDesk(now);
  const asset = deskPrimaryAsset(desk);
  const forcedTf = deskForcedTimeframe(desk);
  const sessionOpen = isIndiaCashSession(now);
  const focus = deskFocusCopy(desk);
  const primary = markets[0];

  const rr =
    analytics.avgLoss !== 0
      ? Math.abs(analytics.avgWin / analytics.avgLoss)
      : analytics.avgWin > 0
        ? Infinity
        : 0;

  const edgeRead = useMemo(() => {
    const lines: string[] = [];
    lines.push(focus.title + (forcedTf ? ` · TF ${forcedTf}` : ''));
    if (summary.closed > 0) {
      lines.push(
        `Win rate ${summary.winRate.toFixed(1)}% (${summary.wins}W/${summary.losses}L) · PF ${
          analytics.profitFactor >= 999 ? '∞' : analytics.profitFactor.toFixed(2)
        } · expectancy ${formatCurrency(analytics.expectancy)}.`
      );
      lines.push(
        `Risk: max DD ${formatCurrency(analytics.maxDrawdown)} · ${openTrades.length} open (~${formatCurrency(openNotional)}) · today ${formatCurrency(todayPnL)}.`
      );
    } else {
      lines.push('No closed journal trades yet — log & close a few to unlock edge metrics.');
      lines.push(
        openTrades.length
          ? `${openTrades.length} open · notional ~${formatCurrency(openNotional)}.`
          : 'No open risk in journal.'
      );
    }
    return lines;
  }, [
    focus.title,
    forcedTf,
    summary,
    analytics,
    openTrades.length,
    openNotional,
    todayPnL,
  ]);

  const readiness = useMemo(
    () => [
      {
        ok: Boolean(connection.connected),
        text: connection.connected ? 'Broker linked' : 'Broker off',
        href: '/app/terminal' as string | undefined,
      },
      {
        ok: summary.total > 0,
        text: summary.total > 0 ? `${summary.total} journal` : 'No journal',
        href: '/app/journal' as string | undefined,
      },
      {
        ok: openTrades.length === 0 || openNotional > 0,
        text:
          openTrades.length === 0
            ? 'No open risk'
            : `${openTrades.length} open`,
      },
      {
        ok: boardOk && primary?.spot != null,
        text: boardOk && primary?.spot != null ? `Live ${primary.key}` : 'Feed wait',
      },
    ],
    [connection, summary.total, openTrades.length, openNotional, boardOk, primary]
  );

  const winLoss = [
    { name: 'Wins', value: summary.wins, color: GREEN },
    { name: 'Losses', value: summary.losses, color: ROSE },
  ].filter((d) => d.value > 0);

  const equity = analytics.equityCurve.slice(-40);
  const sortedHoldings = useMemo(
    () => [...holdings].sort((a, b) => holdingValue(b) - holdingValue(a)).slice(0, 8),
    [holdings]
  );
  const recentTrades = useMemo(
    () =>
      [...trades].sort((a, b) => (b.tradeDate || '').localeCompare(a.tradeDate || '')).slice(0, 12),
    [trades]
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-5 md:px-7 md:pb-10 md:pt-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Command center
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-sky-ink">
            Trading desk overview
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm font-medium text-sky-ink/60">
            World markets pinned above · edge, risk, portfolio & journal below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase text-sky-ink/45">
              IST · {asset}
              {forcedTf ? ` · ${forcedTf}` : ''}
            </p>
            <p className="font-mono text-lg font-bold text-sky-ink">{istClock(now)}</p>
            <p
              className={cn(
                'text-[11px] font-bold',
                sessionOpen ? 'text-emerald-600' : 'text-amber-600'
              )}
            >
              {sessionOpen ? 'NSE OPEN' : 'NSE CLOSED'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBoard()}
            className="inline-flex h-[4.5rem] items-center gap-2 rounded-xl bg-sky-deep px-4 text-sm font-bold text-white hover:bg-sky-ink"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sticky World markets */}
      <section className="sticky top-0 z-20 mt-5 overflow-hidden rounded-2xl border border-sky-deep/20 bg-[#0B1C2E] text-white shadow-lg shadow-sky-ink/10">
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            World markets
          </p>
          <p className="text-[11px] text-white/55">
            India · America · Europe · Asia — key indices only
          </p>
        </div>
        <div className="overflow-x-auto px-3 py-3">
          {!worldOk && world.length === 0 ? (
            <p className="px-1 text-sm text-white/50">
              {loading ? 'Loading world markets…' : 'World feed unavailable — tap Refresh.'}
            </p>
          ) : (
            <div className="flex min-w-max items-stretch gap-4">
              {(['INDIA', 'US', 'EUROPE', 'ASIA'] as const).map((region) => {
                const rows = world.filter((m) => m.region === region);
                if (!rows.length) return null;
                return (
                  <div key={region} className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">
                      {REGION_LABEL[region]}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {rows.map((m) => (
                        <div
                          key={m.key}
                          className="min-w-[7.5rem] rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5"
                          title={m.name}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">
                            {m.key}
                          </p>
                          <p className="font-mono text-[13px] font-bold tabular-nums text-white">
                            {fmt(
                              m.spot,
                              m.key === 'INDIAVIX' || m.key === 'USDINR'
                                ? 2
                                : m.spot != null && m.spot >= 1000
                                  ? 0
                                  : 2
                            )}
                          </p>
                          <p
                            className={cn(
                              'font-mono text-[11px] font-semibold tabular-nums',
                              m.changePct == null
                                ? 'text-white/40'
                                : m.changePct >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                            )}
                          >
                            {m.changePct == null
                              ? '—'
                              : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`}
                          </p>
                        </div>
                      ))}
                    </div>
                    {region !== 'ASIA' && (
                      <span className="mx-1 h-8 w-px shrink-0 bg-white/15" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Trading scorecard */}
      <section className="mt-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-ink/40">
          Trading scorecard
        </p>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
          <MiniStat
            label={`${primary?.key || asset} live`}
            value={
              primary?.spot != null
                ? fmt(primary.spot, primary.key === 'BTC' ? 0 : 2)
                : ready
                  ? '—'
                  : '…'
            }
            className={tone(primary?.changePct)}
            hint={
              primary?.changePct != null
                ? `${primary.changePct >= 0 ? '+' : ''}${primary.changePct.toFixed(2)}%`
                : deskLabel(desk)
            }
          />
          <MiniStat
            label="Today P&L"
            value={formatCurrency(todayPnL)}
            className={tone(todayPnL)}
            hint="Journal today"
          />
          <MiniStat
            label="7-day P&L"
            value={formatCurrency(weekPnL)}
            className={tone(weekPnL)}
            hint="Closed"
          />
          <MiniStat
            label="30-day P&L"
            value={formatCurrency(monthPnL)}
            className={tone(monthPnL)}
            hint="Closed"
          />
          <MiniStat
            label="Open risk"
            value={String(openTrades.length)}
            hint={`~${formatCurrency(openNotional)}`}
          />
          <MiniStat
            label="Portfolio"
            value={formatCurrency(portfolio.pnl)}
            className={tone(portfolio.pnl)}
            hint={`${portfolio.pnlPct.toFixed(1)}% unrealized`}
          />
          <MiniStat
            label="Nejoic paper"
            value={nejoicDayPnl == null ? '—' : formatCurrency(nejoicDayPnl)}
            className={tone(nejoicDayPnl)}
            hint="Today paper"
          />
          <MiniStat
            label="Win · PF"
            value={`${summary.closed ? summary.winRate.toFixed(0) : '—'}%`}
            hint={
              summary.closed
                ? `PF ${analytics.profitFactor >= 999 ? '∞' : analytics.profitFactor.toFixed(2)} · ${summary.wins}W/${summary.losses}L`
                : 'Need closed trades'
            }
          />
        </div>
      </section>

      {/* Edge + Live desk */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionTitle
              icon={LineChart}
              title="Trading edge"
              sub="Journal analytics · closed trades"
            />
            <div className="flex gap-2">
              <Link href="/app/journal" className="text-xs font-bold text-sky-deep hover:underline">
                Journal
              </Link>
              <Link href="/app/analytics" className="text-xs font-bold text-sky-deep hover:underline">
                Analytics
              </Link>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <MiniStat label="Expectancy" value={formatCurrency(analytics.expectancy)} />
            <MiniStat label="Avg win" value={formatCurrency(analytics.avgWin)} className="text-emerald-600" />
            <MiniStat label="Avg loss" value={formatCurrency(analytics.avgLoss)} className="text-rose-500" />
            <MiniStat label="R:R" value={rr === Infinity ? '∞' : rr.toFixed(2)} />
            <MiniStat
              label="Max DD"
              value={formatCurrency(analytics.maxDrawdown)}
              className="text-rose-500"
            />
            <MiniStat
              label="Best / Worst"
              value={formatCurrency(analytics.bestTrade)}
              hint={`Worst ${formatCurrency(analytics.worstTrade)}`}
              className="text-emerald-600"
            />
          </div>
          <ul className="mt-4 space-y-2 rounded-xl bg-[#f3f8fc] px-3.5 py-3">
            {edgeRead.map((line) => (
              <li key={line} className="flex gap-2 text-sm font-semibold leading-snug text-sky-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-deep" />
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-sm">
          <SectionTitle
            icon={CandlestickChart}
            title="Live desk"
            sub={boardOk ? deskLabel(desk) : 'Waiting for live feed…'}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-bold',
                sessionOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              )}
            >
              {sessionOpen ? 'NSE OPEN' : 'NSE CLOSED'}
            </span>
            <span className="rounded-lg bg-sky-soft px-2.5 py-1 text-[11px] font-bold text-sky-ink">
              {asset}
              {forcedTf ? ` · ${forcedTf}` : ''}
            </span>
            <span className="text-[11px] font-medium text-sky-ink/45">{focus.body}</span>
          </div>

          <div
            className={cn(
              'mt-3 grid gap-2.5',
              markets.length <= 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'
            )}
          >
            {markets.length === 0 && loading
              ? Array.from({ length: desk === 'INDIA' ? 3 : 1 }).map((_, i) => (
                  <div key={i} className="h-[84px] animate-pulse rounded-xl bg-[#e8f1f8]" />
                ))
              : markets.map((m) => (
                  <div
                    key={m.key}
                    className="rounded-xl border border-[#e4eef5] bg-[#f7fbfe] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/45">
                        {m.key}
                      </p>
                      <Activity className="h-3.5 w-3.5 text-sky-mid" strokeWidth={2} />
                    </div>
                    <p className="mt-1 font-display text-xl font-bold text-sky-ink">
                      {fmt(m.spot, m.key === 'BTC' ? 0 : 2)}
                    </p>
                    <p className={cn('text-xs font-bold', tone(m.changePct))}>
                      {m.changePct == null
                        ? m.name
                        : `${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`}
                    </p>
                  </div>
                ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef4f9] pt-3">
            {readiness.map((item) => (
              <span
                key={item.text}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold',
                  item.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                )}
              >
                {item.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {item.href ? (
                  <Link href={item.href} className="hover:underline">
                    {item.text}
                  </Link>
                ) : (
                  item.text
                )}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Portfolio + Open risk */}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={Briefcase} title="Portfolio" sub="Holdings & unrealized P&L" />
            <Link href="/app/holdings" className="text-sm font-bold text-sky-deep hover:underline">
              Manage
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MiniStat label="Invested" value={formatCurrency(portfolio.invested)} />
            <MiniStat label="Current value" value={formatCurrency(portfolio.current)} />
            <MiniStat
              label="Unrealized P&L"
              value={formatCurrency(portfolio.pnl)}
              className={tone(portfolio.pnl)}
            />
            <MiniStat
              label="Return %"
              value={`${portfolio.pnlPct.toFixed(2)}%`}
              className={tone(portfolio.pnlPct)}
            />
          </div>
          {sortedHoldings.length === 0 ? (
            <p className="mt-4 rounded-xl bg-sky-soft/60 px-4 py-3 text-sm font-medium text-sky-ink/60">
              No holdings yet. Add delivery stocks to track portfolio P&amp;L here.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8f0f6] text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">
                    <th className="pb-2 pr-2">Symbol</th>
                    <th className="pb-2 pr-2 text-right">Qty</th>
                    <th className="pb-2 pr-2 text-right">Avg</th>
                    <th className="pb-2 pr-2 text-right">LTP</th>
                    <th className="pb-2 text-right">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h) => {
                    const pnl = holdingPnL(h);
                    return (
                      <tr key={h.id} className="border-b border-[#f3f8fc]">
                        <td className="py-2 pr-2">
                          <p className="font-bold text-sky-ink">{h.symbol}</p>
                          <p className="text-[10px] font-medium text-sky-ink/45">
                            {h.sector || '—'}
                          </p>
                        </td>
                        <td className="py-2 pr-2 text-right font-mono font-semibold">{h.qty}</td>
                        <td className="py-2 pr-2 text-right font-mono">{fmt(h.avgPrice)}</td>
                        <td className="py-2 pr-2 text-right font-mono">{fmt(h.ltp)}</td>
                        <td className={cn('py-2 text-right font-bold', tone(pnl))}>
                          {formatCurrency(pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {portfolio.sectors.length > 0 ? (
            <div className="mt-4 border-t border-[#eef4f9] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">
                Sector mix
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {portfolio.sectors.slice(0, 6).map((s) => (
                  <span
                    key={s.name}
                    className="rounded-lg bg-sky-soft px-2.5 py-1 text-[11px] font-bold text-sky-ink"
                  >
                    {s.name} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle
              icon={Shield}
              title="Open risk"
              sub={`${openTrades.length} open · notional ~${formatCurrency(openNotional)}`}
            />
            <Link href="/app/journal" className="text-sm font-bold text-sky-deep hover:underline">
              Journal
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MiniStat label="Open trades" value={String(openTrades.length)} />
            <MiniStat label="Notional" value={formatCurrency(openNotional)} />
            <MiniStat label="All-time P&L" value={formatCurrency(summary.totalPnL)} className={tone(summary.totalPnL)} />
            <MiniStat label="Closed" value={String(summary.closed)} hint={`${summary.open} still open`} />
          </div>
          {openTrades.length === 0 ? (
            <p className="mt-4 rounded-xl bg-sky-soft/60 px-4 py-3 text-sm font-medium text-sky-ink/60">
              No open journal trades. Risk book is flat.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8f0f6] text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">
                    <th className="pb-2 pr-2">Symbol</th>
                    <th className="pb-2 pr-2">Side</th>
                    <th className="pb-2 pr-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrades.slice(0, 10).map((t) => (
                    <tr key={t.id} className="border-b border-[#f3f8fc]">
                      <td className="py-2 pr-2 font-bold text-sky-ink">{t.symbol}</td>
                      <td className="py-2 pr-2 font-semibold">{t.side}</td>
                      <td className="py-2 pr-2 text-right font-mono">{t.qty}</td>
                      <td className="py-2 text-right font-mono">{fmt(t.entryPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Performance deep-dive */}
      <section className="mt-6 rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle
            icon={Target}
            title="Performance deep-dive"
            sub="Equity path · win/loss mix · what is working"
          />
          <Link href="/app/analytics" className="text-sm font-bold text-sky-deep hover:underline">
            Full charts
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[200px] rounded-xl bg-[#f7fbfe] p-2">
            <p className="px-2 pt-1 text-[10px] font-bold uppercase text-sky-ink/40">Equity curve</p>
            {equity.length < 2 ? (
              <p className="flex h-[160px] items-center justify-center text-xs font-medium text-sky-ink/45">
                Need more closed trades
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="88%">
                <AreaChart data={equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe8f2" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(v) => formatCurrency(Number(v ?? 0))}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={BLUE}
                    fill="#cfe0ee"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="h-[200px] rounded-xl bg-[#f7fbfe] p-2">
            <p className="px-2 pt-1 text-[10px] font-bold uppercase text-sky-ink/40">
              Wins vs losses
            </p>
            {winLoss.length === 0 ? (
              <p className="flex h-[160px] items-center justify-center text-xs font-medium text-sky-ink/45">
                No closed trades
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="88%">
                <PieChart>
                  <Pie data={winLoss} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62}>
                    {winLoss.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Breakdown title="By trade style" rows={analytics.byStyle.map((r) => ({ name: r.name, pnl: r.pnl, count: r.count }))} />
          <Breakdown title="Top symbols" rows={analytics.bySymbol.slice(0, 5)} />
          <Breakdown title="Top strategies" rows={analytics.byStrategy.slice(0, 5)} />
        </div>
        {analytics.byEmotion.slice(0, 3).length > 0 ? (
          <div className="mt-3 border-t border-[#eef4f9] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">
              Emotion P&amp;L
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analytics.byEmotion.slice(0, 6).map((e) => (
                <span
                  key={e.name}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[11px] font-bold',
                    e.pnl >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                  )}
                >
                  {e.name} {formatCurrency(e.pnl)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Trade activity */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TradeTable
          title="Open trades"
          sub={`${openTrades.length} open · notional ~${formatCurrency(openNotional)}`}
          empty="No open trades."
          trades={openTrades.slice(0, 8)}
        />
        <TradeTable
          title="Recent trades"
          sub="Latest journal rows"
          empty="No trades logged yet."
          trades={recentTrades}
        />
      </div>

      {/* Quick actions */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        {[
          { href: '/app/journal', label: 'Journal', icon: BookOpen },
          { href: '/app/analytics', label: 'Analytics', icon: LineChart },
          { href: '/app/holdings', label: 'Holdings', icon: Briefcase },
          { href: '/app/terminal', label: 'Terminal', icon: Monitor },
          { href: '/app/nejoic', label: 'Nejoic', icon: Bot },
          { href: '/app/scanner', label: 'Scanner', icon: Search },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfe0ee] bg-white px-3 py-3 text-sm font-bold text-sky-ink transition hover:bg-sky-soft/50"
          >
            <item.icon className="h-4 w-4 text-sky-deep" strokeWidth={2} />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-sky-soft text-sky-deep">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div>
        <h2 className="font-display text-base font-bold text-sky-ink md:text-lg">{title}</h2>
        {sub ? <p className="text-[11px] font-medium text-sky-ink/50">{sub}</p> : null}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  className,
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e4eef5] bg-[#f3f8fc] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">{label}</p>
      <p className={cn('mt-1 font-display text-lg font-bold text-sky-ink', className)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] font-semibold text-sky-ink/45">{hint}</p> : null}
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; pnl: number; count: number }[];
}) {
  return (
    <div className="rounded-xl bg-[#f7fbfe] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-sky-ink/45">No data yet</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between text-sm">
              <span className="font-semibold text-sky-ink">
                {r.name}{' '}
                <span className="text-[11px] font-medium text-sky-ink/40">×{r.count}</span>
              </span>
              <span className={cn('font-bold', tone(r.pnl))}>{formatCurrency(r.pnl)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TradeTable({
  title,
  sub,
  empty,
  trades,
}: {
  title: string;
  sub: string;
  empty: string;
  trades: Trade[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#cfe0ee] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef4f9] px-4 py-3">
        <div>
          <h3 className="font-display text-base font-bold text-sky-ink">{title}</h3>
          <p className="text-[11px] font-medium text-sky-ink/50">{sub}</p>
        </div>
        <Link
          href="/app/journal"
          className="inline-flex items-center gap-1 text-sm font-bold text-sky-deep hover:underline"
        >
          Journal
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {trades.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm font-medium text-sky-ink/50">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="bg-[#f7fbfe] text-[10px] font-bold uppercase tracking-wide text-sky-ink/40">
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">Exit</th>
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const open = isOpenTrade(t);
                const pnl = calcPnL(t);
                return (
                  <tr key={t.id} className="border-b border-[#f3f8fc]">
                    <td className="px-3 py-2 font-bold text-sky-ink">{t.symbol}</td>
                    <td className="px-3 py-2 font-semibold">{t.side}</td>
                    <td className="px-3 py-2 text-right font-mono">{t.qty}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(t.entryPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {t.exitPrice == null ? '—' : fmt(t.exitPrice)}
                    </td>
                    <td className="max-w-[100px] truncate px-3 py-2 text-sky-ink/60">
                      {t.strategy || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-bold',
                        open ? 'text-sky-ink/35' : tone(pnl)
                      )}
                    >
                      {open || pnl == null ? (open ? 'Open' : '—') : formatCurrency(pnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
