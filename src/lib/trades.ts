export type TradeSide = 'BUY' | 'SELL';
export type TradeSegment = 'EQ' | 'FUT' | 'OPT';
/** How long you intended to hold — separate from strategy / segment */
export type TradeStyle = 'intraday' | 'swing' | 'positional';
export type TradeEmotion =
  | 'Calm'
  | 'Confident'
  | 'FOMO'
  | 'Fear'
  | 'Revenge'
  | 'Excited'
  | 'Neutral';

export type TradeLiveAnalysis = {
  ltp: number | null;
  changePct: number | null;
  unrealized: number | null;
  bias: 'CE' | 'PE' | 'FLAT';
  setup: string;
  confidence: number;
  pattern: string;
  structureText?: string;
  updatedAt: string;
};

export type Trade = {
  id: string;
  symbol: string;
  side: TradeSide;
  segment: TradeSegment;
  /** Intraday / swing / positional — drives separate analysis */
  style: TradeStyle;
  qty: number;
  entryPrice: number;
  /** null = still open (waiting to sell / hit SL) */
  exitPrice: number | null;
  /** Entry / buy (or short open) date — never in the future */
  tradeDate: string;
  /** Exit / close date — only when closed; never before entry, never future */
  exitDate: string | null;
  strategy: string;
  tags: string;
  emotion: TradeEmotion;
  mistakes: string;
  notes: string;
  createdAt: string;
  /** Auto-filled in background — live LTP + price-action (no user action) */
  live?: TradeLiveAnalysis | null;
};

export type TradeInput = Omit<Trade, 'id' | 'createdAt' | 'live'>;

export const EMOTIONS: TradeEmotion[] = [
  'Calm',
  'Confident',
  'FOMO',
  'Fear',
  'Revenge',
  'Excited',
  'Neutral',
];

export const SEGMENTS: TradeSegment[] = ['EQ', 'FUT', 'OPT'];

export const TRADE_STYLES: { id: TradeStyle; label: string; hint: string }[] = [
  { id: 'intraday', label: 'Intraday', hint: 'Same-day — usually square off before close' },
  { id: 'swing', label: 'Swing', hint: 'Hold a few days to a couple of weeks' },
  { id: 'positional', label: 'Positional', hint: 'Multi-week / months — longer investment hold' },
];

export function tradeStyleLabel(style: TradeStyle | string | undefined): string {
  const row = TRADE_STYLES.find((s) => s.id === style);
  return row?.label || 'Swing';
}

export function normalizeTradeStyle(raw: unknown): TradeStyle {
  if (raw === 'intraday' || raw === 'positional' || raw === 'swing') return raw;
  return 'swing';
}

import { journalStrategyNames } from '@/lib/strategy-catalog';

/** Journal strategy tags — synced with full catalog (PA, candlestick, SMC, etc.) */
export const STRATEGIES = journalStrategyNames();

/** Local calendar date YYYY-MM-DD (not UTC, so India evening is correct) */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isOpenTrade(trade: Pick<Trade, 'exitPrice'>): boolean {
  return trade.exitPrice === null || trade.exitPrice === undefined;
}

export function calcPnL(
  trade: Pick<Trade, 'side' | 'qty' | 'entryPrice' | 'exitPrice'>
): number | null {
  if (trade.exitPrice === null || trade.exitPrice === undefined) return null;
  const diff = trade.exitPrice - trade.entryPrice;
  const signed = trade.side === 'BUY' ? diff : -diff;
  return signed * trade.qty;
}

export function emptyTradeInput(): TradeInput {
  return {
    symbol: '',
    side: 'BUY',
    segment: 'EQ',
    style: 'intraday',
    qty: 1,
    entryPrice: 0,
    exitPrice: null,
    tradeDate: todayISO(),
    exitDate: null,
    strategy: 'Breakout',
    tags: '',
    emotion: 'Neutral',
    mistakes: '',
    notes: '',
  };
}

/** Normalize older saved trades that always required exitPrice */
export function normalizeTrade(raw: Partial<Trade> & { id: string }): Trade {
  const hasExit = typeof raw.exitPrice === 'number' && raw.exitPrice > 0;
  const normalizedExit = hasExit ? raw.exitPrice! : null;

  return {
    id: raw.id,
    symbol: (raw.symbol || '').toUpperCase(),
    side: raw.side === 'SELL' ? 'SELL' : 'BUY',
    segment: raw.segment === 'FUT' || raw.segment === 'OPT' ? raw.segment : 'EQ',
    style: normalizeTradeStyle(raw.style),
    qty: Number(raw.qty) || 0,
    entryPrice: Number(raw.entryPrice) || 0,
    exitPrice: normalizedExit,
    tradeDate: raw.tradeDate || todayISO(),
    exitDate: raw.exitDate ?? (normalizedExit != null ? raw.tradeDate || null : null),
    strategy: raw.strategy || 'Other',
    tags: raw.tags || '',
    emotion: (raw.emotion as TradeEmotion) || 'Neutral',
    mistakes: raw.mistakes || '',
    notes: raw.notes || '',
    createdAt: raw.createdAt || new Date().toISOString(),
    live: raw.live && typeof raw.live === 'object' ? raw.live : null,
  };
}

