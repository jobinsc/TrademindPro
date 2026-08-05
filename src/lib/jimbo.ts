/**
 * Jimbo — liquid stock options agent
 * Universe: Nifty 50 / liquid F&O stocks only
 * Trigger: CCI crosses 0 (bottom→top → ATM CE, top→bottom → ATM PE) + PA confirm
 * Market hours only (Jimbo paper session 09:15–15:12 IST)
 */

import {
  computeCci,
  detectZeroCross,
  priceActionConfirm,
  type OhlcBar,
} from '@/lib/cci';
import { NSE_EQUITY_FO_WATCHLIST } from '@/lib/jimbo-fo-universe';
import type {
  NejoicAnalysisStyle,
  NejoicStrategyId,
  NejoicTimeframeId,
} from '@/lib/nejoic-options';
import {
  isJimboEntryPremiumAllowed,
  JIMBO_MIN_OPTION_ENTRY_PREMIUM,
  roundPremium,
} from '@/lib/paper-exit';
import { styleToSetup } from '@/lib/nejoic';

export { styleToSetup };

export const JIMBO_NAME = 'Jimbo';

export type JimboStatus =
  | 'idle'
  | 'scanning'
  | 'armed'
  | 'trading'
  | 'market_closed'
  | 'target_hit'
  | 'stopped_loss';

export type JimboSettings = {
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  lotSize: number;
  maxLotsPerTrade: number;
  leftBars: number;
  rightBars: number;
  minConfidence: number;
  setupStyle: 'strict_hl_lh' | 'balanced';
  strategyId: NejoicStrategyId;
  strategyIds: NejoicStrategyId[];
  analysisStyle: NejoicAnalysisStyle;
  primaryTimeframe: NejoicTimeframeId;
  watchTimeframes: NejoicTimeframeId[];
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  breakoutLookback: number;
  orbMinutes: number;
  respectLunchHour: boolean;
  tradeOnlyMarketHours: boolean;
  /** When true, skip daily profit / max-loss gates (legacy; prefer per-limit toggles). */
  ignoreDailyLimits: boolean;
  /** Enforce daily max-loss stop (default off — run until session end). */
  enforceMaxLossLimit: boolean;
  /** Enforce daily profit target stop (default off). */
  enforceDailyTargetLimit: boolean;
  /** Enforce max paper trades per day (default off). */
  enforceMaxTradesLimit: boolean;
  /** Cap on new paper opens today when enforceMaxTradesLimit is on. */
  maxTradesPerDay: number;
  askMode: 'rules' | 'nejoic_math';
  brokeragePerLot: number;
  targetPoints: number;
  stopLossPoints: number;
  trailingStopPoints: number;
  trailingActivatePoints: number;
  /** Nexus Sector 7–style MFE giveback trail on option premium. */
  mfeProfitTrail: boolean;
  /** Arm trail after this many premium points of MFE (default 7). */
  mfeTrailTriggerPts: number;
  /** Keep this fraction of MFE; exit when open profit falls below it (0.5 = 50%). */
  mfeTrailKeepFrac: number;
  /** Stock scan — CCI zero-cross period */
  cciPeriod: number;
  /** Only trade stocks with liquidityRank <= this (1 = most liquid) */
  maxLiquidityRank: number;
  /** Which names CCI scan / auto paper trade should walk */
  scanScope: JimboScanScope;
  /** Require price-action confirm after CCI cross */
  requirePaConfirm: boolean;
  /** Block new trades when NSE closed (manual + auto) */
  tradeOnlyWhenMarketOpen: boolean;
  mode: 'paper' | 'live';
  autoTrade: boolean;
  status: JimboStatus;
  settingsOpen: boolean;
  updatedAt: string | null;
};

/** CCI scan / auto universe */
export type JimboScanScope = 'full' | 'liquid' | 'focus';

