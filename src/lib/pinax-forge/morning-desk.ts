/**
 * PinaxForge morning desk — prior 2–3 sessions, bias, S/R, buy/sell zones.
 * Standalone logic (not imported from Blink modules).
 */

import type { Candle } from '@/lib/nejoic';
import { istMinutesOfDay } from '@/lib/pinax-forge/ist';

export type DeskBias = 'UP' | 'DOWN' | 'SIDEWAYS';

export type PriorDaySummary = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  changePts: number;
};

export type PinaxMorningContext = {
  sessionDate: string;
  priorDays: PriorDaySummary[];
  pdh: number | null;
  pdl: number | null;
  priorClose: number | null;
  threeDayTrend: DeskBias;
  threeDayNote: string;
};

export type PinaxMorningRead = {
  bias: DeskBias;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  spot: number;
  fromOpenPts: number;
  vsPriorClosePts: number | null;
  vsPdhPts: number | null;
  vsPdlPts: number | null;
  lowerHighs: boolean;
  lowerLows: boolean;
  higherHighs: boolean;
  higherLows: boolean;
  reasons: string[];
  confidence: number;
};

export type TradingZone = {
  kind: 'BUY' | 'SELL';
  low: number;
  high: number;
  anchor: string;
  reason: string;
};

function istDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function summarizeDay(date: string, bars: Candle[]): PriorDaySummary | null {
  if (!bars.length) return null;
  const open = bars[0].open;
  const close = bars[bars.length - 1].close;
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  return {
    date,
    open,
    high,
    low,
    close,
    range: Math.round((high - low) * 10) / 10,
    changePts: Math.round((close - open) * 10) / 10,
  };
}

export function buildPinaxMorningContext(
  historyCandles: Candle[],
  sessionDate: string
): PinaxMorningContext {
  const byDate = new Map<string, Candle[]>();
  for (const c of historyCandles) {
    const d = istDateKey(c.t);
    if (!d || d >= sessionDate) continue;
    const mins = istMinutesOfDay(c.t);
    if (mins == null || mins < 9 * 60 + 15 || mins > 15 * 60 + 30) continue;
    const list = byDate.get(d) ?? [];
    list.push(c);
    byDate.set(d, list);
  }

  const dates = [...byDate.keys()].sort().slice(-3);
  const priorDays: PriorDaySummary[] = [];
  for (const d of dates) {
    const summary = summarizeDay(d, byDate.get(d) || []);
    if (summary) priorDays.push(summary);
  }

  const last = priorDays[priorDays.length - 1] ?? null;
  let threeDayTrend: DeskBias = 'SIDEWAYS';
  let threeDayNote = 'Need prior sessions for multi-day context.';
  if (priorDays.length >= 2) {
    const first = priorDays[0];
    const net = last!.close - first.open;
    const downDays = priorDays.filter((d) => d.changePts < -20).length;
    const upDays = priorDays.filter((d) => d.changePts > 20).length;
    if (net <= -80 || (downDays >= 2 && net < 0)) {
      threeDayTrend = 'DOWN';
      threeDayNote = `Prior ${priorDays.length} sessions net ${net.toFixed(0)} pts — bearish backdrop; favor PE on rallies.`;
    } else if (net >= 80 || (upDays >= 2 && net > 0)) {
      threeDayTrend = 'UP';
      threeDayNote = `Prior ${priorDays.length} sessions net ${net.toFixed(0)} pts — bullish backdrop; favor CE on dips.`;
    } else {
      threeDayTrend = 'SIDEWAYS';
      threeDayNote = `Prior ${priorDays.length} sessions mixed (net ${net.toFixed(0)} pts) — trade levels, not hope.`;
    }
  } else if (last) {
    threeDayTrend = last.changePts <= -40 ? 'DOWN' : last.changePts >= 40 ? 'UP' : 'SIDEWAYS';
    threeDayNote = `Prior day ${last.date}: ${last.changePts >= 0 ? '+' : ''}${last.changePts} pts.`;
  }

  return {
    sessionDate,
    priorDays,
    pdh: last?.high ?? null,
    pdl: last?.low ?? null,
    priorClose: last?.close ?? null,
    threeDayTrend,
    threeDayNote,
  };
}

