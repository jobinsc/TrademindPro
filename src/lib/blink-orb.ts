/**
 * Classic Opening Range Breakout for Blink.
 *
 * Your rule:
 * 1) First N minutes after 09:15 IST = opening range (high / low)
 * 2) After range completes, wait for a candle CLOSE above range high → CE (buy)
 *    or CLOSE below range low → PE
 * 3) Stop = other side of the range (CE SL below range low, PE SL above range high)
 * 4) Only the FIRST break of the day counts (no re-entries while already broken)
 */

import type { Candle, OptionBias } from '@/lib/nejoic';

export type BlinkOrbLevels = {
  orHigh: number;
  orLow: number;
  orbMinutes: number;
  rangeReady: boolean;
};

export type BlinkOrbSignal = {
  bias: OptionBias;
  setup: string;
  confidence: number;
  reason: string;
  orHigh: number;
  orLow: number;
  orbMinutes: number;
};

function minutesFromOpenIst(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const istMin = (utcMin + 330) % (24 * 60);
  return istMin - (9 * 60 + 15);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Candles for the session day of the last bar */
function sessionCandles(candles: Candle[]): Candle[] {
  if (!candles.length) return [];
  const day = dayKey(candles[candles.length - 1].t);
  return candles.filter((c) => dayKey(c.t) === day);
}

export function computeOpeningRange(
  candles: Candle[],
  orbMinutes = 5
): BlinkOrbLevels | null {
  const mins = Math.max(5, Math.min(60, orbMinutes));
  const session = sessionCandles(candles);
  if (session.length < 2) return null;

  let rangeBars = session.filter((c) => {
    const m = minutesFromOpenIst(c.t);
    return m != null && m >= 0 && m < mins;
  });

  // Fallback when timestamps lack session alignment: first N bars ≈ range
  if (rangeBars.length < 1) {
    const approxBars = Math.max(1, Math.round(mins / 5));
    rangeBars = session.slice(0, Math.min(session.length - 1, approxBars));
  }

  if (!rangeBars.length) return null;

  const lastMin = minutesFromOpenIst(session[session.length - 1].t);
  const rangeReady =
    lastMin == null ? session.length > rangeBars.length : lastMin >= mins;

  return {
    orHigh: Math.max(...rangeBars.map((c) => c.high)),
    orLow: Math.min(...rangeBars.map((c) => c.low)),
    orbMinutes: mins,
    rangeReady,
  };
}

/**
 * True ORB: close above high / below low, first break of the day only.
 */
export function analyzeBlinkOrb(
  candles: Candle[],
  orbMinutes = 5
): BlinkOrbSignal {
  const levels = computeOpeningRange(candles, orbMinutes);
  if (!levels) {
    return {
      bias: 'FLAT',
      setup: 'ORB_WAIT',
      confidence: 30,
      reason: 'Opening range not formed yet.',
      orHigh: 0,
      orLow: 0,
      orbMinutes,
    };
  }

  const { orHigh, orLow, orbMinutes: mins, rangeReady } = levels;
  const flat = (setup: string, reason: string, confidence = 40): BlinkOrbSignal => ({
    bias: 'FLAT',
    setup,
    confidence,
    reason,
    orHigh,
    orLow,
    orbMinutes: mins,
  });

  if (!rangeReady) {
    return flat(
      'ORB_FORMING',
      `Building ${mins}m opening range… High ₹${orHigh.toFixed(0)} / Low ₹${orLow.toFixed(0)}.`
    );
  }

  if (orHigh <= orLow) {
    return flat('ORB_FLAT_RANGE', 'Opening range has no width yet.');
  }

  const session = sessionCandles(candles);
  const last = session[session.length - 1];
  const prev = session[session.length - 2];
  if (!last || !prev) {
    return flat('ORB_WAIT', 'Need at least one bar after the opening range.');
  }

  // Bars after the range window — check first break only
  const afterRange = session.filter((c) => {
    const m = minutesFromOpenIst(c.t);
    if (m == null) return true;
    return m >= mins;
  });

  if (afterRange.length < 1) {
    return flat(
      'ORB_READY',
      `${mins}m range ready ₹${orLow.toFixed(0)}–₹${orHigh.toFixed(0)}. Waiting for close break.`
    );
  }

  // Did any earlier after-range bar already close outside the range?
  for (let i = 0; i < afterRange.length - 1; i++) {
    const c = afterRange[i];
    if (c.close > orHigh || c.close < orLow) {
      return flat(
        'ORB_ALREADY_BROKE',
        `First ${mins}m break already happened earlier today. No re-entry.`,
        42
      );
    }
  }

  const close = last.close;
  const prevClose = prev.close;

  // Close above range high → CE (buy)
  if (prevClose <= orHigh && close > orHigh) {
    return {
      bias: 'CE',
      setup: 'ORB_BREAK_HIGH',
      confidence: 78,
      reason: `ORB ${mins}m: close ₹${close.toFixed(0)} above range high ₹${orHigh.toFixed(0)}. SL below ₹${orLow.toFixed(0)}.`,
      orHigh,
      orLow,
      orbMinutes: mins,
    };
  }

  // Close below range low → PE
  if (prevClose >= orLow && close < orLow) {
    return {
      bias: 'PE',
      setup: 'ORB_BREAK_LOW',
      confidence: 78,
      reason: `ORB ${mins}m: close ₹${close.toFixed(0)} below range low ₹${orLow.toFixed(0)}. SL above ₹${orHigh.toFixed(0)}.`,
      orHigh,
      orLow,
      orbMinutes: mins,
    };
  }

  return flat(
    'ORB_INSIDE',
    `Inside ${mins}m ORB ₹${orLow.toFixed(0)}–₹${orHigh.toFixed(0)}. Need close outside.`
  );
}

/** Spot stop for an ORB trade */
export function orbStopSpot(side: 'CE' | 'PE', orHigh: number, orLow: number): number {
  return side === 'CE' ? orLow : orHigh;
}
