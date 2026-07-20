/**
 * Blink — Nifty options scalping agent (rules-first, paper mode).
 * Fast EMA momentum + RSI filter + tight SL/TGT + max hold time.
 */

import { netAfterBrokerage, paperBrokerage, getBrokeragePerLot } from '@/lib/brokerage';
import { isIndiaCashSession } from '@/lib/market-desk';
import {
  evaluatePaperPremiumExit,
  roundPremium,
  type PaperExitPoints,
} from '@/lib/paper-exit';
import type { Candle, OptionBias } from '@/lib/nejoic';
import { computeCci, detectZeroCross } from '@/lib/cci';
import { runPriceAction } from '@/lib/price-action';
import { inTradeWindow, pickOptionStrike } from '@/lib/option-sim';
import { ALL_TIMEFRAMES } from '@/lib/strategy-catalog';
import { runCatalogSignal } from '@/lib/backtest-signals';
import {
  BLINK_STRATEGY_MODES,
  blinkStrategyCatalogId,
  type BlinkStrategyMode,
} from '@/lib/blink-strategies';

export { BLINK_STRATEGY_MODES, type BlinkStrategyMode } from '@/lib/blink-strategies';

export const BLINK_TIMEFRAMES = ALL_TIMEFRAMES.filter((t) =>
  ['1m', '2m', '3m', '5m', '10m', '15m', '30m'].includes(t.id)
);

export function blinkTimeframeLabel(id: string): string {
  return BLINK_TIMEFRAMES.find((t) => t.id === id)?.label ?? id;
}

export const BLINK_NAME = 'Blink';
export const BLINK_STORAGE_KEY = 'trademindpro_blink_v1';
export const BLINK_SYNC_EVENT = 'trademindpro-blink-sync';

export type BlinkStatus =
  | 'idle'
  | 'watching'
  | 'trading'
  | 'target_hit'
  | 'stopped_loss';

export type BlinkSettings = {
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  lotSize: number;
  maxLotsPerTrade: number;
  minConfidence: number;
  /** Which signal engine Blink uses */
  strategyMode: BlinkStrategyMode;
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiCeMin: number;
  rsiCeMax: number;
  rsiPeMin: number;
  rsiPeMax: number;
  /** CCI (Lambert) — period & zones */
  cciPeriod: number;
  cciOversold: number;
  cciOverbought: number;
  /** HH/LL pivot bars (Lonesome Pine: left=5, right=5) */
  paLeftBars: number;
  paRightBars: number;
  /** CE/PE strike vs spot */
  strikeMoneyness: 'atm' | 'itm' | 'otm';
  /** IST scalp window (HH:MM) */
  tradeWindowStart: string;
  tradeWindowEnd: string;
  /** Nifty chart interval for signals + backtest */
  chartTimeframe: string;
  targetPoints: number;
  stopLossPoints: number;
  trailingStopPoints: number;
  trailingActivatePoints: number;
  /** Force exit open scalp after this many seconds */
  maxHoldSeconds: number;
  maxTradesPerDay: number;
  brokeragePerLot: number;
  tradeOnlyMarketHours: boolean;
  mode: 'paper' | 'live';
  autoTrade: boolean;
  status: BlinkStatus;
  settingsOpen: boolean;
  updatedAt: string | null;
};

export type BlinkSignal = {
  bias: OptionBias;
  niftySpot: number;
  strike: number;
  premium: number;
  confidence: number;
  setup: string;
  reason: string;
  emaFast: number;
  emaSlow: number;
  rsi: number;
  cci?: number;
  paLabel?: string | null;
  paTrend?: 'BULL' | 'BEAR' | 'NEUTRAL';
  support?: number | null;
  resistance?: number | null;
};

export type BlinkTrade = {
  id: string;
  at: string;
  option: 'CE' | 'PE';
  strike: number;
  lots: number;
  entryPremium: number;
  exitPremium: number | null;
  exitAt: string | null;
  pnl: number | null;
  grossPnl?: number | null;
  brokerage?: number | null;
  status: 'open' | 'closed';
  note: string;
  peakPremium?: number | null;
  instrumentKey?: string | null;
  premiumSource?: 'upstox' | 'none';
  expiry?: string | null;
};

export type BlinkState = {
  settings: BlinkSettings;
  signal: BlinkSignal | null;
  spot: number;
  candles: Candle[];
  trades: BlinkTrade[];
  events: { id: string; at: string; text: string }[];
  chat: BlinkChat[];
};

