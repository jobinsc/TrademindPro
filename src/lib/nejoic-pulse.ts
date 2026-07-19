import { analyzeNifty, type Candle, type NejoicSettings, type OptionBias } from '@/lib/nejoic';
import { fetchNiftyCandles, fetchYahooCandles, type YahooInterval } from '@/lib/yahoo-nifty';
import {
  normalizeStrategyIds,
  normalizeTimeframeId,
  strategyLabel,
  timeframeToYahoo,
} from '@/lib/nejoic-options';
import {
  deskForcedTimeframe,
  deskLabel,
  getActiveDesk,
  isIndiaCashSession,
  isIndiaLunch,
  istClock,
  type MarketDesk,
} from '@/lib/market-desk';

export type PulseDecision = 'WAIT' | 'BUY_CE' | 'BUY_PE';

export type TfPulse = {
  tf: string;
  spot: number;
  trend: 'BULLISH' | 'BEARISH' | 'FLAT';
  pattern: string;
  structurePath: string;
  lastHH: number | null;
  lastHL: number | null;
  lastLH: number | null;
  lastLL: number | null;
  support: number | null;
  resistance: number | null;
  bias: OptionBias;
  setup: string;
  confidence: number;
  dayHigh: number;
  dayLow: number;
  pivot: number;
  atr: number;
  rangePos: number; // 0–100 where spot sits in recent range
  momentum: 'UP' | 'DOWN' | 'MIXED';
  candleStory: string[];
  nearestZone: string;
};

export type TradePlan = {
  action: PulseDecision;
  conviction: 'LOW' | 'MEDIUM' | 'HIGH';
  why: string;
  entryTrigger: string;
  invalidation: string;
  target1: string;
  target2: string;
  suggestedStrike: number;
  suggestedSide: 'CE' | 'PE' | 'NONE';
  riskNote: string;
  whenToAct: string;
};

export type LivePulse = {
  at: string;
  desk: MarketDesk;
  asset: string;
  spot: number;
  changePts: number;
  sessionNote: string;
  proRead: string;
  focus: TfPulse;
  weekly: TfPulse | null;
  daily: TfPulse | null;
  extras?: { name: string; spot: number; trend: string; changePct: number }[];
  decision: PulseDecision;
  decisionReason: string;
  buyCeIf: string[];
  buyPeIf: string[];
  plan: TradePlan;
  confluence: string[];
  conflicts: string[];
  scorePct: number;
  scoreLabel: 'LOW' | 'MEDIUM' | 'HIGH';
  fired: number;
  total: number;
  text: string;
  ok: boolean;
  error?: string;
};

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

function lastSwing(
  labels: { label: string; price: number }[],
  kind: 'HH' | 'HL' | 'LH' | 'LL'
): number | null {
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i].label === kind) return labels[i].price;
  }
  return null;
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
}

function describeCandle(c: Candle, i: number, total: number): string {
  const bull = c.close >= c.open;
  const body = Math.abs(c.close - c.open);
  const range = Math.max(0.01, c.high - c.low);
  const bodyPct = body / range;
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  let shape = bodyPct > 0.6 ? 'strong body' : bodyPct < 0.2 ? 'doji/indecision' : 'normal body';
  if (upper > body * 1.2 && lower < body * 0.4) shape += ', long upper wick (supply)';
  if (lower > body * 1.2 && upper < body * 0.4) shape += ', long lower wick (demand)';
  const tag = bull ? 'bull' : 'bear';
  return `Bar ${total - i}: ${tag} · ${shape} · H ${c.high.toFixed(0)} L ${c.low.toFixed(0)} C ${c.close.toFixed(0)}`;
}

function momentumOf(candles: Candle[]): 'UP' | 'DOWN' | 'MIXED' {
  const last = candles.slice(-5);
  if (last.length < 3) return 'MIXED';
  let up = 0;
  let down = 0;
  for (const c of last) {
    if (c.close >= c.open) up += 1;
    else down += 1;
  }
  if (up >= 4) return 'UP';
  if (down >= 4) return 'DOWN';
  const net = last[last.length - 1].close - last[0].open;
  if (Math.abs(net) < atr(candles, 8) * 0.3) return 'MIXED';
  return net > 0 ? 'UP' : 'DOWN';
}

function patternFromLabels(
  labels: { label: string }[],
  trend: TfPulse['trend']
): { pattern: string; path: string } {
  const last = labels.slice(-6).map((l) => l.label);
  const path = last.length ? last.join(' → ') : 'building pivots';
  const bullSeq = last.filter((l) => l === 'HH' || l === 'HL').length;
  const bearSeq = last.filter((l) => l === 'LH' || l === 'LL').length;
  let pattern = 'MIXED / TRANSITION';
  if (trend === 'BULLISH' && bullSeq >= bearSeq) pattern = 'BULL STRUCTURE (HH/HL dominant)';
  else if (trend === 'BEARISH' && bearSeq >= bullSeq) pattern = 'BEAR STRUCTURE (LH/LL dominant)';
  else if (bullSeq > bearSeq + 1) pattern = 'BULLISH SWINGS forming';
  else if (bearSeq > bullSeq + 1) pattern = 'BEARISH SWINGS forming';
  return { pattern, path };
}