/** Mark-to-market unrealized for open trades */
export function calcUnrealized(
  trade: Pick<Trade, 'side' | 'qty' | 'entryPrice' | 'exitPrice'>,
  ltp: number | null | undefined
): number | null {
  if (!isOpenTrade(trade)) return null;
  if (ltp == null || !Number.isFinite(ltp) || ltp <= 0) return null;
  const diff = ltp - trade.entryPrice;
  const signed = trade.side === 'BUY' ? diff : -diff;
  return signed * trade.qty;
}

export function summarizeTrades(trades: Trade[]) {
  const total = trades.length;
  const open = trades.filter(isOpenTrade).length;
  const closed = trades.filter((t) => !isOpenTrade(t));
  const pnls = closed.map((t) => calcPnL(t)).filter((p): p is number => p !== null);
  const totalPnL = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  return { total, open, closed: closed.length, totalPnL, wins, losses, winRate };
}

export type AnalyticsBundle = {
  summary: ReturnType<typeof summarizeTrades>;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: { date: string; equity: number }[];
  byStrategy: { name: string; pnl: number; count: number }[];
  bySymbol: { name: string; pnl: number; count: number }[];
  byEmotion: { name: string; pnl: number; count: number }[];
  byStyle: { name: string; pnl: number; count: number; winRate: number }[];
};

export function buildAnalytics(trades: Trade[]): AnalyticsBundle {
  const summary = summarizeTrades(trades);
  const closed = trades
    .filter((t) => !isOpenTrade(t))
    .map((t) => ({ trade: t, pnl: calcPnL(t)! }))
    .filter((x) => x.pnl !== null && !Number.isNaN(x.pnl));

  const wins = closed.filter((x) => x.pnl > 0);
  const losses = closed.filter((x) => x.pnl < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b.pnl, 0) / losses.length : 0;
  const grossProfit = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const winRate = summary.closed ? summary.wins / summary.closed : 0;
  const lossRate = 1 - winRate;
  const expectancy = winRate * avgWin + lossRate * avgLoss;

  const sorted = [...closed].sort((a, b) => {
    const da = a.trade.exitDate || a.trade.tradeDate;
    const db = b.trade.exitDate || b.trade.tradeDate;
    return da.localeCompare(db);
  });

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: { date: string; equity: number }[] = [];
  for (const row of sorted) {
    equity += row.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    equityCurve.push({
      date: row.trade.exitDate || row.trade.tradeDate,
      equity: Math.round(equity * 100) / 100,
    });
  }

  const groupBy = (key: (t: Trade) => string) => {
    const map = new Map<string, { pnl: number; count: number }>();
    for (const { trade, pnl } of closed) {
      const name = key(trade) || 'Other';
      const cur = map.get(name) || { pnl: 0, count: 0 };
      cur.pnl += pnl;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, pnl: Math.round(v.pnl * 100) / 100, count: v.count }))
      .sort((a, b) => b.pnl - a.pnl);
  };

  const styleMap = new Map<string, { pnl: number; count: number; wins: number }>();
  for (const { trade, pnl } of closed) {
    const name = tradeStyleLabel(trade.style);
    const cur = styleMap.get(name) || { pnl: 0, count: 0, wins: 0 };
    cur.pnl += pnl;
    cur.count += 1;
    if (pnl > 0) cur.wins += 1;
    styleMap.set(name, cur);
  }
  const byStyle = TRADE_STYLES.map((s) => {
    const name = s.label;
    const v = styleMap.get(name) || { pnl: 0, count: 0, wins: 0 };
    return {
      name,
      pnl: Math.round(v.pnl * 100) / 100,
      count: v.count,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
    };
  });

  const pnls = closed.map((x) => x.pnl);

  return {
    summary,
    avgWin,
    avgLoss,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    expectancy,
    maxDrawdown,
    bestTrade: pnls.length ? Math.max(...pnls) : 0,
    worstTrade: pnls.length ? Math.min(...pnls) : 0,
    equityCurve,
    byStrategy: groupBy((t) => t.strategy),
    bySymbol: groupBy((t) => t.symbol).slice(0, 8),
    byEmotion: groupBy((t) => t.emotion),
    byStyle,
  };
}