function swingFlags(bars: Candle[]) {
  if (bars.length < 6) {
    return {
      lowerHighs: false,
      lowerLows: false,
      higherHighs: false,
      higherLows: false,
    };
  }
  const mid = Math.floor(bars.length / 2);
  const a = bars.slice(0, mid);
  const b = bars.slice(mid);
  const aH = Math.max(...a.map((x) => x.high));
  const aL = Math.min(...a.map((x) => x.low));
  const bH = Math.max(...b.map((x) => x.high));
  const bL = Math.min(...b.map((x) => x.low));
  return {
    lowerHighs: bH < aH - 3,
    lowerLows: bL < aL - 3,
    higherHighs: bH > aH + 3,
    higherLows: bL > aL + 3,
  };
}

export function readPinaxMorningDesk(
  todayCandles: Candle[],
  context: PinaxMorningContext | null,
  spot: number
): PinaxMorningRead | null {
  if (!todayCandles.length) return null;
  const bars = [...todayCandles].sort((a, b) => a.t.localeCompare(b.t));
  const dayOpen = bars[0].open;
  const dayHigh = Math.max(...bars.map((b) => b.high));
  const dayLow = Math.min(...bars.map((b) => b.low));
  const fromOpenPts = Math.round((spot - dayOpen) * 10) / 10;
  const swings = swingFlags(bars);
  const reasons: string[] = [];
  let scoreDown = 0;
  let scoreUp = 0;

  if (fromOpenPts <= -25) {
    scoreDown += 3;
    reasons.push(`Morning drive ${fromOpenPts} pts from open`);
  } else if (fromOpenPts <= -12) {
    scoreDown += 2;
    reasons.push(`Soft open ${fromOpenPts} pts`);
  } else if (fromOpenPts >= 25) {
    scoreUp += 3;
    reasons.push(`Morning drive +${fromOpenPts} pts from open`);
  } else if (fromOpenPts >= 12) {
    scoreUp += 2;
    reasons.push(`Firm open +${fromOpenPts} pts`);
  }

  if (swings.lowerHighs && swings.lowerLows) {
    scoreDown += 3;
    reasons.push('Lower highs + lower lows forming');
  } else if (swings.lowerHighs || swings.lowerLows) {
    scoreDown += 1;
    reasons.push(swings.lowerHighs ? 'Lower highs printing' : 'Lower lows printing');
  }
  if (swings.higherHighs && swings.higherLows) {
    scoreUp += 3;
    reasons.push('Higher highs + higher lows forming');
  } else if (swings.higherHighs || swings.higherLows) {
    scoreUp += 1;
    reasons.push(swings.higherHighs ? 'Higher highs printing' : 'Higher lows printing');
  }

  const vsPriorClosePts =
    context?.priorClose != null
      ? Math.round((spot - context.priorClose) * 10) / 10
      : null;
  const vsPdhPts =
    context?.pdh != null ? Math.round((spot - context.pdh) * 10) / 10 : null;
  const vsPdlPts =
    context?.pdl != null ? Math.round((spot - context.pdl) * 10) / 10 : null;

  if (vsPriorClosePts != null) {
    if (vsPriorClosePts <= -40) {
      scoreDown += 2;
      reasons.push(`${vsPriorClosePts} vs prior close`);
    } else if (vsPriorClosePts >= 40) {
      scoreUp += 2;
      reasons.push(`+${vsPriorClosePts} vs prior close`);
    }
  }
  if (vsPdhPts != null && vsPdhPts < -15) {
    scoreDown += 1;
    reasons.push(`Below PDH by ${Math.abs(vsPdhPts).toFixed(0)} pts`);
  }
  if (vsPdlPts != null && vsPdlPts > 15) {
    scoreUp += 1;
    reasons.push(`Above PDL by ${vsPdlPts.toFixed(0)} pts`);
  }
  if (context?.threeDayTrend === 'DOWN') {
    scoreDown += 1;
    reasons.push('3-day backdrop DOWN');
  } else if (context?.threeDayTrend === 'UP') {
    scoreUp += 1;
    reasons.push('3-day backdrop UP');
  }

  if (dayHigh - spot >= 30 && fromOpenPts < 0) {
    scoreDown += 1;
    reasons.push('Failed to hold day highs — sellers in control');
  }
  if (spot - dayLow >= 30 && fromOpenPts > 0) {
    scoreUp += 1;
    reasons.push('Holding off day lows — buyers in control');
  }

  let bias: DeskBias = 'SIDEWAYS';
  if (scoreDown >= scoreUp + 2 && scoreDown >= 3) bias = 'DOWN';
  else if (scoreUp >= scoreDown + 2 && scoreUp >= 3) bias = 'UP';
  else if (scoreDown >= 4 && scoreDown > scoreUp) bias = 'DOWN';
  else if (scoreUp >= 4 && scoreUp > scoreDown) bias = 'UP';

  if (!reasons.length) reasons.push('No clear morning structure yet');

  const confidence = Math.min(
    92,
    40 + Math.max(scoreDown, scoreUp) * 8 + (bias !== 'SIDEWAYS' ? 10 : 0)
  );

  return {
    bias,
    dayOpen,
    dayHigh,
    dayLow,
    spot,
    fromOpenPts,
    vsPriorClosePts,
    vsPdhPts,
    vsPdlPts,
    ...swings,
    reasons: reasons.slice(0, 6),
    confidence,
  };
}