function nearestZone(spot: number, f: TfPulse): string {
  const levels: { name: string; px: number }[] = [];
  if (f.resistance != null) levels.push({ name: 'focus resistance', px: f.resistance });
  if (f.support != null) levels.push({ name: 'focus support', px: f.support });
  if (f.lastHH != null) levels.push({ name: 'last HH', px: f.lastHH });
  if (f.lastHL != null) levels.push({ name: 'last HL', px: f.lastHL });
  if (f.lastLH != null) levels.push({ name: 'last LH', px: f.lastLH });
  if (f.lastLL != null) levels.push({ name: 'last LL', px: f.lastLL });
  levels.push({ name: 'session high', px: f.dayHigh });
  levels.push({ name: 'session low', px: f.dayLow });
  levels.push({ name: 'pivot', px: f.pivot });
  if (!levels.length) return 'No clear zone';
  levels.sort((a, b) => Math.abs(a.px - spot) - Math.abs(b.px - spot));
  const best = levels[0];
  const dist = best.px - spot;
  const side = dist > 0 ? 'above' : dist < 0 ? 'below' : 'at';
  return `${best.name} ₹${best.px.toFixed(2)} (${Math.abs(dist).toFixed(0)} pts ${side})`;
}

function buildTf(
  tf: string,
  candles: Candle[],
  spot: number,
  settings?: Partial<NejoicSettings>
): TfPulse {
  const sig = analyzeNifty(candles, {
    leftBars: settings?.leftBars ?? 5,
    rightBars: settings?.rightBars ?? 5,
    setupStyle: settings?.setupStyle ?? 'strict_hl_lh',
    minConfidence: settings?.minConfidence ?? 70,
    strategyId: settings?.strategyId ?? 'price_action_hhll',
    strategyIds: settings?.strategyIds,
    analysisStyle: settings?.analysisStyle ?? 'strict',
    emaFast: settings?.emaFast ?? 9,
    emaSlow: settings?.emaSlow ?? 21,
    rsiPeriod: settings?.rsiPeriod ?? 14,
    rsiOversold: settings?.rsiOversold ?? 30,
    rsiOverbought: settings?.rsiOverbought ?? 70,
    breakoutLookback: settings?.breakoutLookback ?? 20,
    orbMinutes: settings?.orbMinutes ?? 15,
  });
  const labels = sig.labels.map((l) => ({ label: l.label, price: l.price }));
  const slice = candles.slice(-48);
  const dayHigh = Math.max(...slice.map((c) => c.high));
  const dayLow = Math.min(...slice.map((c) => c.low));
  const pivot = Math.round(((dayHigh + dayLow + spot) / 3) * 100) / 100;
  const trend: TfPulse['trend'] =
    sig.trend === 1 ? 'BULLISH' : sig.trend === -1 ? 'BEARISH' : 'FLAT';
  const { pattern, path } = patternFromLabels(labels, trend);
  const range = Math.max(1, dayHigh - dayLow);
  const rangePos = Math.round(((spot - dayLow) / range) * 100);
  const a = Math.round(atr(candles, 14) * 100) / 100;
  const last3 = candles.slice(-3);

  const tp: TfPulse = {
    tf,
    spot,
    trend,
    pattern,
    structurePath: path,
    lastHH: lastSwing(labels, 'HH'),
    lastHL: lastSwing(labels, 'HL'),
    lastLH: lastSwing(labels, 'LH'),
    lastLL: lastSwing(labels, 'LL'),
    support: sig.support,
    resistance: sig.resistance,
    bias: sig.bias,
    setup: sig.setup,
    confidence: sig.confidence,
    dayHigh,
    dayLow,
    pivot,
    atr: a,
    rangePos,
    momentum: momentumOf(candles),
    candleStory: last3.map((c, i) => describeCandle(c, i, last3.length)),
    nearestZone: '',
  };
  tp.nearestZone = nearestZone(spot, tp);
  return tp;
}