export type BlinkChat = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  patch?: Partial<BlinkSettings>;
};

function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsiAt(closes: number[], period: number): number {
  if (closes.length < period + 2) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

function analyzeBlinkFromCatalog(
  candles: Candle[],
  catalogId: string,
  settings: Pick<BlinkSettings, 'minConfidence'>,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const sig = runCatalogSignal(catalogId, candles);
  if (!sig || sig.bias === 'FLAT') {
    return flatBlinkSignal(
      spot,
      strike,
      premium,
      sig?.setup ?? 'WAIT',
      sig?.reason ?? 'No signal on this bar.'
    );
  }
  if (sig.confidence < settings.minConfidence) {
    return flatBlinkSignal(
      spot,
      strike,
      premium,
      'LOW_CONF',
      `${sig.setup}: confidence ${sig.confidence}% below your min ${settings.minConfidence}%.`
    );
  }
  return {
    bias: sig.bias,
    niftySpot: spot,
    strike,
    premium,
    confidence: sig.confidence,
    setup: sig.setup,
    reason: sig.reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
  };
}

export function defaultBlinkSettings(): BlinkSettings {
  return {
    dailyProfitTarget: 1500,
    dailyMaxLoss: 1000,
    lotSize: 65,
    maxLotsPerTrade: 1,
    minConfidence: 68,
    strategyMode: 'cci_hhll_combo',
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 7,
    rsiCeMin: 42,
    rsiCeMax: 68,
    rsiPeMin: 32,
    rsiPeMax: 58,
    cciPeriod: 20,
    cciOversold: -100,
    cciOverbought: 100,
    paLeftBars: 5,
    paRightBars: 5,
    strikeMoneyness: 'atm',
    tradeWindowStart: '09:20',
    tradeWindowEnd: '15:15',
    chartTimeframe: '1m',
    targetPoints: 5,
    stopLossPoints: 8,
    trailingStopPoints: 0,
    trailingActivatePoints: 4,
    maxHoldSeconds: 180,
    maxTradesPerDay: 25,
    brokeragePerLot: 175,
    tradeOnlyMarketHours: true,
    mode: 'paper',
    autoTrade: false,
    status: 'watching',
    settingsOpen: false,
    updatedAt: null,
  };
}

export function buildBlinkCandles(count = 60, base = 24850): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  const now = Date.now();
  const barMs = 60_000;
  for (let i = count - 1; i >= 0; i--) {
    const drift = (Math.sin(i / 3) + (Math.random() - 0.48) * 2.5) * 6;
    const open = price;
    const close = Math.round((open + drift) * 100) / 100;
    const high = Math.max(open, close) + Math.random() * 8;
    const low = Math.min(open, close) - Math.random() * 8;
    candles.push({
      t: new Date(now - i * barMs).toISOString(),
      open,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close,
    });
    price = close;
  }
  return candles;
}

export function tickBlink(candles: Candle[]): Candle[] {
  const last = candles[candles.length - 1];
  if (!last) return buildBlinkCandles();
  const drift = (Math.random() - 0.48) * 10;
  const open = last.close;
  const close = Math.round((open + drift) * 100) / 100;
  const high = Math.max(open, close) + Math.random() * 5;
  const low = Math.min(open, close) - Math.random() * 5;
  const next: Candle = {
    t: new Date().toISOString(),
    open,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close,
  };
  return [...candles.slice(-59), next];
}

function flatBlinkSignal(
  spot: number,
  strike: number,
  premium: number,
  setup: string,
  reason: string,
  extras?: Partial<BlinkSignal>
): BlinkSignal {
  return {
    bias: 'FLAT',
    niftySpot: spot,
    strike,
    premium,
    confidence: 0,
    setup,
    reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
    ...extras,
  };
}

