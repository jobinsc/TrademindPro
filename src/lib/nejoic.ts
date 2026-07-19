import { runPriceAction, type StructureLabel } from '@/lib/price-action';
import type {
  NejoicAnalysisStyle,
  NejoicStrategyId,
  NejoicTimeframeId,
} from '@/lib/nejoic-options';
import { normalizeStrategyIds, strategyLabel } from '@/lib/nejoic-options';
import { runNejoicStrategy } from '@/lib/nejoic-strategy';
import { isIndiaCashSession } from '@/lib/market-desk';

export const NEJOIC_NAME = 'Nejoic';

export type NejoicMode = 'paper' | 'live';
export type NejoicStatus = 'idle' | 'watching' | 'armed' | 'trading' | 'target_hit' | 'stopped_loss';
export type OptionBias = 'CE' | 'PE' | 'FLAT';

export type NejoicSettings = {
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  lotSize: number;
  maxLotsPerTrade: number;
  /** Pivot left/right bars — match your Pine defaults */
  leftBars: number;
  rightBars: number;
  /** Minimum confidence to take / auto trade */
  minConfidence: number;
  /** @deprecated mapped from analysisStyle */
  setupStyle: 'strict_hl_lh' | 'balanced';
  /** @deprecated prefer strategyIds — kept for migration */
  strategyId: NejoicStrategyId;
  /** Strategies Nejoic evaluates (multi-select) */
  strategyIds: NejoicStrategyId[];
  /** How strict signals are */
  analysisStyle: NejoicAnalysisStyle;
  /** Main timeframe for Pulse + auto */
  primaryTimeframe: NejoicTimeframeId;
  /** Extra timeframes shown in Pulse report */
  watchTimeframes: NejoicTimeframeId[];
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  breakoutLookback: number;
  /** Opening range minutes for ORB strategy */
  orbMinutes: number;
  respectLunchHour: boolean;
  tradeOnlyMarketHours: boolean;
  /**
   * Paper study: ignore daily target / max loss — keep analysing & trading until market close
   */
  ignoreDailyLimits: boolean;
  /**
   * rules = only follow your fixed settings
   * nejoic_math = Nejoic runs Live Pulse maths when you ask
   */
  askMode: 'rules' | 'nejoic_math';
  /** Push paper trade + signal nutshells to Telegram when configured */
  telegramNotify: boolean;
  /**
   * Telegram report instrument.
   * AUTO = desk rules (India→Nifty, after hours→Gold, weekend→BTC)
   */
  telegramInstrument: 'AUTO' | 'NIFTY' | 'GOLD' | 'BTC';
  /** Timeframe used for Telegram Live Pulse reports */
  telegramTimeframe: NejoicTimeframeId;
  /** Minutes between Telegram heartbeat reports */
  telegramHeartbeatMinutes: number;
  /** Append study parameters block to every Telegram message */
  telegramIncludeStudies: boolean;
  mode: NejoicMode;
  autoTrade: boolean;
  status: NejoicStatus;
  updatedAt: string | null;
};