function buildPlan(
  focus: TfPulse,
  daily: TfPulse | null,
  weekly: TfPulse | null,
  decision: PulseDecision,
  lunch: boolean,
  marketOpen: boolean,
  scoreLabel: LivePulse['scoreLabel']
): TradePlan {
  const strike = round50(focus.spot);
  const atrPad = Math.max(15, Math.round(focus.atr * 0.35));

  const ceTriggerLevel =
    focus.resistance ?? focus.lastHH ?? focus.dayHigh;
  const peTriggerLevel =
    focus.support ?? focus.lastLL ?? focus.dayLow;
  const ceInvalid = focus.lastHL ?? focus.support ?? focus.dayLow;
  const peInvalid = focus.lastLH ?? focus.resistance ?? focus.dayHigh;

  const t1Ce = round50(ceTriggerLevel + atrPad * 2);
  const t2Ce = round50(ceTriggerLevel + atrPad * 4);
  const t1Pe = round50(peTriggerLevel - atrPad * 2);
  const t2Pe = round50(peTriggerLevel - atrPad * 4);

  if (decision === 'BUY_CE') {
    return {
      action: 'BUY_CE',
      conviction: scoreLabel,
      why: `${focus.setup} on ${focus.tf} with ${focus.confidence}% confidence. ${daily?.trend === 'BULLISH' ? 'Daily agrees bullish.' : 'Daily not fully bullish — keep size small.'}`,
      entryTrigger: `Enter CE when ${focus.tf} closes above ₹${ceTriggerLevel.toFixed(0)} and holds for 1–2 candles.`,
      invalidation: `Exit / no new CE if ${focus.tf} closes below ₹${ceInvalid.toFixed(0)}.`,
      target1: `T1 spot ≈ ₹${t1Ce} (scale out ~50%)`,
      target2: `T2 spot ≈ ₹${t2Ce} (trail rest)`,
      suggestedStrike: strike,
      suggestedSide: 'CE',
      riskNote: `Paper: 1 lot. ATR≈${focus.atr.toFixed(0)}. Do not average losers.`,
      whenToAct: marketOpen
        ? lunch
          ? 'Only if breakout is clean after 1:30 PM.'
          : 'Act on the next valid close trigger.'
        : 'Prepare order map now; execute only after market open + trigger.',
    };
  }

  if (decision === 'BUY_PE') {
    return {
      action: 'BUY_PE',
      conviction: scoreLabel,
      why: `${focus.setup} on ${focus.tf} with ${focus.confidence}% confidence. ${daily?.trend === 'BEARISH' ? 'Daily agrees bearish.' : 'Daily not fully bearish — keep size small.'}`,
      entryTrigger: `Enter PE when ${focus.tf} closes below ₹${peTriggerLevel.toFixed(0)} and holds for 1–2 candles.`,
      invalidation: `Exit / no new PE if ${focus.tf} closes above ₹${peInvalid.toFixed(0)}.`,
      target1: `T1 spot ≈ ₹${t1Pe} (scale out ~50%)`,
      target2: `T2 spot ≈ ₹${t2Pe} (trail rest)`,
      suggestedStrike: strike,
      suggestedSide: 'PE',
      riskNote: `Paper: 1 lot. ATR≈${focus.atr.toFixed(0)}. Do not average losers.`,
      whenToAct: marketOpen
        ? lunch
          ? 'Only if breakdown is clean after 1:30 PM.'
          : 'Act on the next valid close trigger.'
        : 'Prepare order map now; execute only after market open + trigger.',
    };
  }

  // WAIT — still give a ready plan for both sides
  return {
    action: 'WAIT',
    conviction: scoreLabel,
    why: `No high-quality trigger yet on ${focus.tf} (${focus.setup}, conf ${focus.confidence}%). Better to wait than force.`,
    entryTrigger: `CE plan: close above ₹${ceTriggerLevel.toFixed(0)}. PE plan: close below ₹${peTriggerLevel.toFixed(0)}.`,
    invalidation: `CE invalid under ₹${ceInvalid.toFixed(0)}. PE invalid over ₹${peInvalid.toFixed(0)}.`,
    target1: `CE T1 ≈ ₹${t1Ce} · PE T1 ≈ ₹${t1Pe}`,
    target2: `CE T2 ≈ ₹${t2Ce} · PE T2 ≈ ₹${t2Pe}`,
    suggestedStrike: strike,
    suggestedSide: 'NONE',
    riskNote: `Nearest zone: ${focus.nearestZone}. Weekly bias: ${weekly?.trend ?? 'n/a'}. Daily bias: ${daily?.trend ?? 'n/a'}.`,
    whenToAct: marketOpen
      ? lunch
        ? 'Lunch window — study levels, do not chase.'
        : 'Wait for a clean close beyond the trigger. No candle close = no trade.'
      : 'Market closed. Use this map at open: first 15–30 min often noisy — prefer confirmation after 9:45.',
  };
}