/** Practical candle TFs for Jimbo stock-option CCI scans */
export const JIMBO_SCAN_TIMEFRAMES: { id: NejoicTimeframeId; label: string }[] = [
  { id: '1m', label: '1m' },
  { id: '2m', label: '2m' },
  { id: '3m', label: '3m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '30m', label: '30m' },
  { id: '1H', label: '1H' },
  { id: '1D', label: '1D' },
];

export const JIMBO_SCAN_SCOPE_OPTIONS: { id: JimboScanScope; label: string; hint: string }[] = [
  { id: 'liquid', label: 'Liquid 25', hint: 'Fast — top liquid F&O names' },
  { id: 'focus', label: 'Focus', hint: 'Your momentum focus chips only' },
  { id: 'full', label: 'Full F&O', hint: 'All ~190 NSE equity F&O names' },
];

export type LiquidStock = {
  symbol: string;
  name: string;
  /** Approx cash price for ATM */
  price: number;
  /** F&O lot size (demo defaults — update from exchange when live) */
  lotSize: number;
  /** Relative liquidity rank (1 = most liquid) */
  liquidityRank: number;
};

/** Liquid Nifty-50 / F&O focus list (Jimbo universe) */
export const JIMBO_UNIVERSE: LiquidStock[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2984, lotSize: 250, liquidityRank: 1 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1702, lotSize: 550, liquidityRank: 2 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1288, lotSize: 700, liquidityRank: 3 },
  { symbol: 'INFY', name: 'Infosys', price: 1648, lotSize: 400, liquidityRank: 4 },
  { symbol: 'TCS', name: 'Tata Consultancy', price: 3912, lotSize: 150, liquidityRank: 5 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 812, lotSize: 750, liquidityRank: 6 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', price: 1865, lotSize: 475, liquidityRank: 7 },
  { symbol: 'ITC', name: 'ITC', price: 469, lotSize: 1600, liquidityRank: 8 },
  { symbol: 'LT', name: 'Larsen & Toubro', price: 3620, lotSize: 150, liquidityRank: 9 },
  { symbol: 'AXISBANK', name: 'Axis Bank', price: 1125, lotSize: 625, liquidityRank: 10 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', price: 7450, lotSize: 125, liquidityRank: 11 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1780, lotSize: 400, liquidityRank: 12 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 12480, lotSize: 50, liquidityRank: 13 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', price: 712, lotSize: 550, liquidityRank: 14 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', price: 1789, lotSize: 350, liquidityRank: 15 },
  { symbol: 'WIPRO', name: 'Wipro', price: 298, lotSize: 1500, liquidityRank: 16 },
  { symbol: 'HCLTECH', name: 'HCL Tech', price: 1620, lotSize: 350, liquidityRank: 17 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', price: 2450, lotSize: 200, liquidityRank: 18 },
  { symbol: 'TITAN', name: 'Titan', price: 3450, lotSize: 175, liquidityRank: 19 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', price: 11200, lotSize: 50, liquidityRank: 20 },
  { symbol: 'NTPC', name: 'NTPC', price: 368, lotSize: 1500, liquidityRank: 21 },
  { symbol: 'POWERGRID', name: 'Power Grid', price: 312, lotSize: 1900, liquidityRank: 22 },
  { symbol: 'ONGC', name: 'ONGC', price: 268, lotSize: 1900, liquidityRank: 23 },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', price: 2880, lotSize: 200, liquidityRank: 24 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', price: 2980, lotSize: 300, liquidityRank: 25 },
];

export type JimboSignal = {
  id: string;
  at: string;
  symbol: string;
  name: string;
  spot: number;
  bias: 'CE' | 'PE' | 'FLAT';
  strike: number;
  premium: number;
  lotSize: number;
  /** Upstox option instrument key when quoted live */
  instrumentKey?: string | null;
  tradingSymbol?: string | null;
  cciPrev: number;
  cciCurr: number;
  cciPeriod: number;
  confidence: number;
  reason: string;
  paDetail: string;
};

export type JimboTrade = {
  id: string;
  at: string;
  symbol: string;
  option: 'CE' | 'PE';
  strike: number;
  lots: number;
  lotSize: number;
  entryPremium: number;
  exitPremium: number | null;
  exitAt: string | null;
  pnl: number | null;
  status: 'open' | 'closed';
  note: string;
  /** Highest option premium seen after entry (live Upstox) */
  peakPremium?: number | null;
  /** Lowest option premium seen after entry (live Upstox) */
  lowPremium?: number | null;
  /** Latest live Upstox mark while open */
  markPremium?: number | null;
  /** When markPremium was last updated */
  markAt?: string | null;
  /** Upstox option instrument — required for live mark-to-market */
  instrumentKey?: string | null;
  tradingSymbol?: string | null;
  priceSource?: 'upstox' | 'unknown';
};

export type JimboChat = {
  id: string;
  role: 'user' | 'jimbo';
  text: string;
  at: string;
};

export type JimboState = {
  settings: JimboSettings;
  signals: JimboSignal[];
  lastScanAt: string | null;
  trades: JimboTrade[];
  events: { id: string; at: string; text: string }[];
  chat: JimboChat[];
};

export function defaultJimboSettings(): JimboSettings {
  return {
    dailyProfitTarget: 2500,
    dailyMaxLoss: 1500,
    lotSize: 1,
    maxLotsPerTrade: 1,
    leftBars: 5,
    rightBars: 5,
    minConfidence: 75,
    setupStyle: 'strict_hl_lh',
    strategyId: 'price_action_hhll',
    strategyIds: ['price_action_hhll', 'swing_hl'],
    analysisStyle: 'strict',
    primaryTimeframe: '5m',
    watchTimeframes: ['15m', '1D'],
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    breakoutLookback: 20,
    orbMinutes: 15,
    respectLunchHour: true,
    tradeOnlyMarketHours: true,
    ignoreDailyLimits: true,
    enforceMaxLossLimit: false,
    enforceDailyTargetLimit: false,
    enforceMaxTradesLimit: false,
    maxTradesPerDay: 10,
    askMode: 'nejoic_math',
    brokeragePerLot: 175,
    targetPoints: 18,
    stopLossPoints: 10,
    trailingStopPoints: 0,
    trailingActivatePoints: 20,
    mfeProfitTrail: true,
    mfeTrailTriggerPts: 7,
    mfeTrailKeepFrac: 0.5,
    cciPeriod: 20,
    maxLiquidityRank: 25,
    scanScope: 'liquid',
    requirePaConfirm: true,
    tradeOnlyWhenMarketOpen: true,
    mode: 'paper',
    autoTrade: false,
    status: 'idle',
    settingsOpen: false,
    updatedAt: null,
  };
}

/** Jimbo paper session in Asia/Kolkata — new trades until 15:12 IST */
export const JIMBO_SESSION_CLOSE_HHMM = { hour: 15, minute: 12 } as const;

export function isNseMarketOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const mins = hour * 60 + minute;
  const open = 9 * 60 + 15;
  const close =
    JIMBO_SESSION_CLOSE_HHMM.hour * 60 + JIMBO_SESSION_CLOSE_HHMM.minute;
  return mins >= open && mins < close;
}

export function marketSessionLabel(now = new Date()): string {
  return isNseMarketOpen(now)
    ? 'Jimbo session open (09:15–15:12 IST)'
    : 'Session closed (after 15:12 IST) — scan for study only; no new auto trades';
}

export function roundJimboStrike(price: number): number {
  if (price >= 5000) return Math.round(price / 100) * 100;
  if (price >= 1000) return Math.round(price / 50) * 50;
  if (price >= 200) return Math.round(price / 10) * 10;
  return Math.round(price / 5) * 5;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Demo OHLC path per symbol (until live stock candles wired) */
export function buildStockBars(stock: LiquidStock, count = 60): OhlcBar[] {
  const bars: OhlcBar[] = [];
  let price = stock.price;
  const seed = hash(stock.symbol);
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const wobble =
      Math.sin((i + seed % 17) / 4) * (price * 0.002) +
      (((seed + i * 13) % 100) / 100 - 0.48) * (price * 0.004);
    const open = price;
    const close = Math.max(1, open + wobble);
    const high = Math.max(open, close) * (1 + ((seed + i) % 7) * 0.0004);
    const low = Math.min(open, close) * (1 - ((seed + i * 3) % 7) * 0.0004);
    bars.push({
      t: new Date(now - i * 60_000).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
    });
    price = close;
  }
  // Bias last bars toward a CCI cross for demo variety
  const bias = seed % 3;
  if (bias === 1 && bars.length > 8) {
    for (let i = bars.length - 6; i < bars.length; i++) {
      bars[i].close = bars[i].close * (1 + (i - (bars.length - 6)) * 0.0015);
      bars[i].high = Math.max(bars[i].high, bars[i].close);
      bars[i].open = bars[i - 1]?.close ?? bars[i].open;
    }
  } else if (bias === 2 && bars.length > 8) {
    for (let i = bars.length - 6; i < bars.length; i++) {
      bars[i].close = bars[i].close * (1 - (i - (bars.length - 6)) * 0.0015);
      bars[i].low = Math.min(bars[i].low, bars[i].close);
      bars[i].open = bars[i - 1]?.close ?? bars[i].open;
    }
  }
  return bars;
}

export function todayKey(): string {
  const d = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function realizedToday(trades: JimboTrade[]): number {
  const date = todayKey();
  return trades.reduce((sum, t) => {
    if (t.status !== 'closed' || t.pnl == null) return sum;
    const day = (t.exitAt || t.at).slice(0, 10);
    if (day === date || t.at.slice(0, 10) === date) return sum + t.pnl;
    return sum;
  }, 0);
}

/** Opens started today (IST calendar day) — used for max-trades gate. */
export function jimboTradesOpenedToday(trades: JimboTrade[]): number {
  const date = todayKey();
  return trades.filter((t) => t.at.slice(0, 10) === date).length;
}

export function canOpenJimboTrade(
  settings: JimboSettings,
  trades: JimboTrade[],
  marketOpen: boolean
): { ok: boolean; reason: string } {
  const pnl = realizedToday(trades);
  if (settings.mode === 'live') {
    return { ok: false, reason: 'Live stock-option orders not connected yet. Paper only.' };
  }
  if (settings.tradeOnlyWhenMarketOpen !== false && !marketOpen) {
    return {
      ok: false,
      reason: 'Session closed (after 15:12 IST) — no new Jimbo trades.',
    };
  }
  const enforceTarget = settings.enforceDailyTargetLimit === true;
  const enforceLoss = settings.enforceMaxLossLimit === true;
  if (enforceTarget && pnl >= settings.dailyProfitTarget) {
    return { ok: false, reason: `Daily target ₹${settings.dailyProfitTarget} hit.` };
  }
  if (enforceLoss && pnl <= -Math.abs(settings.dailyMaxLoss)) {
    return { ok: false, reason: `Max loss ₹${settings.dailyMaxLoss} hit.` };
  }
  if (settings.enforceMaxTradesLimit === true) {
    const cap = Math.max(1, settings.maxTradesPerDay || 10);
    const n = jimboTradesOpenedToday(trades);
    if (n >= cap) {
      return { ok: false, reason: `Max ${cap} Jimbo paper trades/day reached.` };
    }
  }
  if (trades.some((t) => t.status === 'open')) {
    return { ok: false, reason: 'Already have an open Jimbo stock-option trade.' };
  }
  return { ok: true, reason: 'OK' };
}

/**
 * Offline / demo fallback scan — NSE F&O watchlist (not the old 25-name liquid list).
 * Prefer `runJimboFoCciScan` via `/api/jimbo/cci-scan` for live candles + ATM LTP.
 */
export function resolveJimboScanUniverse(
  scope: JimboScanScope | undefined,
  opts?: { focusSymbols?: string[]; maxLiquidityRank?: number }
): typeof NSE_EQUITY_FO_WATCHLIST {
  const rankCap = opts?.maxLiquidityRank ?? 25;
  if (scope === 'full') return NSE_EQUITY_FO_WATCHLIST;
  if (scope === 'focus') {
    const focus = new Set((opts?.focusSymbols ?? []).map((s) => s.toUpperCase()));
    if (!focus.size) {
      return NSE_EQUITY_FO_WATCHLIST.filter((s) =>
        JIMBO_UNIVERSE.some((u) => u.symbol === s.symbol && u.liquidityRank <= rankCap)
      );
    }
    const hit = NSE_EQUITY_FO_WATCHLIST.filter((s) => focus.has(s.symbol));
    return hit.length ? hit : NSE_EQUITY_FO_WATCHLIST.slice(0, 25);
  }
  // liquid (default)
  const liquid = new Set(
    JIMBO_UNIVERSE.filter((u) => u.liquidityRank <= rankCap).map((u) => u.symbol)
  );
  return NSE_EQUITY_FO_WATCHLIST.filter((s) => liquid.has(s.symbol));
}

export function scanJimboUniverse(
  settings: Pick<
    JimboSettings,
    'cciPeriod' | 'maxLiquidityRank' | 'requirePaConfirm' | 'minConfidence' | 'scanScope'
  >,
  opts?: {
    forceAllowClosed?: boolean;
    liveSpots?: Record<string, number>;
    focusSymbols?: string[];
    symbols?: string[];
  }
): { signals: JimboSignal[]; marketOpen: boolean; scanned: number } {
  const marketOpen = isNseMarketOpen();
  const signals: JimboSignal[] = [];
  const requirePa = settings.requirePaConfirm !== false;
  const universe =
    opts?.symbols?.length
      ? NSE_EQUITY_FO_WATCHLIST.filter((s) =>
          opts.symbols!.some((x) => x.toUpperCase() === s.symbol)
        )
      : resolveJimboScanUniverse(settings.scanScope, {
          focusSymbols: opts?.focusSymbols,
          maxLiquidityRank: settings.maxLiquidityRank,
        });

  for (const stock of universe) {
    const live = opts?.liveSpots?.[stock.symbol];
    const seedStock: LiquidStock = {
      symbol: stock.symbol,
      name: stock.name,
      price: live && live > 0 ? live : 500,
      lotSize: stock.lotSize,
      liquidityRank: 1,
    };
    const bars = buildStockBars(seedStock);
    if (bars.length < Math.max(30, settings.cciPeriod + 5)) continue;
    const cci = computeCci(bars, settings.cciPeriod);
    const cross = detectZeroCross(cci, 4);
    if (!cross) continue;
    const pa = priceActionConfirm(bars, cross.direction);
    const paOk = requirePa ? pa.ok : true;
    const spot = live && live > 0 ? live : bars[bars.length - 1]?.close ?? seedStock.price;
    const strike = roundJimboStrike(spot);
    const bias: JimboSignal['bias'] =
      cross.direction === 'up_through_zero' ? (paOk ? 'CE' : 'FLAT') : paOk ? 'PE' : 'FLAT';
    const confidence = paOk ? 78 : 42;
    signals.push({
      id: `j-${stock.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      symbol: stock.symbol,
      name: stock.name,
      spot: Math.round(spot * 100) / 100,
      bias,
      strike,
      premium: 0,
      lotSize: stock.lotSize,
      cciPrev: Math.round(cross.prev * 10) / 10,
      cciCurr: Math.round(cross.curr * 10) / 10,
      cciPeriod: settings.cciPeriod,
      confidence,
      reason:
        cross.direction === 'up_through_zero'
          ? `CCI(${settings.cciPeriod}) crossed above 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) on NSE F&O watchlist.`
          : `CCI(${settings.cciPeriod}) crossed below 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) on NSE F&O watchlist.`,
      paDetail: requirePa ? pa.detail : `${pa.detail} (PA confirm optional in settings)`,
    });
  }

  const minConf = settings.minConfidence ?? 75;
  signals.sort((a, b) => {
    const ao = a.bias === 'FLAT' || a.confidence < minConf ? 1 : 0;
    const bo = b.bias === 'FLAT' || b.confidence < minConf ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return b.confidence - a.confidence;
  });

  void opts?.forceAllowClosed;
  return { signals, marketOpen, scanned: universe.length };
}

export function openJimboPaper(
  signal: JimboSignal,
  settings?: Pick<JimboSettings, 'maxLotsPerTrade'>
): JimboTrade | null {
  if (signal.bias === 'FLAT' || signal.premium <= 0) return null;
  if (!isJimboEntryPremiumAllowed(signal.premium)) return null;
  if (!signal.instrumentKey) return null;
  const lots = Math.min(settings?.maxLotsPerTrade ?? 1, 3);
  return {
    id: crypto.randomUUID?.() ?? `jt-${Date.now()}`,
    at: new Date().toISOString(),
    symbol: signal.symbol,
    option: signal.bias,
    strike: signal.strike,
    lots,
    lotSize: signal.lotSize,
    entryPremium: signal.premium,
    exitPremium: null,
    exitAt: null,
    pnl: null,
    status: 'open',
    note: `${signal.reason} ${signal.paDetail}`,
    peakPremium: signal.premium,
    lowPremium: signal.premium,
    markPremium: signal.premium,
    markAt: new Date().toISOString(),
    instrumentKey: signal.instrumentKey,
    tradingSymbol: signal.tradingSymbol || null,
    priceSource: 'upstox',
  };
}

/** Close Jimbo paper at a live Upstox premium — no simulated fill. */
export function closeJimboPaper(
  trade: JimboTrade,
  exitPremium: number
): JimboTrade {
  const finalExit = roundPremium(exitPremium);
  if (!(finalExit > 0)) {
    throw new Error('Jimbo close requires live Upstox exit premium');
  }
  const points = finalExit - trade.entryPremium;
  const pnl = Math.round(points * trade.lotSize * trade.lots);
  return {
    ...trade,
    exitPremium: finalExit,
    exitAt: new Date().toISOString(),
    pnl,
    status: 'closed',
    peakPremium: trade.peakPremium ?? null,
    lowPremium: trade.lowPremium ?? null,
    markPremium: null,
    markAt: null,
    priceSource: 'upstox',
  };
}

export function jimboReply(
  prompt: string,
  ctx: {
    signals: JimboSignal[];
    settings: JimboSettings;
    dayPnl: number;
    marketOpen: boolean;
  }
): string {
  const q = prompt.trim().toLowerCase();
  const actionable = ctx.signals.filter((s) => s.bias !== 'FLAT');
  const pnlLine = `Today P&L ₹${ctx.dayPnl.toFixed(0)} (target +₹${ctx.settings.dailyProfitTarget} / max -₹${ctx.settings.dailyMaxLoss}).`;
  const mkt = ctx.marketOpen ? 'Market OPEN' : 'Market CLOSED';

  if (!q) {
    return `I’m ${JIMBO_NAME}. I trade liquid stock options only using CCI zero-cross + price action. Skip premiums below ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}. ${mkt}. ${pnlLine}`;
  }

  if (q.includes('scan') || q.includes('find') || q.includes('opportunity') || q.includes('cci')) {
    if (!actionable.length) {
      return `${mkt}. Scanned liquid F&O / Nifty-50 names. No confirmed CCI 0-cross + PA setups right now. ${pnlLine}`;
    }
    return [
      `${mkt}. Top Jimbo setups:`,
      ...actionable.slice(0, 5).map(
        (s) =>
          `• ${s.symbol} ${s.bias} ${s.strike} ATM · CCI ${s.cciPrev}→${s.cciCurr} · ${s.confidence}%`
      ),
      pnlLine,
    ].join('\n');
  }

  if (q.includes('rule') || q.includes('logic') || q.includes('how')) {
    return [
      'Jimbo rules:',
      '1) Only liquid Nifty-50 / F&O stocks',
      '2) Only when NSE is open for live auto (paper scan anytime for study)',
      '3) CCI coming from below → crosses above 0 → confirm PA → BUY liquid ATM CE',
      '4) CCI coming from above → crosses below 0 → confirm PA → BUY liquid ATM PE',
      '5) No illiquid strikes; ATM only',
      pnlLine,
    ].join('\n');
  }

  if (q.includes('trade') || q.includes('suggest') || q.includes('call') || q.includes('put')) {
    const best = actionable[0];
    if (!best) return `No actionable CE/PE yet. Run Scan. ${pnlLine}`;
    return [
      `Best idea: BUY ${best.symbol} ${best.strike} ${best.bias} (ATM) ~₹${best.premium}`,
      `Lot ${best.lotSize} · CCI ${best.cciPrev}→${best.cciCurr}`,
      best.reason,
      best.paDetail,
      pnlLine,
    ].join('\n');
  }

  return [
    `Jimbo · ${mkt}`,
    `${ctx.signals.length} CCI events · ${actionable.length} actionable`,
    actionable[0]
      ? `Top: ${actionable[0].symbol} ${actionable[0].bias} ${actionable[0].strike}`
      : 'No CE/PE ready',
    pnlLine,
    'Ask: “scan”, “suggest trade”, or “rules”.',
  ].join('\n');
}
