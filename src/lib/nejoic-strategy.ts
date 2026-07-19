import type { Candle, OptionBias } from '@/lib/nejoic';
import type { NejoicStrategyId } from '@/lib/nejoic-options';

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

function rsi(closes: number[], period: number): number {
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
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

function macdLine(closes: number[]): { macd: number[]; signal: number[] } {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = fast.map((f, i) => f - slow[i]);
  const signal = ema(macd, 9);
  return { macd, signal };
}

/** Approx VWAP from typical price (equal weight when volume missing). */
function sessionVwap(candles: Candle[]): number[] {
  const out: number[] = [];
  let cumTp = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.high + c.low + c.close) / 3;
    // Synthetic volume from range so recent bars matter a bit more
    const vol = Math.max(1, c.high - c.low);
    cumTp += tp * vol;
    cumVol += vol;
    out.push(cumVol > 0 ? cumTp / cumVol : tp);
  }
  return out;
}

function minutesFromOpenIst(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // IST = UTC+5:30
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const istMin = (utcMin + 330) % (24 * 60);
  const open = 9 * 60 + 15; // 09:15
  return istMin - open;
}

export type StrategyRead = {
  bias: OptionBias;
  setup: string;
  confidence: number;
  reason: string;
};

export function runNejoicStrategy(
  strategy: NejoicStrategyId,
  candles: Candle[],
  opts: {
    emaFast: number;
    emaSlow: number;
    rsiPeriod: number;
    rsiOversold: number;
    rsiOverbought: number;
    breakoutLookback: number;
    orbMinutes?: number;
  }
): StrategyRead | null {
  const closes = candles.map((c) => c.close);
  const spot = closes[closes.length - 1] ?? 0;
  if (closes.length < 10) return null;

  if (strategy === 'ema_cross') {
    const fast = ema(closes, Math.max(2, opts.emaFast));
    const slow = ema(closes, Math.max(3, opts.emaSlow));
    const i = closes.length - 1;
    const prevCrossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const prevCrossDn = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    if (prevCrossUp) {
      return {
        bias: 'CE',
        setup: 'EMA_CROSS_UP',
        confidence: 72,
        reason: `EMA ${opts.emaFast} crossed above EMA ${opts.emaSlow}.`,
      };
    }
    if (prevCrossDn) {
      return {
        bias: 'PE',
        setup: 'EMA_CROSS_DOWN',
        confidence: 72,
        reason: `EMA ${opts.emaFast} crossed below EMA ${opts.emaSlow}.`,
      };
    }
    const bull = fast[i] > slow[i];
    return {
      bias: 'FLAT',
      setup: bull ? 'EMA_BULL_WAIT' : 'EMA_BEAR_WAIT',
      confidence: 45,
      reason: `No fresh cross. Fast ${fast[i].toFixed(1)} vs Slow ${slow[i].toFixed(1)}.`,
    };
  }

  if (strategy === 'rsi_bounce') {
    const r = rsi(closes, Math.max(2, opts.rsiPeriod));
    const prev = rsi(closes.slice(0, -1), Math.max(2, opts.rsiPeriod));
    if (prev <= opts.rsiOversold && r > opts.rsiOversold) {
      return {
        bias: 'CE',
        setup: 'RSI_OVERSOLD_BOUNCE',
        confidence: 70,
        reason: `RSI rose from oversold (${r.toFixed(0)}).`,
      };
    }
    if (prev >= opts.rsiOverbought && r < opts.rsiOverbought) {
      return {
        bias: 'PE',
        setup: 'RSI_OVERBOUGHT_TURN',
        confidence: 70,
        reason: `RSI fell from overbought (${r.toFixed(0)}).`,
      };
    }
    return {
      bias: 'FLAT',
      setup: 'RSI_WAIT',
      confidence: 40,
      reason: `RSI ${r.toFixed(0)} — wait for ${opts.rsiOversold}/${opts.rsiOverbought} turn.`,
    };
  }

  if (strategy === 'breakout') {
    const lb = Math.min(closes.length - 2, Math.max(5, opts.breakoutLookback));
    const window = candles.slice(-lb - 1, -1);
    const hi = Math.max(...window.map((c) => c.high));
    const lo = Math.min(...window.map((c) => c.low));
    if (spot > hi) {
      return {
        bias: 'CE',
        setup: 'BREAKOUT_HIGH',
        confidence: 68,
        reason: `Broke ${lb}-bar high ₹${hi.toFixed(2)}.`,
      };
    }
    if (spot < lo) {
      return {
        bias: 'PE',
        setup: 'BREAKOUT_LOW',
        confidence: 68,
        reason: `Broke ${lb}-bar low ₹${lo.toFixed(2)}.`,
      };
    }
    return {
      bias: 'FLAT',
      setup: 'RANGE_WAIT',
      confidence: 42,
      reason: `Inside range ₹${lo.toFixed(0)}–₹${hi.toFixed(0)}.`,
    };
  }

  if (strategy === 'orb') {
    const minutes = Math.max(5, Math.min(60, opts.orbMinutes ?? 15));
    const orBars = candles.filter((c) => {
      const m = minutesFromOpenIst(c.t);
      return m != null && m >= 0 && m < minutes;
    });
    // Fallback: first N bars of series if timestamps aren't session-aligned
    const rangeBars = orBars.length >= 2 ? orBars : candles.slice(0, Math.min(candles.length - 2, 3));
    if (rangeBars.length < 2) {
      return {
        bias: 'FLAT',
        setup: 'ORB_WAIT',
        confidence: 35,
        reason: 'Opening range not formed yet.',
      };
    }
    const orHigh = Math.max(...rangeBars.map((c) => c.high));
    const orLow = Math.min(...rangeBars.map((c) => c.low));
    const prev = closes[closes.length - 2] ?? spot;
    const brokeUp = prev <= orHigh && spot > orHigh;
    const brokeDn = prev >= orLow && spot < orLow;
    if (brokeUp || spot > orHigh * 1.0002) {
      return {
        bias: 'CE',
        setup: 'ORB_BREAK_HIGH',
        confidence: brokeUp ? 76 : 64,
        reason: `ORB ${minutes}m high ₹${orHigh.toFixed(0)} broken → CE.`,
      };
    }
    if (brokeDn || spot < orLow * 0.9998) {
      return {
        bias: 'PE',
        setup: 'ORB_BREAK_LOW',
        confidence: brokeDn ? 76 : 64,
        reason: `ORB ${minutes}m low ₹${orLow.toFixed(0)} broken → PE.`,
      };
    }
    return {
      bias: 'FLAT',
      setup: 'ORB_INSIDE',
      confidence: 44,
      reason: `Inside ORB ₹${orLow.toFixed(0)}–₹${orHigh.toFixed(0)} (${minutes}m).`,
    };
  }

  if (strategy === 'vwap_reclaim') {
    const vwap = sessionVwap(candles);
    const i = closes.length - 1;
    const v = vwap[i];
    const prevV = vwap[i - 1];
    const prevC = closes[i - 1];
    const reclaim = prevC <= prevV && spot > v;
    const reject = prevC >= prevV && spot < v;
    if (reclaim) {
      return {
        bias: 'CE',
        setup: 'VWAP_RECLAIM',
        confidence: 74,
        reason: `Reclaimed VWAP ₹${v.toFixed(0)} → CE.`,
      };
    }
    if (reject) {
      return {
        bias: 'PE',
        setup: 'VWAP_REJECT',
        confidence: 74,
        reason: `Rejected from VWAP ₹${v.toFixed(0)} → PE.`,
      };
    }
    const above = spot > v;
    return {
      bias: 'FLAT',
      setup: above ? 'VWAP_ABOVE_WAIT' : 'VWAP_BELOW_WAIT',
      confidence: 42,
      reason: `Price ${above ? 'above' : 'below'} VWAP ₹${v.toFixed(0)} — wait for cross.`,
    };
  }

  if (strategy === 'macd_cross') {
    const { macd, signal } = macdLine(closes);
    const i = closes.length - 1;
    if (i < 1) return null;
    const crossUp = macd[i - 1] <= signal[i - 1] && macd[i] > signal[i];
    const crossDn = macd[i - 1] >= signal[i - 1] && macd[i] < signal[i];
    if (crossUp) {
      return {
        bias: 'CE',
        setup: 'MACD_CROSS_UP',
        confidence: 71,
        reason: 'MACD crossed above signal → CE.',
      };
    }
    if (crossDn) {
      return {
        bias: 'PE',
        setup: 'MACD_CROSS_DOWN',
        confidence: 71,
        reason: 'MACD crossed below signal → PE.',
      };
    }
    const bull = macd[i] > signal[i];
    return {
      bias: 'FLAT',
      setup: bull ? 'MACD_BULL_WAIT' : 'MACD_BEAR_WAIT',
      confidence: 43,
      reason: `MACD ${macd[i].toFixed(1)} vs signal ${signal[i].toFixed(1)} — no fresh cross.`,
    };
  }

  return null; // price_action / swing handled by PA engine
}