function analyzeDecision(
  focus: TfPulse,
  daily: TfPulse | null,
  weekly: TfPulse | null,
  lunch: boolean,
  marketOpen: boolean
): {
  decision: PulseDecision;
  reason: string;
  buyCeIf: string[];
  buyPeIf: string[];
  confluence: string[];
  conflicts: string[];
  scorePct: number;
  fired: number;
  total: number;
} {
  const total = 24;
  let fired = 0;
  const confluence: string[] = [];
  const conflicts: string[] = [];

  if (focus.trend === 'BULLISH') {
    fired += 3;
    confluence.push(`${focus.tf} trend bullish`);
  } else if (focus.trend === 'BEARISH') {
    fired += 3;
    confluence.push(`${focus.tf} trend bearish`);
  } else {
    conflicts.push(`${focus.tf} trend flat — no edge`);
  }

  if (daily?.trend === 'BULLISH') {
    fired += 3;
    confluence.push('Daily bullish');
  } else if (daily?.trend === 'BEARISH') {
    fired += 3;
    confluence.push('Daily bearish');
  }
  if (weekly?.trend === 'BULLISH') {
    fired += 2;
    confluence.push('Weekly bullish');
  } else if (weekly?.trend === 'BEARISH') {
    fired += 2;
    confluence.push('Weekly bearish');
  }

  if (daily && focus.trend !== 'FLAT' && daily.trend !== 'FLAT' && daily.trend !== focus.trend) {
    conflicts.push(`HTF conflict: ${focus.tf} ${focus.trend} vs Daily ${daily.trend}`);
    fired = Math.max(0, fired - 2);
  } else if (daily && focus.trend !== 'FLAT' && daily.trend === focus.trend) {
    fired += 2;
    confluence.push('Focus aligns with Daily');
  }

  if (focus.momentum === 'UP') {
    fired += 2;
    confluence.push('Short-term momentum up');
  } else if (focus.momentum === 'DOWN') {
    fired += 2;
    confluence.push('Short-term momentum down');
  } else {
    conflicts.push('Momentum mixed — chop risk');
  }

  if (focus.confidence >= 75) fired += 4;
  else if (focus.confidence >= 60) fired += 2;
  else if (focus.confidence < 45) {
    conflicts.push(`Low setup confidence (${focus.confidence}%)`);
  }

  if (focus.bias === 'CE' || focus.bias === 'PE') {
    fired += 4;
    confluence.push(`PA bias ${focus.bias} · ${focus.setup}`);
  }

  if (focus.rangePos >= 85) {
    conflicts.push(`Price near top of range (${focus.rangePos}%) — breakout or reject soon`);
  } else if (focus.rangePos <= 15) {
    conflicts.push(`Price near bottom of range (${focus.rangePos}%) — breakdown or bounce soon`);
  } else {
    fired += 1;
  }

  if (!lunch) fired += 1;
  else conflicts.push('Lunch hour — lower quality fills');
  if (marketOpen) fired += 1;
  else conflicts.push('Session closed — analysis / prep only');

  const ceLevel = focus.resistance ?? focus.lastHH ?? focus.dayHigh;
  const peLevel = focus.support ?? focus.lastLL ?? focus.dayLow;
  const pad = Math.max(10, focus.atr * 0.25);

  const buyCeIf = [
    `${focus.tf} candle closes above ₹${ceLevel.toFixed(0)} and next candle holds above it`,
    `Prefer Daily not bearish (currently ${daily?.trend ?? 'n/a'})`,
    `Invalidation: close back below ₹${(focus.lastHL ?? focus.support ?? focus.dayLow).toFixed(0)}`,
    `Strike idea: ATM ${round50(focus.spot)} CE · targets via spot +${Math.round(pad * 2)} / +${Math.round(pad * 4)} pts`,
  ];
  const buyPeIf = [
    `${focus.tf} candle closes below ₹${peLevel.toFixed(0)} and next candle holds below it`,
    `Prefer Daily not bullish (currently ${daily?.trend ?? 'n/a'})`,
    `Invalidation: close back above ₹${(focus.lastLH ?? focus.resistance ?? focus.dayHigh).toFixed(0)}`,
    `Strike idea: ATM ${round50(focus.spot)} PE · targets via spot −${Math.round(pad * 2)} / −${Math.round(pad * 4)} pts`,
  ];

  // Decision: allow actionable bias even when market closed (prep), but label WAIT if closed/lunch for execution
  let decision: PulseDecision = 'WAIT';
  let reason = '';

  const canSignalCe =
    focus.bias === 'CE' &&
    focus.confidence >= 65 &&
    focus.trend !== 'BEARISH' &&
    !(daily?.trend === 'BEARISH' && focus.confidence < 80);
  const canSignalPe =
    focus.bias === 'PE' &&
    focus.confidence >= 65 &&
    focus.trend !== 'BULLISH' &&
    !(daily?.trend === 'BULLISH' && focus.confidence < 80);

  if (canSignalCe && marketOpen && !lunch) {
    decision = 'BUY_CE';
    reason = `Executable: ${focus.setup} aligned enough for paper CE.`;
  } else if (canSignalPe && marketOpen && !lunch) {
    decision = 'BUY_PE';
    reason = `Executable: ${focus.setup} aligned enough for paper PE.`;
  } else if (canSignalCe) {
    decision = 'WAIT';
    reason = marketOpen
      ? 'CE setup forming but lunch / timing filter — wait for clean close.'
      : `CE setup is the working map (${focus.setup}). Wait for market open + trigger close above ₹${ceLevel.toFixed(0)}.`;
  } else if (canSignalPe) {
    decision = 'WAIT';
    reason = marketOpen
      ? 'PE setup forming but lunch / timing filter — wait for clean close.'
      : `PE setup is the working map (${focus.setup}). Wait for market open + trigger close below ₹${peLevel.toFixed(0)}.`;
  } else {
    reason = `No A+ trigger. ${focus.tf} setup=${focus.setup}, conf=${focus.confidence}%, momentum=${focus.momentum}. Wait for level break with close confirmation.`;
  }

  return {
    decision,
    reason,
    buyCeIf,
    buyPeIf,
    confluence,
    conflicts,
    scorePct: Math.round((fired / total) * 1000) / 10,
    fired,
    total,
  };
}