export function buildTradingZones(
  context: PinaxMorningContext,
  morningRead: PinaxMorningRead | null,
  support: number | null,
  resistance: number | null
): TradingZone[] {
  const zones: TradingZone[] = [];
  const pad = 8;

  if (context.pdl != null) {
    zones.push({
      kind: 'BUY',
      low: context.pdl - pad,
      high: context.pdl + pad,
      anchor: 'PDL',
      reason: 'Prior day low — dip-buy zone if structure holds',
    });
  }
  if (context.pdh != null) {
    zones.push({
      kind: 'SELL',
      low: context.pdh - pad,
      high: context.pdh + pad,
      anchor: 'PDH',
      reason: 'Prior day high — fade/rally-sell zone if rejection prints',
    });
  }
  if (support != null) {
    zones.push({
      kind: 'BUY',
      low: support - pad,
      high: support + pad,
      anchor: 'SUPPORT',
      reason: '1m structure support — CE on HL + hold',
    });
  }
  if (resistance != null) {
    zones.push({
      kind: 'SELL',
      low: resistance - pad,
      high: resistance + pad,
      anchor: 'RESISTANCE',
      reason: '1m structure resistance — PE on LH + rejection',
    });
  }
  if (context.priorClose != null && morningRead) {
    const pc = context.priorClose;
    if (morningRead.bias === 'UP' || morningRead.bias === 'SIDEWAYS') {
      zones.push({
        kind: 'BUY',
        low: pc - pad * 2,
        high: pc + pad,
        anchor: 'PRIOR_CLOSE',
        reason: 'Pullback toward prior close in bullish/mixed backdrop',
      });
    }
    if (morningRead.bias === 'DOWN' || morningRead.bias === 'SIDEWAYS') {
      zones.push({
        kind: 'SELL',
        low: pc - pad,
        high: pc + pad * 2,
        anchor: 'PRIOR_CLOSE',
        reason: 'Bounce into prior close in bearish/mixed backdrop',
      });
    }
  }
  return zones;
}

export function splitSessionCandles(
  candles: Candle[],
  sessionDate: string
): { today: Candle[]; prior: Candle[] } {
  const today: Candle[] = [];
  const prior: Candle[] = [];
  for (const c of candles) {
    const d = istDateKey(c.t);
    if (d === sessionDate) today.push(c);
    else if (d && d < sessionDate) prior.push(c);
  }
  return {
    today: today.sort((a, b) => a.t.localeCompare(b.t)),
    prior: prior.sort((a, b) => a.t.localeCompare(b.t)),
  };
}