function analyzeBlinkEmaRsi(
  candles: Candle[],
  settings: Pick<
    BlinkSettings,
    | 'emaFast'
    | 'emaSlow'
    | 'rsiPeriod'
    | 'rsiCeMin'
    | 'rsiCeMax'
    | 'rsiPeMin'
    | 'rsiPeMax'
    | 'minConfidence'
  >,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const closes = candles.map((c) => c.close);

  if (closes.length < settings.emaSlow + 3) {
    return flatBlinkSignal(spot, strike, premium, 'WARMUP', 'Need more bars for EMA/RSI scalp.');
  }

  const fast = ema(closes, settings.emaFast);
  const slow = ema(closes, settings.emaSlow);
  const i = closes.length - 1;
  const f = fast[i];
  const s = slow[i];
  const r = rsiAt(closes, settings.rsiPeriod);
  const last = candles[i];
  const body = last.close - last.open;
  const bullishBar = body > 0;
  const bearishBar = body < 0;
  const crossUp = fast[i - 1] <= slow[i - 1] && f > s;
  const crossDn = fast[i - 1] >= slow[i - 1] && f < s;
  const trendUp = f > s && bullishBar;
  const trendDn = f < s && bearishBar;

  let bias: OptionBias = 'FLAT';
  let setup = 'WAIT';
  let confidence = 45;
  let reason = `EMA ${settings.emaFast}/${settings.emaSlow} · RSI ${r.toFixed(0)} — no scalp edge.`;

  if ((crossUp || trendUp) && r >= settings.rsiCeMin && r <= settings.rsiCeMax) {
    bias = 'CE';
    setup = crossUp ? 'EMA_CROSS_UP' : 'MOMENTUM_CE';
    confidence = crossUp ? 78 : 70;
    reason = crossUp
      ? `Fresh EMA cross up · RSI ${r.toFixed(0)} in scalp zone.`
      : `Bull momentum bar above fast EMA · RSI ${r.toFixed(0)}.`;
  } else if ((crossDn || trendDn) && r >= settings.rsiPeMin && r <= settings.rsiPeMax) {
    bias = 'PE';
    setup = crossDn ? 'EMA_CROSS_DOWN' : 'MOMENTUM_PE';
    confidence = crossDn ? 78 : 70;
    reason = crossDn
      ? `Fresh EMA cross down · RSI ${r.toFixed(0)} in scalp zone.`
      : `Bear momentum bar below fast EMA · RSI ${r.toFixed(0)}.`;
  }

  if (confidence < settings.minConfidence) {
    bias = 'FLAT';
    setup = 'LOW_CONF';
    reason = `Confidence ${confidence}% below min ${settings.minConfidence}%.`;
  }

  return {
    bias,
    niftySpot: spot,
    strike,
    premium,
    confidence,
    setup,
    reason,
    emaFast: Math.round(f * 100) / 100,
    emaSlow: Math.round(s * 100) / 100,
    rsi: Math.round(r * 10) / 10,
  };
}

function analyzeBlinkCci(
  candles: Candle[],
  settings: Pick<
    BlinkSettings,
    'cciPeriod' | 'cciOversold' | 'cciOverbought' | 'minConfidence'
  >,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const cciSeries = computeCci(candles, settings.cciPeriod);
  const i = candles.length - 1;
  const curr = cciSeries[i];
  const prev = cciSeries[i - 1];

  if (curr == null || prev == null) {
    return flatBlinkSignal(
      spot,
      strike,
      premium,
      'CCI_WARMUP',
      `Need ${settings.cciPeriod}+ bars for CCI(${settings.cciPeriod}).`,
      { cci: curr ?? undefined }
    );
  }

  const cross = detectZeroCross(cciSeries, 4);
  let bias: OptionBias = 'FLAT';
  let setup = 'CCI_WAIT';
  let confidence = 50;
  let reason = `CCI(${settings.cciPeriod}) = ${curr.toFixed(1)} — no zero cross or zone turn.`;

  if (cross?.direction === 'up_through_zero') {
    bias = 'CE';
    setup = 'CCI_ZERO_UP';
    confidence = 76;
    reason = `CCI crossed above 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) → CE scalp.`;
  } else if (cross?.direction === 'down_through_zero') {
    bias = 'PE';
    setup = 'CCI_ZERO_DN';
    confidence = 76;
    reason = `CCI crossed below 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) → PE scalp.`;
  } else if (prev <= settings.cciOversold && curr > settings.cciOversold) {
    bias = 'CE';
    setup = 'CCI_OVERSOLD_BOUNCE';
    confidence = 72;
    reason = `CCI left oversold (${settings.cciOversold}) → CE bounce.`;
  } else if (prev >= settings.cciOverbought && curr < settings.cciOverbought) {
    bias = 'PE';
    setup = 'CCI_OVERBOUGHT_TURN';
    confidence = 72;
    reason = `CCI left overbought (${settings.cciOverbought}) → PE turn.`;
  } else if (curr > 0 && curr > prev && curr < settings.cciOverbought) {
    bias = 'CE';
    setup = 'CCI_BULL_MOM';
    confidence = 66;
    reason = `CCI positive & rising (${curr.toFixed(1)}) → CE momentum.`;
  } else if (curr < 0 && curr < prev && curr > settings.cciOversold) {
    bias = 'PE';
    setup = 'CCI_BEAR_MOM';
    confidence = 66;
    reason = `CCI negative & falling (${curr.toFixed(1)}) → PE momentum.`;
  }

  if (confidence < settings.minConfidence) {
    bias = 'FLAT';
    setup = 'LOW_CONF';
    reason = `CCI setup ${confidence}% below min ${settings.minConfidence}%.`;
  }

  return {
    bias,
    niftySpot: spot,
    strike,
    premium,
    confidence,
    setup,
    reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
    cci: Math.round(curr * 10) / 10,
  };
}