export function formatPulseText(p: LivePulse, settings?: Partial<NejoicSettings>): string {
  const f = p.focus;
  const d = p.daily;
  const w = p.weekly;
  const plan = p.plan;
  const pts = p.changePts >= 0 ? `+${p.changePts.toFixed(2)}` : `${p.changePts.toFixed(2)}`;
  const desk = p.desk || 'INDIA';

  let body = '';

  if (desk === 'GOLD' || desk === 'BTC') {
    const action =
      plan.action === 'BUY_CE'
        ? 'LONG bias (paper)'
        : plan.action === 'BUY_PE'
          ? 'SHORT bias (paper)'
          : 'WAIT — no force';
    const title =
      desk === 'GOLD'
        ? `NEJOIC · GOLD (${f.tf})`
        : `NEJOIC · BTC (${f.tf})`;

    body = [
      title,
      `${istClock()} IST · ${deskLabel(desk)}`,
      `${p.asset} @ ${p.spot.toFixed(2)} (${pts}) · Focus ${f.tf}`,
      ``,
      `1) VERDICT`,
      `Action: ${action}`,
      `Conviction: ${plan.conviction} · Score ${p.scorePct}%`,
      `Why: ${plan.why}`,
      `${p.decisionReason}`,
      ``,
      `2) ${p.asset} MAP (${f.tf})`,
      `• Trend: ${f.trend} · ${f.pattern} · Momentum ${f.momentum}`,
      `• Support / Resistance: ${f.support != null ? f.support.toFixed(2) : '—'} / ${f.resistance != null ? f.resistance.toFixed(2) : '—'}`,
      `• Zone: ${f.nearestZone}`,
      `• Path: ${f.structurePath}`,
      ``,
      `3) PLAN`,
      `• Entry: ${plan.entryTrigger}`,
      `• Invalidation: ${plan.invalidation}`,
      `• ${plan.target1}`,
      `• ${plan.target2}`,
      `• ${plan.riskNote}`,
      `• Timing: ${plan.whenToAct}`,
    ].join('\n');
  } else {
    const action =
      plan.action === 'BUY_CE'
        ? 'BUY CE (paper)'
        : plan.action === 'BUY_PE'
          ? 'BUY PE (paper)'
          : 'WAIT — no force';

    body = [
      `NEJOIC INDIA DESK · NIFTY (${f.tf})`,
      `${istClock()} IST · Spot ₹${p.spot.toFixed(2)} (${pts}) · Focus ${f.tf}`,
      `Session: ${deskLabel('INDIA')}`,
      ``,
      `1) VERDICT`,
      `Action: ${action}`,
      `Conviction: ${plan.conviction} · Score ${p.scorePct}% (${p.fired}/${p.total})`,
      `Why: ${plan.why}`,
      `${p.decisionReason}`,
      ``,
      `2) MULTI-TIMEFRAME BIAS`,
      `• ${f.tf}: ${f.trend} · ${f.pattern}`,
      `  Path: ${f.structurePath}`,
      `  Momentum: ${f.momentum} · Range position: ${f.rangePos}% · ATR: ${f.atr.toFixed(1)}`,
      `• Daily: ${d ? `${d.trend} · ${d.pattern}` : 'n/a'}`,
      `• Weekly: ${w ? `${w.trend} · ${w.pattern}` : 'n/a'}`,
      ``,
      `3) KEY MAP`,
      `• Nearest zone: ${f.nearestZone}`,
      `• Focus S / R: ${f.support != null ? `₹${f.support.toFixed(2)}` : '—'} / ${f.resistance != null ? `₹${f.resistance.toFixed(2)}` : '—'}`,
      `• Session H / L / Pivot: ₹${f.dayHigh.toFixed(2)} / ₹${f.dayLow.toFixed(2)} / ₹${f.pivot.toFixed(2)}`,
      ``,
      `4) CANDLE CONTEXT (last 3)`,
      ...f.candleStory.map((line) => `• ${line}`),
      ``,
      `5) CONFLUENCE`,
      ...(p.confluence.length ? p.confluence.map((x) => `+ ${x}`) : ['+ none strong']),
      ``,
      `6) CONFLICTS / RISK`,
      ...(p.conflicts.length ? p.conflicts.map((x) => `- ${x}`) : ['- none major']),
      ``,
      `7) TRADE PLAN`,
      `• Entry trigger: ${plan.entryTrigger}`,
      `• Invalidation: ${plan.invalidation}`,
      `• ${plan.target1}`,
      `• ${plan.target2}`,
      `• Contract: ${plan.suggestedSide === 'NONE' ? `ATM ${plan.suggestedStrike}` : `ATM ${plan.suggestedStrike} ${plan.suggestedSide}`}`,
      `• ${plan.riskNote}`,
      `• Timing: ${plan.whenToAct}`,
      ``,
      `Rule: no close confirmation = no paper trade. Nejoic · paper only.`,
    ].join('\n');
  }

  if (settings?.telegramIncludeStudies !== false) {
    body += `\n\n${formatStudyBlock(p, settings)}`;
  }
  return body;
}

