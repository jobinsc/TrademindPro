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

  return null; // price_action / swing handled by PA engine
}
