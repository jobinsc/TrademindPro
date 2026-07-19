/** Commodity Channel Index — classic Lambert CCI (no other indicators) */

export type OhlcBar = {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function typicalPrice(b: OhlcBar): number {
  return (b.high + b.low + b.close) / 3;
}

/**
 * CCI(period) series aligned to bars.
 * Early bars (before period) are null.
 */
export function computeCci(bars: OhlcBar[], period = 20): (number | null)[] {
  const out: (number | null)[] = bars.map(() => null);
  if (bars.length < period) return out;

  const tp = bars.map(typicalPrice);

  for (let i = period - 1; i < bars.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const meanDev = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    if (meanDev === 0) {
      out[i] = 0;
    } else {
      out[i] = (tp[i] - sma) / (0.015 * meanDev);
    }
  }
  return out;
}

export type CciCross = {
  /** Index of bar where cross is detected (current bar) */
  index: number;
  direction: 'up_through_zero' | 'down_through_zero';
  prev: number;
  curr: number;
};

/** Detect CCI crossing zero: from below→above (bull) or above→below (bear) */
export function detectZeroCross(
  cci: (number | null)[],
  lookback = 3
): CciCross | null {
  for (let i = cci.length - 1; i >= Math.max(1, cci.length - lookback); i--) {
    const curr = cci[i];
    const prev = cci[i - 1];
    if (curr == null || prev == null) continue;
    if (prev < 0 && curr >= 0) {
      return { index: i, direction: 'up_through_zero', prev, curr };
    }
    if (prev > 0 && curr <= 0) {
      return { index: i, direction: 'down_through_zero', prev, curr };
    }
  }
  return null;
}

/** Simple PA confirm after CCI cross — no extra indicators */
export function priceActionConfirm(
  bars: OhlcBar[],
  direction: CciCross['direction']
): { ok: boolean; detail: string } {
  if (bars.length < 4) return { ok: false, detail: 'Not enough bars for PA confirm' };
  const a = bars[bars.length - 4];
  const b = bars[bars.length - 3];
  const c = bars[bars.length - 2];
  const d = bars[bars.length - 1];

  if (direction === 'up_through_zero') {
    // Rising closes / higher low structure after cross
    const rising = d.close > c.close && c.close >= b.close * 0.998;
    const hl = d.low >= Math.min(b.low, c.low) * 0.999;
    const bullBar = d.close >= d.open;
    if ((rising || hl) && (bullBar || d.close > c.close)) {
      return {
        ok: true,
        detail: 'PA confirm: price holding / lifting after CCI crossed above 0',
      };
    }
    return {
      ok: false,
      detail: 'CCI crossed up but price action not confirming yet — wait',
    };
  }

  // down through zero
  const falling = d.close < c.close && c.close <= b.close * 1.002;
  const lh = d.high <= Math.max(b.high, c.high) * 1.001;
  const bearBar = d.close <= d.open;
  if ((falling || lh) && (bearBar || d.close < c.close)) {
    return {
      ok: true,
      detail: 'PA confirm: price softening / rejecting after CCI crossed below 0',
    };
  }
  return {
    ok: false,
    detail: 'CCI crossed down but price action not confirming yet — wait',
  };
}