function formatStudyBlock(p: LivePulse, settings?: Partial<NejoicSettings>): string {
  const s = settings || {};
  const ids = normalizeStrategyIds(s.strategyIds, s.strategyId);
  const lines = [
    `STUDIES (controls this Telegram report)`,
    `• Instrument: ${p.asset}`,
    `• Timeframe: ${p.focus.tf}`,
    `• Strategies: ${ids.map(strategyLabel).join(', ')}`,
    `• Style: ${s.analysisStyle || 'strict'} · Min confidence: ${s.minConfidence ?? 70}%`,
    `• HH/LL bars: L${s.leftBars ?? 5} / R${s.rightBars ?? 5}`,
  ];
  if (ids.includes('ema_cross')) {
    lines.push(`• EMA: ${s.emaFast ?? 9} / ${s.emaSlow ?? 21}`);
  }
  if (ids.includes('rsi_bounce')) {
    lines.push(
      `• RSI: period ${s.rsiPeriod ?? 14} · OS ${s.rsiOversold ?? 30} · OB ${s.rsiOverbought ?? 70}`
    );
  }
  if (ids.includes('breakout')) {
    lines.push(`• Breakout lookback: ${s.breakoutLookback ?? 20}`);
  }
  if (ids.includes('orb')) {
    lines.push(`• ORB minutes: ${s.orbMinutes ?? 15}`);
  }
  lines.push(`• Delivery: Alerts → Telegram · Maths: Nejoic Settings.`);
  return lines.join('\n');
}

export type PulseInstrument = 'AUTO' | 'NIFTY' | 'GOLD' | 'BTC';

export async function buildLivePulse(
  focusTfRaw: string = '5m',
  settings?: Partial<NejoicSettings>,
  opts?: { instrument?: PulseInstrument }
): Promise<LivePulse> {
  const instrument = (opts?.instrument ||
    settings?.telegramInstrument ||
    'AUTO') as PulseInstrument;

  const resolveAuto = (): PulseInstrument => {
    const desk = getActiveDesk();
    if (desk === 'GOLD') return 'GOLD';
    if (desk === 'BTC') return 'BTC';
    return 'NIFTY';
  };

  const target = instrument === 'AUTO' ? resolveAuto() : instrument;

  // Telegram / user TF wins; AUTO desk still picks the asset but respects chosen TF.
  const tf =
    settings?.telegramTimeframe ||
    focusTfRaw ||
    (target !== 'NIFTY' ? deskForcedTimeframe(target === 'GOLD' ? 'GOLD' : 'BTC') : null) ||
    settings?.primaryTimeframe ||
    '15m';

  let pulse: LivePulse;
  if (target === 'GOLD') {
    pulse = await buildSingleAssetPulse('GOLD', 'GC=F', 'Gold', String(tf), settings);
  } else if (target === 'BTC') {
    pulse = await buildSingleAssetPulse('BTC', 'BTC-USD', 'Bitcoin', String(tf), settings);
  } else {
    pulse = await buildIndiaPulse(String(tf), settings);
  }
  pulse.text = formatPulseText(pulse, settings);
  return pulse;
}