function analyzeBlinkHhll(
  candles: Candle[],
  settings: Pick<
    BlinkSettings,
    'paLeftBars' | 'paRightBars' | 'minConfidence'
  >,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const pa = runPriceAction(candles, {
    leftBars: settings.paLeftBars,
    rightBars: settings.paRightBars,
  });

  const paTrend =
    pa.trend === 1 ? 'BULL' : pa.trend === -1 ? 'BEAR' : 'NEUTRAL';

  let bias = pa.bias;
  let confidence = pa.confidence;
  let setup = pa.setup;
  let reason = pa.entryHint;

  if (confidence < settings.minConfidence) {
    bias = 'FLAT';
    setup = 'LOW_CONF';
    reason = `${pa.entryHint} (conf ${confidence}% < ${settings.minConfidence}%).`;
  }

  return {
    bias,
    niftySpot: spot,
    strike,
    premium,
    confidence: bias === 'FLAT' ? Math.min(confidence, 55) : confidence,
    setup,
    reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
    paLabel: pa.lastLabel,
    paTrend,
    support: pa.support,
    resistance: pa.resistance,
  };
}

function analyzeBlinkCciHhll(
  candles: Candle[],
  settings: BlinkSettings,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const paSig = analyzeBlinkHhll(candles, settings, spot, strike, premium);
  const cciSig = analyzeBlinkCci(candles, settings, spot, strike, premium);

  if (paSig.bias === 'FLAT') {
    return {
      ...paSig,
      cci: cciSig.cci,
      reason: `HH/LL: ${paSig.reason} CCI(${settings.cciPeriod})=${cciSig.cci?.toFixed(1) ?? '—'}.`,
    };
  }

  const cciAgrees =
    (paSig.bias === 'CE' && (cciSig.cci ?? 0) >= 0) ||
    (paSig.bias === 'PE' && (cciSig.cci ?? 0) <= 0);

  if (!cciAgrees) {
    return flatBlinkSignal(spot, strike, premium, 'CCI_PA_CONFLICT', 
      `PA wants ${paSig.bias} (${paSig.paLabel}) but CCI(${settings.cciPeriod})=${cciSig.cci?.toFixed(1)} disagrees — wait for alignment.`,
      {
        paLabel: paSig.paLabel,
        paTrend: paSig.paTrend,
        support: paSig.support,
        resistance: paSig.resistance,
        cci: cciSig.cci,
      }
    );
  }

  const confidence = Math.min(92, paSig.confidence + 8);
  return {
    ...paSig,
    confidence,
    setup: `COMBO_${paSig.setup}`,
    reason: `${paSig.reason} CCI(${settings.cciPeriod})=${cciSig.cci?.toFixed(1)} confirms.`,
    cci: cciSig.cci,
  };
}