export type Candle = {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type NejoicSignal = {
  id: string;
  at: string;
  bias: OptionBias;
  strike: number;
  premium: number;
  expiryLabel: string;
  confidence: number;
  reason: string;
  niftySpot: number;
  /** Price-action fields */
  method: 'price_action_hhll';
  setup: string;
  lastLabel: StructureLabel | null;
  trend: 1 | -1 | 0;
  support: number | null;
  resistance: number | null;
  structureText: string;
  labels: { index: number; label: StructureLabel; price: number; time: string }[];
};

export type NejoicTrade = {
  id: string;
  at: string;
  side: 'BUY';
  option: 'CE' | 'PE';
  strike: number;
  lots: number;
  entryPremium: number;
  exitPremium: number | null;
  exitAt: string | null;
  pnl: number | null;
  status: 'open' | 'closed';
  note: string;
  /** Upstox instrument key when entry used live LTP */
  instrumentKey?: string | null;
  premiumSource?: 'upstox' | 'estimate';
  expiry?: string | null;
};

export type NejoicDay = {
  date: string; // YYYY-MM-DD local
  realizedPnl: number;
  openPnl: number;
};

export type NejoicChat = {
  id: string;
  role: 'user' | 'nejoic';
  text: string;
  at: string;
};

export type NejoicState = {
  settings: NejoicSettings;
  candles: Candle[];
  spot: number;
  signal: NejoicSignal | null;
  trades: NejoicTrade[];
  events: { id: string; at: string; text: string }[];
  chat: NejoicChat[];
};

export function defaultNejoicSettings(): NejoicSettings {
  return {
    dailyProfitTarget: 2500,
    dailyMaxLoss: 1500,
    lotSize: 25,
    maxLotsPerTrade: 1,
    leftBars: 5,
    rightBars: 5,
    minConfidence: 70,
    setupStyle: 'strict_hl_lh',
    strategyId: 'price_action_hhll',
    strategyIds: ['price_action_hhll', 'swing_hl'],
    analysisStyle: 'strict',
    primaryTimeframe: '5m',
    watchTimeframes: ['15m', '1D', '1W'],
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    breakoutLookback: 20,
    orbMinutes: 15,
    respectLunchHour: true,
    tradeOnlyMarketHours: true,
    ignoreDailyLimits: false,
    askMode: 'nejoic_math',
    telegramNotify: true,
    telegramInstrument: 'AUTO',
    telegramTimeframe: '15m',
    telegramHeartbeatMinutes: 15,
    telegramIncludeStudies: true,
    mode: 'paper',
    autoTrade: false,
    status: 'idle',
    updatedAt: null,
  };
}

export function styleToSetup(
  style: NejoicAnalysisStyle
): 'strict_hl_lh' | 'balanced' {
  return style === 'strict' ? 'strict_hl_lh' : 'balanced';
}

export function confidenceForStyle(style: NejoicAnalysisStyle, base: number): number {
  if (style === 'aggressive') return Math.max(50, base - 15);
  if (style === 'balanced') return Math.max(55, base - 5);
  return base;
}

export function analyzeOptsFromSettings(s: NejoicSettings) {
  const strategyIds = normalizeStrategyIds(s.strategyIds, s.strategyId);
  return {
    leftBars: s.leftBars ?? 5,
    rightBars: s.rightBars ?? 5,
    setupStyle: s.setupStyle ?? styleToSetup(s.analysisStyle ?? 'strict'),
    minConfidence: s.minConfidence ?? 70,
    strategyId: strategyIds[0] ?? 'price_action_hhll',
    strategyIds,
    analysisStyle: s.analysisStyle ?? 'strict',
    emaFast: s.emaFast ?? 9,
    emaSlow: s.emaSlow ?? 21,
    rsiPeriod: s.rsiPeriod ?? 14,
    rsiOversold: s.rsiOversold ?? 30,
    rsiOverbought: s.rsiOverbought ?? 70,
    breakoutLookback: s.breakoutLookback ?? 20,
    orbMinutes: s.orbMinutes ?? 15,
  } as const;
}

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

/** Seeded-ish Nifty candle series for simulated live chart */
export function buildNiftyCandles(count = 60, base = 24850): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const drift = (Math.sin(i / 5) + (Math.random() - 0.48) * 2) * 8;
    const open = price;
    const close = Math.round((open + drift) * 100) / 100;
    const high = Math.max(open, close) + Math.random() * 12;
    const low = Math.min(open, close) - Math.random() * 12;
    candles.push({
      t: new Date(now - i * 60_000).toISOString(),
      open,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close,
    });
    price = close;
  }
  return candles;
}

export function tickNifty(candles: Candle[]): Candle[] {
  const last = candles[candles.length - 1];
  if (!last) return buildNiftyCandles();
  const drift = (Math.random() - 0.48) * 14;
  const open = last.close;
  const close = Math.round((open + drift) * 100) / 100;
  const high = Math.max(open, close) + Math.random() * 6;
  const low = Math.min(open, close) - Math.random() * 6;
  const next: Candle = {
    t: new Date().toISOString(),
    open,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close,
  };
  return [...candles.slice(-59), next];
}