async function buildSingleAssetPulse(
  asset: 'GOLD' | 'BTC',
  yahooSymbol: string,
  label: string,
  focusTfRaw: string,
  settings?: Partial<NejoicSettings>
): Promise<LivePulse> {
  const desk: MarketDesk = asset === 'GOLD' ? 'GOLD' : 'BTC';
  const focusId = normalizeTimeframeId(focusTfRaw);
  const focusYahoo = timeframeToYahoo(focusId) as YahooInterval;

  const [focusFetch, dailyFetch] = await Promise.all([
    fetchYahooCandles(yahooSymbol, focusYahoo, 120, label),
    fetchYahooCandles(yahooSymbol, '1d', 80, label),
  ]);

  const emptyFocus = (tf: string): TfPulse => ({
    tf,
    spot: 0,
    trend: 'FLAT',
    pattern: '—',
    structurePath: '—',
    lastHH: null,
    lastHL: null,
    lastLH: null,
    lastLL: null,
    support: null,
    resistance: null,
    bias: 'FLAT',
    setup: 'NO_DATA',
    confidence: 0,
    dayHigh: 0,
    dayLow: 0,
    pivot: 0,
    atr: 0,
    rangePos: 50,
    momentum: 'MIXED',
    candleStory: [],
    nearestZone: '—',
  });

  if (!focusFetch.ok || focusFetch.candles.length < 10) {
    const failPlan: TradePlan = {
      action: 'WAIT',
      conviction: 'LOW',
      why: `No ${asset} feed`,
      entryTrigger: '—',
      invalidation: '—',
      target1: '—',
      target2: '—',
      suggestedStrike: 0,
      suggestedSide: 'NONE',
      riskNote: focusFetch.error || 'No data',
      whenToAct: 'Retry Pulse',
    };
    const fail: LivePulse = {
      at: new Date().toISOString(),
      desk,
      asset,
      spot: 0,
      changePts: 0,
      sessionNote: `${asset} feed unavailable.`,
      proRead: `Could not load ${label} (${focusId}).`,
      focus: emptyFocus(focusId),
      weekly: null,
      daily: null,
      extras: [],
      decision: 'WAIT',
      decisionReason: focusFetch.error || 'No data',
      buyCeIf: [],
      buyPeIf: [],
      plan: failPlan,
      confluence: [],
      conflicts: ['Data feed failed'],
      scorePct: 0,
      scoreLabel: 'LOW',
      fired: 0,
      total: 24,
      text: '',
      ok: false,
      error: focusFetch.error || 'No data',
    };
    fail.text = formatPulseText(fail, settings);
    return fail;
  }

  const focus = buildTf(focusId, focusFetch.candles, focusFetch.spot, settings);
  const daily = dailyFetch.ok
    ? buildTf('1D', dailyFetch.candles, dailyFetch.spot, settings)
    : null;
  const prev = focusFetch.prevClose ?? focusFetch.candles[0]?.close ?? focus.spot;
  const changePts = Math.round((focus.spot - prev) * 100) / 100;

  const dec = analyzeDecision(focus, daily, null, false, true);
  const scoreLabel: LivePulse['scoreLabel'] =
    dec.scorePct >= 62 ? 'HIGH' : dec.scorePct >= 42 ? 'MEDIUM' : 'LOW';
  const plan = buildPlan(focus, daily, null, dec.decision, false, true, scoreLabel);

  if (plan.action === 'BUY_CE') {
    plan.why = `${asset} long bias · ${plan.why}`;
    plan.suggestedSide = 'NONE';
    plan.entryTrigger = plan.entryTrigger.replace(/CE/gi, 'LONG');
  } else if (plan.action === 'BUY_PE') {
    plan.why = `${asset} short bias · ${plan.why}`;
    plan.suggestedSide = 'NONE';
    plan.entryTrigger = plan.entryTrigger.replace(/PE/gi, 'SHORT');
  }

  const pulse: LivePulse = {
    at: new Date().toISOString(),
    desk,
    asset,
    spot: focus.spot,
    changePts,
    sessionNote: `${deskLabel(desk)} · ${focus.setup} · ${focus.confidence}%`,
    proRead:
      asset === 'GOLD'
        ? `After hours: Gold only on 15m (${focus.trend}). ${dec.reason}`
        : `Weekend: BTC only on 15m (${focus.trend}). ${dec.reason}`,
    focus,
    weekly: null,
    daily,
    extras: [],
    decision: dec.decision,
    decisionReason: dec.reason,
    buyCeIf: dec.buyCeIf,
    buyPeIf: dec.buyPeIf,
    plan,
    confluence: dec.confluence,
    conflicts: dec.conflicts,
    scorePct: dec.scorePct,
    scoreLabel,
    fired: dec.fired,
    total: dec.total,
    text: '',
    ok: true,
  };
  pulse.text = formatPulseText(pulse, settings);
  return pulse;
}

