/**
 * Jimbo — liquid stock options agent
 * Universe: Nifty 50 / liquid F&O stocks only
 * Trigger: CCI crosses 0 (bottom→top → ATM CE, top→bottom → ATM PE) + PA confirm
 * Market hours only (NSE cash 09:15–15:30 IST)
 */

import {
  computeCci,
  detectZeroCross,
  priceActionConfirm,
  type OhlcBar,
} from '@/lib/cci';

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
  cciPeriod: number;
  /** Only trade stocks with liquidityRank <= this (1 = most liquid) */
  maxLiquidityRank: number;
  minConfidence: number;
  /** Require price-action confirm after CCI cross */
  requirePaConfirm: boolean;
  /** Block new trades when NSE closed (manual + auto) */
  tradeOnlyWhenMarketOpen: boolean;
  maxLotsPerTrade: number;
  mode: 'paper' | 'live';
  autoTrade: boolean;
  status: JimboStatus;
  updatedAt: string | null;
};

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
    cciPeriod: 20,
    maxLiquidityRank: 25,
    minConfidence: 75,
    requirePaConfirm: true,
    tradeOnlyWhenMarketOpen: true,
    maxLotsPerTrade: 1,
    mode: 'paper',
    autoTrade: false,
    status: 'idle',
    updatedAt: null,
  };
}

/** NSE cash market session in Asia/Kolkata */
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
  const close = 15 * 60 + 30;
  return mins >= open && mins <= close;
}

export function marketSessionLabel(now = new Date()): string {
  return isNseMarketOpen(now)
    ? 'NSE open (09:15–15:30 IST)'
    : 'NSE closed — Jimbo scans for study only; no new auto trades';
}

function roundStrike(price: number): number {
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

export function scanJimboUniverse(
  settings: Pick<
    JimboSettings,
    'cciPeriod' | 'maxLiquidityRank' | 'requirePaConfirm' | 'minConfidence'
  >,
  opts?: { forceAllowClosed?: boolean }
): { signals: JimboSignal[]; marketOpen: boolean; scanned: number } {
  const marketOpen = isNseMarketOpen();
  const signals: JimboSignal[] = [];
  const maxRank = settings.maxLiquidityRank ?? 25;
  const universe = JIMBO_UNIVERSE.filter((s) => s.liquidityRank <= maxRank);

  for (const stock of universe) {
    const bars = buildStockBars(stock);
    const cci = computeCci(bars, settings.cciPeriod);
    const cross = detectZeroCross(cci, 4);
    if (!cross) continue;

    const pa = priceActionConfirm(bars, cross.direction);
    const requirePa = settings.requirePaConfirm !== false;
    const paOk = requirePa ? pa.ok : true;
    const spot = bars[bars.length - 1]?.close ?? stock.price;
    const strike = roundStrike(spot);

    if (cross.direction === 'up_through_zero') {
      const bias = paOk ? 'CE' : 'FLAT';
      const confidence = paOk
        ? 78 + Math.min(12, stock.liquidityRank <= 5 ? 12 : 6)
        : 42;
      signals.push({
        id: crypto.randomUUID?.() ?? `j-${stock.symbol}-${Date.now()}`,
        at: new Date().toISOString(),
        symbol: stock.symbol,
        name: stock.name,
        spot,
        bias,
        strike,
        premium: bias === 'CE' ? Math.max(8, Math.round(spot * 0.008 * 100) / 100) : 0,
        lotSize: stock.lotSize,
        cciPrev: Math.round(cross.prev * 10) / 10,
        cciCurr: Math.round(cross.curr * 10) / 10,
        cciPeriod: settings.cciPeriod,
        confidence,
        reason: `CCI(${settings.cciPeriod}) crossed above 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}). Liquid F&O name (rank #${stock.liquidityRank}).`,
        paDetail: requirePa ? pa.detail : `${pa.detail} (PA confirm optional in settings)`,
      });
    } else {
      const bias = paOk ? 'PE' : 'FLAT';
      const confidence = paOk
        ? 78 + Math.min(12, stock.liquidityRank <= 5 ? 12 : 6)
        : 42;
      signals.push({
        id: crypto.randomUUID?.() ?? `j-${stock.symbol}-${Date.now()}`,
        at: new Date().toISOString(),
        symbol: stock.symbol,
        name: stock.name,
        spot,
        bias,
        strike,
        premium: bias === 'PE' ? Math.max(8, Math.round(spot * 0.008 * 100) / 100) : 0,
        lotSize: stock.lotSize,
        cciPrev: Math.round(cross.prev * 10) / 10,
        cciCurr: Math.round(cross.curr * 10) / 10,
        cciPeriod: settings.cciPeriod,
        confidence,
        reason: `CCI(${settings.cciPeriod}) crossed below 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}). Liquid F&O name (rank #${stock.liquidityRank}).`,
        paDetail: requirePa ? pa.detail : `${pa.detail} (PA confirm optional in settings)`,
      });
    }
  }

  const minConf = settings.minConfidence ?? 75;
  signals.sort((a, b) => {
    const ao = a.bias === 'FLAT' || a.confidence < minConf ? 1 : 0;
    const bo = b.bias === 'FLAT' || b.confidence < minConf ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return b.confidence - a.confidence;
  });

  void opts;
  return { signals, marketOpen, scanned: universe.length };
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
    return { ok: false, reason: 'Market closed — enable trades only in session (Jimbo setting).' };
  }
  if (pnl >= settings.dailyProfitTarget) {
    return { ok: false, reason: `Daily target ₹${settings.dailyProfitTarget} hit.` };
  }
  if (pnl <= -Math.abs(settings.dailyMaxLoss)) {
    return { ok: false, reason: `Max loss ₹${settings.dailyMaxLoss} hit.` };
  }
  if (trades.some((t) => t.status === 'open')) {
    return { ok: false, reason: 'Already have an open Jimbo stock-option trade.' };
  }
  return { ok: true, reason: 'OK' };
}

export function openJimboPaper(
  signal: JimboSignal,
  settings?: Pick<JimboSettings, 'maxLotsPerTrade'>
): JimboTrade | null {
  if (signal.bias === 'FLAT' || signal.premium <= 0) return null;
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
  };
}

export function closeJimboPaper(trade: JimboTrade): JimboTrade {
  const move = (Math.random() - 0.42) * (trade.entryPremium * 0.35);
  const exitPremium = Math.max(1, Math.round((trade.entryPremium + move) * 100) / 100);
  const points = exitPremium - trade.entryPremium;
  const pnl = Math.round(points * trade.lotSize * trade.lots);
  return {
    ...trade,
    exitPremium,
    exitAt: new Date().toISOString(),
    pnl,
    status: 'closed',
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
    return `I’m ${JIMBO_NAME}. I trade liquid stock options only using CCI zero-cross + price action. ${mkt}. ${pnlLine}`;
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