export function analyzeNifty(
  candles: Candle[],
  settings?: Partial<
    Pick<
      NejoicSettings,
      | 'leftBars'
      | 'rightBars'
      | 'setupStyle'
      | 'minConfidence'
      | 'strategyId'
      | 'strategyIds'
      | 'analysisStyle'
      | 'emaFast'
      | 'emaSlow'
      | 'rsiPeriod'
      | 'rsiOversold'
      | 'rsiOverbought'
      | 'breakoutLookback'
      | 'orbMinutes'
    >
  >
): NejoicSignal {
  const spot = candles[candles.length - 1]?.close ?? 24850;
  const analysisStyle = settings?.analysisStyle ?? 'strict';
  const setupStyle =
    settings?.setupStyle ?? styleToSetup(analysisStyle);
  const minConf = confidenceForStyle(
    analysisStyle,
    settings?.minConfidence ?? 70
  );
  const strategyIds = normalizeStrategyIds(settings?.strategyIds, settings?.strategyId);

  type Vote = {
    id: NejoicStrategyId;
    bias: OptionBias;
    setup: string;
    confidence: number;
    reason: string;
  };

  const votes: Vote[] = [];

  // Shared PA levels for chart context
  const paLevels = runPriceAction(candles, {
    leftBars: settings?.leftBars ?? 5,
    rightBars: settings?.rightBars ?? 5,
  });

  for (const strategyId of strategyIds) {
    const usePa =
      strategyId === 'price_action_hhll' || strategyId === 'swing_hl';

    if (usePa) {
      const lb =
        strategyId === 'swing_hl'
          ? Math.max(settings?.leftBars ?? 5, 5)
          : settings?.leftBars ?? 5;
      const rb =
        strategyId === 'swing_hl'
          ? Math.max(settings?.rightBars ?? 5, 5)
          : settings?.rightBars ?? 5;
      const pa = runPriceAction(candles, { leftBars: lb, rightBars: rb });
      let bias = pa.bias;
      let setup = pa.setup;
      let confidence = pa.confidence;
      let reason = pa.entryHint;

      if (setupStyle === 'strict_hl_lh' || analysisStyle === 'strict') {
        const allowed = setup === 'HL_IN_UPTREND' || setup === 'LH_IN_DOWNTREND';
        if (!allowed) {
          bias = 'FLAT';
          setup = setup.startsWith('WAIT') ? setup : 'WAIT_STRICT';
          confidence = Math.min(confidence, 55);
          reason =
            'Strict mode: only Higher Low → CE or Lower High → PE. Waiting for that print.';
        }
      }

      // Long card = CE side only; Short card = PE side only
      if (strategyId === 'price_action_hhll' && bias === 'PE') {
        bias = 'FLAT';
        setup = 'PA_LONG_WAIT';
        confidence = Math.min(confidence, 50);
        reason = 'Long PA selected — ignoring PE setups.';
      }
      if (strategyId === 'swing_hl' && bias === 'CE') {
        bias = 'FLAT';
        setup = 'PA_SHORT_WAIT';
        confidence = Math.min(confidence, 50);
        reason = 'Short PA selected — ignoring CE setups.';
      }

      votes.push({
        id: strategyId,
        bias,
        setup,
        confidence,
        reason: `${pa.structureText} ${reason}`.trim(),
      });
    } else {
      const alt = runNejoicStrategy(strategyId, candles, {
        emaFast: settings?.emaFast ?? 9,
        emaSlow: settings?.emaSlow ?? 21,
        rsiPeriod: settings?.rsiPeriod ?? 14,
        rsiOversold: settings?.rsiOversold ?? 30,
        rsiOverbought: settings?.rsiOverbought ?? 70,
        breakoutLookback: settings?.breakoutLookback ?? 20,
        orbMinutes: settings?.orbMinutes ?? 15,
      });
      if (alt) {
        votes.push({
          id: strategyId,
          bias: alt.bias,
          setup: alt.setup,
          confidence: alt.confidence,
          reason: alt.reason,
        });
      }
    }
  }

  const actionable = votes
    .filter((v) => v.bias !== 'FLAT' && v.confidence >= minConf)
    .sort((a, b) => b.confidence - a.confidence);

  let bias: OptionBias = 'FLAT';
  let setup = 'WAIT';
  let confidence = 40;
  let entryHint = '';
  let structureText = paLevels.structureText;
  let winningIds: NejoicStrategyId[] = [];

  if (actionable.length) {
    const best = actionable[0];
    const ce = actionable.filter((v) => v.bias === 'CE');
    const pe = actionable.filter((v) => v.bias === 'PE');
    // Conflict: both sides clear → stay flat unless one side dominates by 12+ pts
    if (ce.length && pe.length) {
      const bestCe = ce[0];
      const bestPe = pe[0];
      if (Math.abs(bestCe.confidence - bestPe.confidence) < 12) {
        bias = 'FLAT';
        setup = 'STRATEGY_CONFLICT';
        confidence = Math.min(bestCe.confidence, bestPe.confidence);
        entryHint = `Conflict: ${strategyLabel(bestCe.id)} wants CE (${bestCe.confidence}%) vs ${strategyLabel(bestPe.id)} wants PE (${bestPe.confidence}%). Wait.`;
        winningIds = [bestCe.id, bestPe.id];
      } else if (bestCe.confidence >= bestPe.confidence) {
        bias = 'CE';
        setup = bestCe.setup;
        confidence = bestCe.confidence;
        entryHint = bestCe.reason;
        winningIds = ce.map((v) => v.id);
      } else {
        bias = 'PE';
        setup = bestPe.setup;
        confidence = bestPe.confidence;
        entryHint = bestPe.reason;
        winningIds = pe.map((v) => v.id);
      }
    } else {
      bias = best.bias;
      setup = best.setup;
      confidence = best.confidence;
      entryHint = best.reason;
      winningIds = actionable.filter((v) => v.bias === best.bias).map((v) => v.id);
    }
    structureText =
      votes.find((v) => v.id === best.id)?.reason || paLevels.structureText;
  } else {
    const bestWait = [...votes].sort((a, b) => b.confidence - a.confidence)[0];
    if (bestWait) {
      setup = bestWait.setup;
      confidence = bestWait.confidence;
      entryHint = bestWait.reason;
      structureText = bestWait.reason;
    }
  }

  if (confidence < minConf) {
    bias = 'FLAT';
  }

  const strike = round50(spot);
  const range =
    candles.slice(-20).reduce((a, c) => a + (c.high - c.low), 0) /
    Math.max(1, Math.min(20, candles.length));

  const premium =
    bias === 'FLAT'
      ? 0
      : Math.max(40, Math.round((70 + range * 1.1) * 100) / 100);

  const reason = [
    structureText,
    entryHint,
    `Strategies: ${strategyIds.map(strategyLabel).join(', ')} · winners ${
      winningIds.length ? winningIds.map(strategyLabel).join(', ') : '—'
    } · style ${analysisStyle} · min conf ${minConf}%.`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sig-${Date.now()}`,
    at: new Date().toISOString(),
    bias,
    strike,
    premium,
    expiryLabel: 'Weekly expiry',
    confidence: Math.round(confidence),
    reason,
    niftySpot: spot,
    method: 'price_action_hhll',
    setup,
    lastLabel: paLevels.lastLabel,
    trend: paLevels.trend,
    support: paLevels.support,
    resistance: paLevels.resistance,
    structureText,
    labels: paLevels.labels.slice(-12),
  };
}

export function realizedToday(trades: NejoicTrade[]): number {
  const date = todayKey();
  return trades.reduce((sum, t) => {
    if (t.status !== 'closed' || t.pnl == null) return sum;
    const exitDay = (t.exitAt || t.at).slice(0, 10);
    // Also accept local calendar match when ISO date is close
    if (exitDay === date || t.at.slice(0, 10) === date) return sum + t.pnl;
    return sum;
  }, 0);
}

export function evaluateDayStatus(
  settings: NejoicSettings,
  trades: NejoicTrade[]
): NejoicStatus {
  if (!settings.ignoreDailyLimits) {
    const pnl = realizedToday(trades);
    if (pnl >= settings.dailyProfitTarget) return 'target_hit';
    if (pnl <= -Math.abs(settings.dailyMaxLoss)) return 'stopped_loss';
  }
  if (settings.autoTrade && (settings.status === 'trading' || settings.status === 'armed')) {
    return settings.status === 'armed' ? 'armed' : 'trading';
  }
  if (settings.status === 'watching') return 'watching';
  return settings.status === 'idle' ? 'idle' : settings.status;
}

export function canOpenTrade(settings: NejoicSettings, trades: NejoicTrade[]): {
  ok: boolean;
  reason: string;
} {
  const pnl = realizedToday(trades);
  if (settings.mode === 'live') {
    return { ok: false, reason: 'Live broker orders not connected yet. Stay in Paper mode.' };
  }
  // Nifty paper only in India cash hours (Mon–Fri 09:15–15:30 IST)
  if (settings.tradeOnlyMarketHours !== false && !isIndiaCashSession()) {
    return {
      ok: false,
      reason: 'India cash closed (09:15–15:30 IST Mon–Fri). After hours = Gold only (15m). Weekend = BTC only.',
    };
  }
  if (!settings.ignoreDailyLimits) {
    if (pnl >= settings.dailyProfitTarget) {
      return { ok: false, reason: `Daily target ₹${settings.dailyProfitTarget} hit — Nejoic stops for today.` };
    }
    if (pnl <= -Math.abs(settings.dailyMaxLoss)) {
      return { ok: false, reason: `Max loss ₹${settings.dailyMaxLoss} hit — Nejoic locked for today.` };
    }
  }
  if (trades.some((t) => t.status === 'open')) {
    return { ok: false, reason: 'Already have an open Nejoic option. Close it first.' };
  }
  return { ok: true, reason: 'OK to trade' };
}

export function openPaperTrade(
  signal: NejoicSignal,
  settings: NejoicSettings,
  opts?: {
    premium?: number;
    instrumentKey?: string | null;
    premiumSource?: 'upstox' | 'estimate';
    expiry?: string | null;
  }
): NejoicTrade | null {
  const premium = opts?.premium ?? signal.premium;
  if (signal.bias === 'FLAT' || premium <= 0) return null;
  const lots = Math.min(settings.maxLotsPerTrade, 1);
  const strike = signal.strike;
  return {
    id: crypto.randomUUID?.() ?? `nt-${Date.now()}`,
    at: new Date().toISOString(),
    side: 'BUY',
    option: signal.bias,
    strike,
    lots,
    entryPremium: premium,
    exitPremium: null,
    exitAt: null,
    pnl: null,
    status: 'open',
    note: signal.reason,
    instrumentKey: opts?.instrumentKey ?? null,
    premiumSource: opts?.premiumSource ?? 'estimate',
    expiry: opts?.expiry ?? null,
  };
}

export function closePaperTrade(
  trade: NejoicTrade,
  settings: NejoicSettings,
  liveExitPremium?: number | null
): NejoicTrade {
  let exitPremium: number;
  if (liveExitPremium != null && liveExitPremium > 0) {
    exitPremium = Math.round(liveExitPremium * 100) / 100;
  } else {
    // Fallback only when Upstox LTP unavailable
    const move = (Math.random() - 0.42) * 35;
    exitPremium = Math.max(5, Math.round((trade.entryPremium + move) * 100) / 100);
  }
  const points = exitPremium - trade.entryPremium;
  const pnl = Math.round(points * settings.lotSize * trade.lots);
  return {
    ...trade,
    exitPremium,
    exitAt: new Date().toISOString(),
    pnl,
    status: 'closed',
  };
}

export function nejoicReply(
  prompt: string,
  ctx: {
    spot: number;
    signal: NejoicSignal | null;
    settings: NejoicSettings;
    dayPnl: number;
    status: NejoicStatus;
  }
): string {
  const q = prompt.trim().toLowerCase();
  const s = ctx.signal;
  const pnlLine = `Today’s P&L: ₹${ctx.dayPnl.toFixed(0)} (target +₹${ctx.settings.dailyProfitTarget} / max loss -₹${ctx.settings.dailyMaxLoss}).`;

  if (!q) {
    return `I’m ${NEJOIC_NAME}. Ask me about the Nifty chart or a CE/PE idea. ${pnlLine}`;
  }

  if (ctx.status === 'stopped_loss' && !ctx.settings.ignoreDailyLimits) {
    return `I’m locked for today — max loss ₹${ctx.settings.dailyMaxLoss} reached. Protect capital; we resume next session.`;
  }
  if (ctx.status === 'target_hit' && !ctx.settings.ignoreDailyLimits) {
    return `Daily target ₹${ctx.settings.dailyProfitTarget} done. No more trades today — bank it.`;
  }

  if (q.includes('chart') || q.includes('nifty') || q.includes('analyse') || q.includes('analyze') || q.includes('structure') || q.includes('hh') || q.includes('hl')) {
    if (!s) return `Watching Nifty near ${ctx.spot.toFixed(2)}. Run Analyse Chart for HH/HL/LH/LL.`;
    return [
      `Nejoic PA read (plain chart only):`,
      `Nifty ≈ ${s.niftySpot.toFixed(2)}`,
      s.structureText,
      `Setup: ${s.setup} · Last label: ${s.lastLabel ?? '—'} · Bias: ${s.bias} (${s.confidence}%)`,
      s.bias !== 'FLAT'
        ? `Idea: BUY ${s.bias} ${s.strike} @ ~₹${s.premium}`
        : 'No option — waiting for HL (CE) or LH (PE).',
      s.reason,
      pnlLine,
    ].join('\n');
  }

  if (q.includes('trade') || q.includes('suggest') || q.includes('ce') || q.includes('pe') || q.includes('option')) {
    if (!s || s.bias === 'FLAT') {
      return `No PA entry yet. I only take:\n• CE after Higher Low in uptrend\n• PE after Lower High in downtrend\n${pnlLine}`;
    }
    return [
      `PA trade suggestion:`,
      `BUY NIFTY ${s.strike} ${s.bias} · ~₹${s.premium} · ${ctx.settings.lotSize}×${ctx.settings.maxLotsPerTrade} lot`,
      `Setup ${s.setup} · ${s.lastLabel} · trend ${s.trend === 1 ? 'bull' : s.trend === -1 ? 'bear' : 'flat'}`,
      s.reason,
      `Invalidation: CE if support ${s.support?.toFixed(0) ?? 'HL'} breaks · PE if resistance ${s.resistance?.toFixed(0) ?? 'LH'} breaks.`,
      pnlLine,
    ].join('\n');
  }

  if (q.includes('target') || q.includes('loss') || q.includes('risk')) {
    return `My rules: earn toward ₹${ctx.settings.dailyProfitTarget}/day, never breach -₹${ctx.settings.dailyMaxLoss}. ${pnlLine} Status: ${ctx.status}. Auto-trade is ${ctx.settings.autoTrade ? 'ON (paper)' : 'OFF'}.`;
  }

  return [
    `Nejoic here. Nifty ≈ ${ctx.spot.toFixed(2)}.`,
    s ? `Latest bias ${s.bias} (${s.confidence}%).` : 'Click Analyse Chart for a signal.',
    pnlLine,
    'Ask: “analyse chart”, “suggest trade”, or “check my risk”.',
  ].join('\n');
}