async function buildIndiaPulse(
  focusTfRaw: string = '5m',
  settings?: Partial<NejoicSettings>
): Promise<LivePulse> {
  const focusId = normalizeTimeframeId(focusTfRaw);
  const focusYahoo = timeframeToYahoo(focusId) as YahooInterval;
  const respectLunch = settings?.respectLunchHour !== false;
  const onlySession = settings?.tradeOnlyMarketHours !== false;

  const [focusFetch, dailyFetch, weeklyFetch] = await Promise.all([
    fetchNiftyCandles(focusYahoo),
    fetchNiftyCandles('1d', 80),
    fetchNiftyCandles('1wk', 60),
  ]);

  const emptyFocus = (tf: string): TfPulse => ({
    tf,
    spot: 0,
    trend: 'FLAT',
    pattern: '—',
    structurePath: '—',
    lastHH: null,
    lastHL: null,
    lastLH: null,
    lastLL: null,
    support: null,
    resistance: null,
    bias: 'FLAT',
    setup: 'NO_DATA',
    confidence: 0,
    dayHigh: 0,
    dayLow: 0,
    pivot: 0,
    atr: 0,
    rangePos: 50,
    momentum: 'MIXED',
    candleStory: [],
    nearestZone: '—',
  });

  if (!focusFetch.ok || focusFetch.candles.length < 10) {
    const failPlan: TradePlan = {
      action: 'WAIT',
      conviction: 'LOW',
      why: 'No live candles',
      entryTrigger: '—',
      invalidation: '—',
      target1: '—',
      target2: '—',
      suggestedStrike: 0,
      suggestedSide: 'NONE',
      riskNote: focusFetch.error || 'No data',
      whenToAct: 'Retry Pulse in a minute',
    };
    const fail: LivePulse = {
      at: new Date().toISOString(),
      desk: 'INDIA',
      asset: 'NIFTY',
      spot: 0,
      changePts: 0,
      sessionNote: 'Feed unavailable.',
      proRead: 'Could not load Nifty data.',
      focus: emptyFocus(focusId),
      weekly: null,
      daily: null,
      decision: 'WAIT',
      decisionReason: focusFetch.error || 'No data',
      buyCeIf: [],
      buyPeIf: [],
      plan: failPlan,
      confluence: [],
      conflicts: ['Data feed failed'],
      scorePct: 0,
      scoreLabel: 'LOW',
      fired: 0,
      total: 24,
      text: '',
      ok: false,
      error: focusFetch.error || 'No data',
    };
    fail.text = formatPulseText(fail, settings);
    return fail;
  }

  const focus = buildTf(focusId, focusFetch.candles, focusFetch.spot, settings);
  const daily = dailyFetch.ok
    ? buildTf('1D', dailyFetch.candles, dailyFetch.spot, settings)
    : null;
  const weekly = weeklyFetch.ok
    ? buildTf('1W', weeklyFetch.candles, weeklyFetch.spot, settings)
    : null;

  const prev = focusFetch.prevClose ?? focusFetch.candles[0]?.close ?? focus.spot;
  const changePts = Math.round((focus.spot - prev) * 100) / 100;
  const lunch = respectLunch && isIndiaLunch();
  const marketOpen = !onlySession || isIndiaCashSession();
  const dec = analyzeDecision(focus, daily, weekly, lunch, marketOpen);

  const scoreLabel: LivePulse['scoreLabel'] =
    dec.scorePct >= 62 ? 'HIGH' : dec.scorePct >= 42 ? 'MEDIUM' : 'LOW';

  const plan = buildPlan(focus, daily, weekly, dec.decision, lunch, marketOpen, scoreLabel);

  const proRead = [
    `Focus ${focus.tf} is ${focus.trend.toLowerCase()} with ${focus.momentum.toLowerCase()} momentum.`,
    `Nearest pressure: ${focus.nearestZone}.`,
    daily
      ? `Daily is ${daily.trend.toLowerCase()}.`
      : 'Daily map unavailable.',
    marketOpen
      ? lunch
        ? 'Lunch window: observe unless a clean close trigger prints.'
        : 'India session open — only trade close-confirmed triggers.'
      : 'Outside India hours — this path should not run (desk switch).',
  ].join(' ');

  const sessionNote = `${focus.setup} · conf ${focus.confidence}% · ATR ${focus.atr.toFixed(0)} · ${focus.nearestZone}`;

  const pulse: LivePulse = {
    at: new Date().toISOString(),
    desk: 'INDIA',
    asset: 'NIFTY',
    spot: focus.spot,
    changePts,
    sessionNote,
    proRead,
    focus,
    weekly,
    daily,
    decision: dec.decision,
    decisionReason: dec.reason,
    buyCeIf: dec.buyCeIf,
    buyPeIf: dec.buyPeIf,
    plan,
    confluence: dec.confluence,
    conflicts: dec.conflicts,
    scorePct: dec.scorePct,
    scoreLabel,
    fired: dec.fired,
    total: dec.total,
    text: '',
    ok: true,
  };
  pulse.text = formatPulseText(pulse, settings);
  return pulse;
}

export function parseTimeframe(raw: string | null | undefined): string {
  return normalizeTimeframeId(raw);
}
