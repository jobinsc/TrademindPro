import { runPriceAction, type StructureLabel } from '@/lib/price-action';

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
  /** Strict: only HL→CE and LH→PE; Balanced allows HH/LL continuation */
  setupStyle: 'strict_hl_lh' | 'balanced';
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
    mode: 'paper',
    autoTrade: false,
    status: 'idle',
    updatedAt: null,
  };
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
  settings?: Pick<NejoicSettings, 'leftBars' | 'rightBars' | 'setupStyle' | 'minConfidence'>
): NejoicSignal {
  const spot = candles[candles.length - 1]?.close ?? 24850;
  const pa = runPriceAction(candles, {
    leftBars: settings?.leftBars ?? 5,
    rightBars: settings?.rightBars ?? 5,
  });

  const style = settings?.setupStyle ?? 'strict_hl_lh';
  const minConf = settings?.minConfidence ?? 70;

  let bias = pa.bias;
  let setup = pa.setup;
  let confidence = pa.confidence;
  let entryHint = pa.entryHint;

  // Strict Nejoic: only HL→CE and LH→PE (no chase continuations)
  if (style === 'strict_hl_lh') {
    const allowed = setup === 'HL_IN_UPTREND' || setup === 'LH_IN_DOWNTREND';
    if (!allowed) {
      bias = 'FLAT';
      setup = setup.startsWith('WAIT') ? setup : 'WAIT_STRICT';
      confidence = Math.min(confidence, 55);
      entryHint =
        'Strict mode: only Higher Low → CE or Lower High → PE. Waiting for that print.';
    }
  }

  if (confidence < minConf) {
    bias = 'FLAT';
  }

  const strike = round50(spot);
  const range =
    candles.slice(-20).reduce((a, c) => a + (c.high - c.low), 0) / Math.max(1, Math.min(20, candles.length));

  const premium =
    bias === 'FLAT'
      ? 0
      : Math.max(40, Math.round((70 + range * 1.1) * 100) / 100);

  const reason = [
    pa.structureText,
    entryHint,
    `Method: plain chart HH/HL/LH/LL · style ${style} · min conf ${minConf}%.`,
  ].join(' ');

  return {
    id: crypto.randomUUID?.() ?? `sig-${Date.now()}`,
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
    lastLabel: pa.lastLabel,
    trend: pa.trend,
    support: pa.support,
    resistance: pa.resistance,
    structureText: pa.structureText,
    labels: pa.labels.slice(-12),
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
  const pnl = realizedToday(trades);
  if (pnl >= settings.dailyProfitTarget) return 'target_hit';
  if (pnl <= -Math.abs(settings.dailyMaxLoss)) return 'stopped_loss';
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
  if (pnl >= settings.dailyProfitTarget) {
    return { ok: false, reason: `Daily target ₹${settings.dailyProfitTarget} hit — Nejoic stops for today.` };
  }
  if (pnl <= -Math.abs(settings.dailyMaxLoss)) {
    return { ok: false, reason: `Max loss ₹${settings.dailyMaxLoss} hit — Nejoic locked for today.` };
  }
  if (trades.some((t) => t.status === 'open')) {
    return { ok: false, reason: 'Already have an open Nejoic option. Close it first.' };
  }
  return { ok: true, reason: 'OK to trade' };
}

export function openPaperTrade(
  signal: NejoicSignal,
  settings: NejoicSettings
): NejoicTrade | null {
  if (signal.bias === 'FLAT' || signal.premium <= 0) return null;
  const lots = Math.min(settings.maxLotsPerTrade, 1);
  return {
    id: crypto.randomUUID?.() ?? `nt-${Date.now()}`,
    at: new Date().toISOString(),
    side: 'BUY',
    option: signal.bias,
    strike: signal.strike,
    lots,
    entryPremium: signal.premium,
    exitPremium: null,
    exitAt: null,
    pnl: null,
    status: 'open',
    note: signal.reason,
  };
}

export function closePaperTrade(trade: NejoicTrade, settings: NejoicSettings): NejoicTrade {
  // Simulate premium move
  const move = (Math.random() - 0.42) * 35;
  const exitPremium = Math.max(5, Math.round((trade.entryPremium + move) * 100) / 100);
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

  if (ctx.status === 'stopped_loss') {
    return `I’m locked for today — max loss ₹${ctx.settings.dailyMaxLoss} reached. Protect capital; we resume next session.`;
  }
  if (ctx.status === 'target_hit') {
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