export function analyzeBlinkScalp(
  candles: Candle[],
  settings: Pick<
    BlinkSettings,
    | 'strategyMode'
    | 'emaFast'
    | 'emaSlow'
    | 'rsiPeriod'
    | 'rsiCeMin'
    | 'rsiCeMax'
    | 'rsiPeMin'
    | 'rsiPeMax'
    | 'minConfidence'
    | 'cciPeriod'
    | 'cciOversold'
    | 'cciOverbought'
    | 'paLeftBars'
    | 'paRightBars'
  >,
  liveSpot?: number,
  livePremium?: number | null
): BlinkSignal {
  const spot = liveSpot ?? candles[candles.length - 1]?.close ?? 24850;
  const strike = round50(spot);
  const premium = livePremium != null && livePremium > 0 ? livePremium : 0;

  let sig: BlinkSignal;
  switch (settings.strategyMode) {
    case 'cci_zero':
      sig = analyzeBlinkCci(candles, settings, spot, strike, premium);
      break;
    case 'hhll_pa':
      sig = analyzeBlinkHhll(candles, settings, spot, strike, premium);
      break;
    case 'cci_hhll_combo':
      sig = analyzeBlinkCciHhll(candles, settings as BlinkSettings, spot, strike, premium);
      break;
    case 'ema_rsi':
      sig = analyzeBlinkEmaRsi(candles, settings, spot, strike, premium);
      break;
    default:
      sig = analyzeBlinkFromCatalog(
        candles,
        blinkStrategyCatalogId(settings.strategyMode),
        settings,
        spot,
        strike,
        premium
      );
  }

  if (sig.bias === 'CE' || sig.bias === 'PE') {
    const s = settings as BlinkSettings;
    sig = {
      ...sig,
      strike: pickOptionStrike(sig.niftySpot, sig.bias, s.strikeMoneyness ?? 'atm'),
    };
  }
  return sig;
}

export function todayKey(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function realizedToday(trades: BlinkTrade[]): number {
  const date = todayKey();
  return trades.reduce((sum, t) => {
    if (t.status !== 'closed' || t.pnl == null) return sum;
    const exitDay = (t.exitAt || t.at).slice(0, 10);
    if (exitDay === date || t.at.slice(0, 10) === date) return sum + t.pnl;
    return sum;
  }, 0);
}

export function tradesTodayCount(trades: BlinkTrade[]): number {
  const date = todayKey();
  return trades.filter((t) => t.at.slice(0, 10) === date).length;
}

export function exitPointsFromSettings(s: BlinkSettings): PaperExitPoints {
  return {
    stopLossPoints: s.stopLossPoints,
    targetPoints: s.targetPoints,
    trailingStopPoints: s.trailingStopPoints,
    trailingActivatePoints: s.trailingActivatePoints,
  };
}

export function canOpenBlinkTrade(
  settings: BlinkSettings,
  trades: BlinkTrade[]
): { ok: boolean; reason: string } {
  const pnl = realizedToday(trades);
  if (settings.mode === 'live') {
    return { ok: false, reason: 'Live broker orders not connected yet. Paper only.' };
  }
  if (settings.tradeOnlyMarketHours && !isIndiaCashSession()) {
    return { ok: false, reason: 'India cash closed — Blink scalps Nifty in session only.' };
  }
  const nowIso = new Date().toISOString();
  if (
    settings.tradeWindowStart &&
    settings.tradeWindowEnd &&
    !inTradeWindow(nowIso, settings.tradeWindowStart, settings.tradeWindowEnd)
  ) {
    return {
      ok: false,
      reason: `Outside scalp window (${settings.tradeWindowStart}–${settings.tradeWindowEnd} IST).`,
    };
  }
  if (pnl >= settings.dailyProfitTarget) {
    return { ok: false, reason: `Daily target ₹${settings.dailyProfitTarget} hit.` };
  }
  if (pnl <= -Math.abs(settings.dailyMaxLoss)) {
    return { ok: false, reason: `Max loss ₹${settings.dailyMaxLoss} hit.` };
  }
  if (tradesTodayCount(trades) >= settings.maxTradesPerDay) {
    return { ok: false, reason: `Max ${settings.maxTradesPerDay} scalps/day reached.` };
  }
  if (trades.some((t) => t.status === 'open')) {
    return { ok: false, reason: 'Already in a scalp — wait for exit.' };
  }
  return { ok: true, reason: 'OK' };
}

export function openBlinkPaper(
  signal: BlinkSignal,
  settings: BlinkSettings,
  opts?: {
    premium?: number;
    instrumentKey?: string | null;
    premiumSource?: 'upstox' | 'none';
    expiry?: string | null;
  }
): BlinkTrade | null {
  if (signal.bias === 'FLAT') return null;
  const entry = opts?.premium ?? signal.premium;
  if (entry <= 0) return null;
  const lots = Math.max(1, Math.min(settings.maxLotsPerTrade, 3));
  return {
    id: crypto.randomUUID?.() ?? `bt-${Date.now()}`,
    at: new Date().toISOString(),
    option: signal.bias,
    strike: signal.strike,
    lots,
    entryPremium: entry,
    exitPremium: null,
    exitAt: null,
    pnl: null,
    status: 'open',
    note: `${signal.setup}: ${signal.reason}`,
    peakPremium: entry,
    instrumentKey: opts?.instrumentKey ?? null,
    premiumSource: opts?.premiumSource ?? 'none',
    expiry: opts?.expiry ?? null,
  };
}

export function closeBlinkPaper(
  trade: BlinkTrade,
  settings: BlinkSettings,
  exitPremium: number
): BlinkTrade {
  if (!(exitPremium > 0)) {
    throw new Error('Live exit premium required — connect Upstox');
  }
  const finalExit = roundPremium(exitPremium);
  const points = finalExit - trade.entryPremium;
  const grossPnl = Math.round(points * settings.lotSize * trade.lots);
  const perLot =
    settings.brokeragePerLot != null && settings.brokeragePerLot >= 0
      ? settings.brokeragePerLot
      : getBrokeragePerLot();
  const brokerage = paperBrokerage(trade.lots, perLot);
  const pnl = netAfterBrokerage(grossPnl, trade.lots, perLot);
  return {
    ...trade,
    exitPremium: finalExit,
    exitAt: new Date().toISOString(),
    grossPnl,
    brokerage,
    pnl,
    status: 'closed',
    peakPremium: null,
    note: `${trade.note} · Brok ₹${brokerage}`.trim(),
  };
}

export type BlinkTradeBadge = {
  label: string;
  tone: 'live' | 'warn' | 'muted';
  title: string;
};

/** Badge for whether a scalp used real Upstox LTP vs missing live data. */
export function blinkTradeBadge(trade: BlinkTrade): BlinkTradeBadge {
  if (trade.premiumSource === 'upstox' && trade.instrumentKey) {
    return {
      label: 'LIVE LTP',
      tone: 'live',
      title: 'Entry priced from Upstox live option LTP',
    };
  }
  if (trade.premiumSource === 'upstox') {
    return {
      label: 'LIVE LTP',
      tone: 'live',
      title: 'Entry priced from Upstox (instrument key not stored)',
    };
  }
  return {
    label: 'NO LIVE',
    tone: 'warn',
    title: 'This trade was not opened with Upstox live LTP — ignore for tuning',
  };
}

export function summarizeBlink(trades: BlinkTrade[]) {
  const closed = trades.filter((t) => t.status === 'closed' && t.pnl != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const grossWin = wins.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.pnl ?? 0), 0));
  return {
    total: trades.length,
    closed: closed.length,
    open: trades.filter((t) => t.status === 'open').length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    netPnl: closed.reduce((a, t) => a + (t.pnl ?? 0), 0),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
  };
}

export function blinkReply(
  prompt: string,
  ctx: { signal: BlinkSignal | null; settings: BlinkSettings; dayPnl: number }
): string {
  const q = prompt.trim().toLowerCase();
  const s = ctx.signal;
  const pnl = `Today ₹${ctx.dayPnl.toFixed(0)} (tgt +₹${ctx.settings.dailyProfitTarget} / max -₹${ctx.settings.dailyMaxLoss}).`;

  if (!q) {
    return `${BLINK_NAME} — Nifty scalp agent. Tight SL ${ctx.settings.stopLossPoints} / Tgt ${ctx.settings.targetPoints} pts · max hold ${ctx.settings.maxHoldSeconds}s. ${pnl}`;
  }
  if (q.includes('scalp') || q.includes('signal') || q.includes('trade')) {
    if (!s || s.bias === 'FLAT') {
      return `No scalp setup. ${s?.reason ?? 'Run analyse.'} ${pnl}`;
    }
    return `Scalp: BUY NIFTY ${s.strike} ${s.bias} ~₹${s.premium} · ${s.setup} ${s.confidence}%. ${s.reason} ${pnl}`;
  }
  if (q.includes('risk') || q.includes('stop') || q.includes('target')) {
    return `SL ${ctx.settings.stopLossPoints} pts · Tgt ${ctx.settings.targetPoints} pts · Max hold ${ctx.settings.maxHoldSeconds}s · Max ${ctx.settings.maxTradesPerDay} trades/day. ${pnl}`;
  }
  return `${BLINK_NAME}: ask "scalp signal" or "risk". Nifty ≈ ${s?.niftySpot.toFixed(0) ?? '—'}. ${pnl}`;
}

export { evaluatePaperPremiumExit };
