/**
 * Bar-level strategy signals for backtesting (and extended Nejoic ids).
 * Bias: CE = long, PE = short, FLAT = no entry.
 */
import type { Candle, OptionBias } from '@/lib/nejoic';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import { runNejoicStrategy } from '@/lib/nejoic-strategy';
import { runPriceAction } from '@/lib/price-action';

export type SignalBias = OptionBias;

export type BarSignal = {
  bias: SignalBias;
  setup: string;
  confidence: number;
  reason: string;
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

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : values[i]);
  }
  return out;
}

function rsiSeries(closes: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      out.push(50);
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    const ag = gains / period;
    const al = losses / period;
    if (al === 0) out.push(100);
    else {
      const rs = ag / al;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

function atr(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    if (i === 0) {
      out.push(tr);
      continue;
    }
    const prev = out[i - 1];
    out.push(i < period ? (prev * i + tr) / (i + 1) : (prev * (period - 1) + tr) / period);
  }
  return out;
}

function stoch(candles: Candle[], period = 14, smooth = 3): { k: number[]; d: number[] } {
  const rawK: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const from = Math.max(0, i - period + 1);
    const slice = candles.slice(from, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const range = hi - lo || 1;
    rawK.push(((candles[i].close - lo) / range) * 100);
  }
  const k = sma(rawK, smooth);
  const d = sma(k, smooth);
  return { k, d };
}

function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const width: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(closes[i]);
      lower.push(closes[i]);
      width.push(0);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
    width.push((2 * mult * sd) / (mean || 1));
  }
  return { mid, upper, lower, width };
}

function supertrendLines(candles: Candle[], period = 10, mult = 3) {
  const a = atr(candles, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const dir: number[] = []; // 1 bull, -1 bear
  for (let i = 0; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let basicUpper = hl2 + mult * a[i];
    let basicLower = hl2 - mult * a[i];
    if (i === 0) {
      upper.push(basicUpper);
      lower.push(basicLower);
      dir.push(1);
      continue;
    }
    basicUpper =
      basicUpper < upper[i - 1] || candles[i - 1].close > upper[i - 1]
        ? basicUpper
        : upper[i - 1];
    basicLower =
      basicLower > lower[i - 1] || candles[i - 1].close < lower[i - 1]
        ? basicLower
        : lower[i - 1];
    let d = dir[i - 1];
    if (d === 1 && candles[i].close < basicLower) d = -1;
    else if (d === -1 && candles[i].close > basicUpper) d = 1;
    upper.push(basicUpper);
    lower.push(basicLower);
    dir.push(d);
  }
  return { upper, lower, dir };
}

function macdHist(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = fast.map((f, i) => f - slow[i]);
  const signal = ema(macd, 9);
  const hist = macd.map((m, i) => m - signal[i]);
  return { macd, signal, hist };
}

function cci(candles: Candle[], period = 20): number[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: number[] = [];
  for (let i = 0; i < tp.length; i++) {
    if (i < period - 1) {
      out.push(0);
      continue;
    }
    const slice = tp.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const mad = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / period || 1;
    out.push((tp[i] - mean) / (0.015 * mad));
  }
  return out;
}

function williamsR(candles: Candle[], period = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const from = Math.max(0, i - period + 1);
    const slice = candles.slice(from, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const range = hi - lo || 1;
    out.push(((-100 * (hi - candles[i].close)) / range));
  }
  return out;
}

function flat(setup: string, reason: string, confidence = 40): BarSignal {
  return { bias: 'FLAT', setup, confidence, reason };
}

const DEFAULT_OPTS = {
  emaFast: 9,
  emaSlow: 21,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  breakoutLookback: 20,
  orbMinutes: 5,
};

/** Evaluate strategy on candle slice ending at last bar (closed). */
export function runCatalogSignal(
  strategyId: CatalogStrategyId | string,
  candles: Candle[],
  opts?: Partial<{
    emaFast: number;
    emaSlow: number;
    rsiPeriod: number;
    rsiOversold: number;
    rsiOverbought: number;
    breakoutLookback: number;
    orbMinutes: number;
  }>
): BarSignal | null {
  if (candles.length < 15) return null;
  const closes = candles.map((c) => c.close);
  const i = closes.length - 1;
  const spot = closes[i];
  const prev = closes[i - 1];
  const merged = { ...DEFAULT_OPTS, ...opts };

  // Delegate existing Nejoic cores
  if (
    strategyId === 'ema_cross' ||
    strategyId === 'rsi_bounce' ||
    strategyId === 'breakout' ||
    strategyId === 'orb' ||
    strategyId === 'vwap_reclaim' ||
    strategyId === 'macd_cross' ||
    strategyId === 'cci_zero' ||
    strategyId === 'hhll_lonesome'
  ) {
    return runNejoicStrategy(strategyId, candles, merged);
  }

  if (strategyId === 'price_action_hhll' || strategyId === 'swing_hl' || strategyId === 'hhll_lonesome') {
    const lb = strategyId === 'hhll_lonesome' ? 5 : 3;
    const rb = strategyId === 'hhll_lonesome' ? 5 : 3;
    const pa = runPriceAction(candles, { leftBars: lb, rightBars: rb });
    if (strategyId === 'price_action_hhll' || strategyId === 'hhll_lonesome') {
      if (pa.bias === 'CE') {
        return {
          bias: 'CE',
          setup: pa.setup || 'HH_HL',
          confidence: pa.confidence,
          reason: pa.entryHint || 'Bullish PA',
        };
      }
      return flat('PA_LONG_WAIT', pa.entryHint || 'Waiting for HH/HL');
    }
    if (pa.bias === 'PE') {
      return {
        bias: 'PE',
        setup: pa.setup || 'LH_LL',
        confidence: pa.confidence,
        reason: pa.entryHint || 'Bearish PA',
      };
    }
    return flat('PA_SHORT_WAIT', pa.entryHint || 'Waiting for LH/LL');
  }

  if (strategyId === 'ema_20_50') {
    return runNejoicStrategy('ema_cross', candles, { ...DEFAULT_OPTS, emaFast: 20, emaSlow: 50 });
  }

  if (strategyId === 'sma_50_200') {
    const f = sma(closes, 50);
    const s = sma(closes, 200);
    if (closes.length < 210) return flat('SMA_WARMUP', 'Need ~200 bars');
    const up = f[i - 1] <= s[i - 1] && f[i] > s[i];
    const dn = f[i - 1] >= s[i - 1] && f[i] < s[i];
    if (up) return { bias: 'CE', setup: 'GOLDEN_CROSS', confidence: 75, reason: 'SMA50 > SMA200' };
    if (dn) return { bias: 'PE', setup: 'DEATH_CROSS', confidence: 75, reason: 'SMA50 < SMA200' };
    return flat('SMA_WAIT', `SMA50 ${f[i].toFixed(0)} vs SMA200 ${s[i].toFixed(0)}`);
  }

  if (strategyId === 'ema_ribbon_pullback') {
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const bull = e9[i] > e21[i];
    const touched = candles[i].low <= e21[i] && spot > e21[i];
    const touchShort = candles[i].high >= e21[i] && spot < e21[i];
    if (bull && touched)
      return { bias: 'CE', setup: 'EMA_PULLBACK_LONG', confidence: 68, reason: 'Held EMA21 in uptrend' };
    if (!bull && touchShort)
      return { bias: 'PE', setup: 'EMA_PULLBACK_SHORT', confidence: 68, reason: 'Held EMA21 in downtrend' };
    return flat('RIBBON_WAIT', bull ? 'Uptrend — wait pullback' : 'Downtrend — wait pullback');
  }

  if (strategyId === 'inside_bar_break') {
    if (i < 2) return null;
    const mother = candles[i - 1];
    const inside = candles[i];
    // Check if previous bar was inside of bar before it, break on current
    const m0 = candles[i - 2];
    const wasInside = mother.high <= m0.high && mother.low >= m0.low;
    if (wasInside && spot > m0.high)
      return { bias: 'CE', setup: 'INSIDE_BREAK_UP', confidence: 70, reason: 'Broke mother high' };
    if (wasInside && spot < m0.low)
      return { bias: 'PE', setup: 'INSIDE_BREAK_DN', confidence: 70, reason: 'Broke mother low' };
    void inside;
    return flat('INSIDE_WAIT', 'No inside-bar break');
  }

  if (strategyId === 'engulfing_reversal') {
    const a = candles[i - 1];
    const b = candles[i];
    const bull = a.close < a.open && b.close > b.open && b.close >= a.open && b.open <= a.close;
    const bear = a.close > a.open && b.close < b.open && b.open >= a.close && b.close <= a.open;
    if (bull) return { bias: 'CE', setup: 'BULL_ENGULF', confidence: 72, reason: 'Bullish engulfing' };
    if (bear) return { bias: 'PE', setup: 'BEAR_ENGULF', confidence: 72, reason: 'Bearish engulfing' };
    return flat('ENGULF_WAIT', 'No engulfing');
  }

  if (strategyId === 'pin_bar') {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 1;
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick > body * 2 && lowerWick > range * 0.55 && body / range < 0.35)
      return { bias: 'CE', setup: 'PIN_BULL', confidence: 70, reason: 'Bullish pin bar' };
    if (upperWick > body * 2 && upperWick > range * 0.55 && body / range < 0.35)
      return { bias: 'PE', setup: 'PIN_BEAR', confidence: 70, reason: 'Bearish pin bar' };
    return flat('PIN_WAIT', 'No pin bar');
  }

  if (strategyId === 'stoch_cross') {
    const { k, d } = stoch(candles);
    const up = k[i - 1] <= d[i - 1] && k[i] > d[i] && k[i] < 30;
    const dn = k[i - 1] >= d[i - 1] && k[i] < d[i] && k[i] > 70;
    if (up) return { bias: 'CE', setup: 'STOCH_UP', confidence: 68, reason: 'Stoch cross up oversold' };
    if (dn) return { bias: 'PE', setup: 'STOCH_DN', confidence: 68, reason: 'Stoch cross down overbought' };
    return flat('STOCH_WAIT', `K ${k[i].toFixed(0)} D ${d[i].toFixed(0)}`);
  }

  if (strategyId === 'stoch_rsi') {
    const r = rsiSeries(closes, 14);
    const fakeCandles = r.map((v, idx) => ({
      t: candles[idx].t,
      open: v,
      high: v,
      low: v,
      close: v,
    }));
    const { k, d } = stoch(fakeCandles, 14, 3);
    const up = k[i - 1] <= d[i - 1] && k[i] > d[i] && k[i] < 20;
    const dn = k[i - 1] >= d[i - 1] && k[i] < d[i] && k[i] > 80;
    if (up) return { bias: 'CE', setup: 'STOCH_RSI_UP', confidence: 67, reason: 'StochRSI cross up' };
    if (dn) return { bias: 'PE', setup: 'STOCH_RSI_DN', confidence: 67, reason: 'StochRSI cross down' };
    return flat('STOCH_RSI_WAIT', 'No StochRSI extreme cross');
  }

  if (strategyId === 'macd_hist_flip') {
    const { hist } = macdHist(closes);
    if (hist[i - 1] <= 0 && hist[i] > 0)
      return { bias: 'CE', setup: 'MACD_HIST_UP', confidence: 69, reason: 'Histogram flipped +' };
    if (hist[i - 1] >= 0 && hist[i] < 0)
      return { bias: 'PE', setup: 'MACD_HIST_DN', confidence: 69, reason: 'Histogram flipped −' };
    return flat('MACD_HIST_WAIT', 'No hist flip');
  }

  if (strategyId === 'cci_zero') {
    const c = cci(candles);
    if (c[i - 1] <= 0 && c[i] > 0)
      return { bias: 'CE', setup: 'CCI_UP', confidence: 66, reason: 'CCI crossed above 0' };
    if (c[i - 1] >= 0 && c[i] < 0)
      return { bias: 'PE', setup: 'CCI_DN', confidence: 66, reason: 'CCI crossed below 0' };
    return flat('CCI_WAIT', `CCI ${c[i].toFixed(0)}`);
  }

  if (strategyId === 'williams_r') {
    const w = williamsR(candles);
    if (w[i - 1] <= -80 && w[i] > -80)
      return { bias: 'CE', setup: 'WR_UP', confidence: 66, reason: '%R left oversold' };
    if (w[i - 1] >= -20 && w[i] < -20)
      return { bias: 'PE', setup: 'WR_DN', confidence: 66, reason: '%R left overbought' };
    return flat('WR_WAIT', `%R ${w[i].toFixed(0)}`);
  }

  if (strategyId === 'bollinger_bounce') {
    const bb = bollinger(closes);
    if (prev <= bb.lower[i - 1] && spot > bb.lower[i])
      return { bias: 'CE', setup: 'BB_BOUNCE_LONG', confidence: 68, reason: 'Bounce off lower band' };
    if (prev >= bb.upper[i - 1] && spot < bb.upper[i])
      return { bias: 'PE', setup: 'BB_BOUNCE_SHORT', confidence: 68, reason: 'Reject upper band' };
    return flat('BB_WAIT', 'Inside bands');
  }

  if (strategyId === 'bollinger_squeeze') {
    const bb = bollinger(closes);
    const recent = bb.width.slice(-30);
    const minW = Math.min(...recent);
    const squeezed = bb.width[i] <= minW * 1.15 && bb.width[i] < 0.04;
    const hi = Math.max(...candles.slice(-20, -1).map((c) => c.high));
    const lo = Math.min(...candles.slice(-20, -1).map((c) => c.low));
    if (squeezed && spot > hi)
      return { bias: 'CE', setup: 'BB_SQUEEZE_UP', confidence: 72, reason: 'Squeeze break up' };
    if (squeezed && spot < lo)
      return { bias: 'PE', setup: 'BB_SQUEEZE_DN', confidence: 72, reason: 'Squeeze break down' };
    return flat('BB_SQUEEZE_WAIT', squeezed ? 'In squeeze — wait break' : 'No squeeze');
  }

  if (strategyId === 'donchian_break') {
    const lb = 20;
    if (i < lb + 1) return flat('DON_WARMUP', 'Need more bars');
    const window = candles.slice(i - lb, i);
    const hi = Math.max(...window.map((c) => c.high));
    const lo = Math.min(...window.map((c) => c.low));
    if (spot > hi) return { bias: 'CE', setup: 'DON_UP', confidence: 70, reason: `Broke ${lb}-bar high` };
    if (spot < lo) return { bias: 'PE', setup: 'DON_DN', confidence: 70, reason: `Broke ${lb}-bar low` };
    return flat('DON_WAIT', 'Inside Donchian');
  }

  if (strategyId === 'supertrend') {
    const st = supertrendLines(candles);
    if (st.dir[i - 1] === -1 && st.dir[i] === 1)
      return { bias: 'CE', setup: 'ST_BULL', confidence: 74, reason: 'Supertrend flipped bullish' };
    if (st.dir[i - 1] === 1 && st.dir[i] === -1)
      return { bias: 'PE', setup: 'ST_BEAR', confidence: 74, reason: 'Supertrend flipped bearish' };
    return flat('ST_WAIT', st.dir[i] === 1 ? 'Bullish ST — hold' : 'Bearish ST — hold');
  }

  if (strategyId === 'atr_breakout') {
    const a = atr(candles, 14);
    const thr = a[i - 1] * 1.5;
    if (spot > prev + thr)
      return { bias: 'CE', setup: 'ATR_UP', confidence: 68, reason: 'Close > prior + 1.5 ATR' };
    if (spot < prev - thr)
      return { bias: 'PE', setup: 'ATR_DN', confidence: 68, reason: 'Close < prior − 1.5 ATR' };
    return flat('ATR_WAIT', 'No ATR breakout');
  }

  if (strategyId === 'pdh_pdl_break') {
    // Approximate: use prior day's candles by calendar date
    const day = (iso: string) => iso.slice(0, 10);
    const today = day(candles[i].t);
    const prior = candles.filter((c) => day(c.t) < today);
    if (prior.length < 5) return flat('PDH_WAIT', 'Need prior day bars');
    const lastDay = day(prior[prior.length - 1].t);
    const pd = prior.filter((c) => day(c.t) === lastDay);
    const pdh = Math.max(...pd.map((c) => c.high));
    const pdl = Math.min(...pd.map((c) => c.low));
    if (prev <= pdh && spot > pdh)
      return { bias: 'CE', setup: 'PDH_BREAK', confidence: 71, reason: `Broke PDH ${pdh.toFixed(0)}` };
    if (prev >= pdl && spot < pdl)
      return { bias: 'PE', setup: 'PDL_BREAK', confidence: 71, reason: `Broke PDL ${pdl.toFixed(0)}` };
    return flat('PDH_PDL_WAIT', `PDH ${pdh.toFixed(0)} / PDL ${pdl.toFixed(0)}`);
  }

  if (strategyId === 'gap_fill') {
    const day = (iso: string) => iso.slice(0, 10);
    const today = day(candles[i].t);
    const todays = candles.filter((c) => day(c.t) === today);
    if (todays.length < 2) return flat('GAP_WAIT', 'Need session open');
    const openBar = todays[0];
    const prior = candles.filter((c) => day(c.t) < today);
    if (!prior.length) return flat('GAP_WAIT', 'No prior close');
    const priorClose = prior[prior.length - 1].close;
    const gapUp = openBar.open > priorClose * 1.002;
    const gapDn = openBar.open < priorClose * 0.998;
    if (gapUp && spot < openBar.open && spot > priorClose)
      return { bias: 'PE', setup: 'GAP_FILL_DOWN', confidence: 65, reason: 'Fading gap up toward prior close' };
    if (gapDn && spot > openBar.open && spot < priorClose)
      return { bias: 'CE', setup: 'GAP_FILL_UP', confidence: 65, reason: 'Fading gap down toward prior close' };
    return flat('GAP_IDLE', 'No active gap-fill');
  }

  if (strategyId === 'support_bounce') {
    const lb = 30;
    if (i < lb) return flat('SR_WARMUP', 'Need more bars');
    const window = candles.slice(i - lb, i);
    const support = Math.min(...window.map((c) => c.low));
    const resist = Math.max(...window.map((c) => c.high));
    const nearSup = candles[i].low <= support * 1.001 && spot > support;
    const nearRes = candles[i].high >= resist * 0.999 && spot < resist;
    if (nearSup) return { bias: 'CE', setup: 'SUPPORT_BOUNCE', confidence: 72, reason: 'Bounce from support' };
    if (nearRes) return { bias: 'PE', setup: 'RESIST_REJECT', confidence: 72, reason: 'Reject from resistance' };
    return flat('SR_WAIT', 'Away from levels');
  }

  if (strategyId === 'range_mean_reversion') {
    const lb = 40;
    if (i < lb) return flat('RANGE_WARMUP', 'Need more bars');
    const window = candles.slice(i - lb, i);
    const hi = Math.max(...window.map((c) => c.high));
    const lo = Math.min(...window.map((c) => c.low));
    const mid = (hi + lo) / 2;
    const width = hi - lo;
    if (width / mid < 0.005) return flat('RANGE_TIGHT', 'Range too tight');
    if (spot <= lo + width * 0.15)
      return { bias: 'CE', setup: 'RANGE_LOW', confidence: 64, reason: 'Near range low' };
    if (spot >= hi - width * 0.15)
      return { bias: 'PE', setup: 'RANGE_HIGH', confidence: 64, reason: 'Near range high' };
    return flat('RANGE_MID', 'Mid-range');
  }

  // --- Candlestick patterns ---
  {
    const c = candles[i];
    const p1 = candles[i - 1];
    const p2 = i >= 2 ? candles[i - 2] : null;
    const body = (x: Candle) => Math.abs(x.close - x.open);
    const range = (x: Candle) => x.high - x.low || 1;
    const lowerWick = (x: Candle) => Math.min(x.open, x.close) - x.low;
    const upperWick = (x: Candle) => x.high - Math.max(x.open, x.close);
    const isBull = (x: Candle) => x.close > x.open;
    const isBear = (x: Candle) => x.close < x.open;
    const smallBody = (x: Candle) => body(x) / range(x) < 0.25;
    const recentLow =
      i >= 10 && c.low <= Math.min(...candles.slice(i - 10, i).map((x) => x.low)) * 1.002;
    const recentHigh =
      i >= 10 && c.high >= Math.max(...candles.slice(i - 10, i).map((x) => x.high)) * 0.998;

    if (strategyId === 'hammer') {
      if (
        recentLow &&
        lowerWick(c) > body(c) * 2 &&
        lowerWick(c) > range(c) * 0.5 &&
        upperWick(c) < body(c) * 0.6
      ) {
        return { bias: 'CE', setup: 'HAMMER', confidence: 70, reason: 'Hammer at support' };
      }
      return flat('HAMMER_WAIT', 'No hammer');
    }

    if (strategyId === 'inverted_hammer') {
      if (
        recentLow &&
        upperWick(c) > body(c) * 2 &&
        upperWick(c) > range(c) * 0.5 &&
        lowerWick(c) < body(c) * 0.6
      ) {
        return {
          bias: 'CE',
          setup: 'INV_HAMMER',
          confidence: 68,
          reason: 'Inverted hammer at lows',
        };
      }
      return flat('INV_HAMMER_WAIT', 'No inverted hammer');
    }

    if (strategyId === 'shooting_star') {
      if (
        recentHigh &&
        upperWick(c) > body(c) * 2 &&
        upperWick(c) > range(c) * 0.5 &&
        lowerWick(c) < body(c) * 0.6
      ) {
        return {
          bias: 'PE',
          setup: 'SHOOTING_STAR',
          confidence: 70,
          reason: 'Shooting star at highs',
        };
      }
      return flat('STAR_WAIT', 'No shooting star');
    }

    if (strategyId === 'hanging_man') {
      if (
        recentHigh &&
        lowerWick(c) > body(c) * 2 &&
        lowerWick(c) > range(c) * 0.5 &&
        upperWick(c) < body(c) * 0.6
      ) {
        return {
          bias: 'PE',
          setup: 'HANGING_MAN',
          confidence: 68,
          reason: 'Hanging man after rally',
        };
      }
      return flat('HANG_WAIT', 'No hanging man');
    }

    if (strategyId === 'doji_reversal') {
      if (smallBody(c) && body(c) / range(c) < 0.12) {
        if (recentLow && spot > c.open)
          return { bias: 'CE', setup: 'DOJI_BULL', confidence: 66, reason: 'Doji bounce at low' };
        if (recentHigh && spot < c.open)
          return { bias: 'PE', setup: 'DOJI_BEAR', confidence: 66, reason: 'Doji reject at high' };
      }
      return flat('DOJI_WAIT', 'No doji reversal');
    }

    if (strategyId === 'morning_star' && p2) {
      const star = p1;
      if (
        isBear(p2) &&
        smallBody(star) &&
        isBull(c) &&
        c.close > (p2.open + p2.close) / 2 &&
        star.high < p2.open
      ) {
        return {
          bias: 'CE',
          setup: 'MORNING_STAR',
          confidence: 74,
          reason: 'Morning star reversal',
        };
      }
      return flat('MS_WAIT', 'No morning star');
    }

    if (strategyId === 'evening_star' && p2) {
      const star = p1;
      if (
        isBull(p2) &&
        smallBody(star) &&
        isBear(c) &&
        c.close < (p2.open + p2.close) / 2 &&
        star.low > p2.open
      ) {
        return {
          bias: 'PE',
          setup: 'EVENING_STAR',
          confidence: 74,
          reason: 'Evening star reversal',
        };
      }
      return flat('ES_WAIT', 'No evening star');
    }

    if (strategyId === 'three_white_soldiers' && p2) {
      if (
        isBull(p2) &&
        isBull(p1) &&
        isBull(c) &&
        c.close > p1.close &&
        p1.close > p2.close &&
        body(c) > range(c) * 0.45
      ) {
        return {
          bias: 'CE',
          setup: '3_WHITE',
          confidence: 72,
          reason: 'Three white soldiers',
        };
      }
      return flat('3W_WAIT', 'No three white soldiers');
    }

    if (strategyId === 'three_black_crows' && p2) {
      if (
        isBear(p2) &&
        isBear(p1) &&
        isBear(c) &&
        c.close < p1.close &&
        p1.close < p2.close &&
        body(c) > range(c) * 0.45
      ) {
        return {
          bias: 'PE',
          setup: '3_CROWS',
          confidence: 72,
          reason: 'Three black crows',
        };
      }
      return flat('3C_WAIT', 'No three black crows');
    }

    if (strategyId === 'harami_bull') {
      if (
        isBear(p1) &&
        isBull(c) &&
        c.high <= p1.high &&
        c.low >= p1.low &&
        body(c) < body(p1) * 0.7
      ) {
        return { bias: 'CE', setup: 'HARAMI_BULL', confidence: 68, reason: 'Bullish harami' };
      }
      return flat('HARAMI_B_WAIT', 'No bullish harami');
    }

    if (strategyId === 'harami_bear') {
      if (
        isBull(p1) &&
        isBear(c) &&
        c.high <= p1.high &&
        c.low >= p1.low &&
        body(c) < body(p1) * 0.7
      ) {
        return { bias: 'PE', setup: 'HARAMI_BEAR', confidence: 68, reason: 'Bearish harami' };
      }
      return flat('HARAMI_S_WAIT', 'No bearish harami');
    }

    if (strategyId === 'tweezer_top') {
      const matchHi = Math.abs(c.high - p1.high) / (p1.high || 1) < 0.0015;
      if (matchHi && isBull(p1) && isBear(c) && recentHigh) {
        return { bias: 'PE', setup: 'TWEEZER_TOP', confidence: 70, reason: 'Tweezer top' };
      }
      return flat('TW_TOP_WAIT', 'No tweezer top');
    }

    if (strategyId === 'tweezer_bottom') {
      const matchLo = Math.abs(c.low - p1.low) / (p1.low || 1) < 0.0015;
      if (matchLo && isBear(p1) && isBull(c) && recentLow) {
        return { bias: 'CE', setup: 'TWEEZER_BOT', confidence: 70, reason: 'Tweezer bottom' };
      }
      return flat('TW_BOT_WAIT', 'No tweezer bottom');
    }

    if (strategyId === 'marubozu_break') {
      const fullBody = body(c) / range(c) > 0.75;
      if (fullBody && isBull(c) && spot > p1.high) {
        return { bias: 'CE', setup: 'MARU_UP', confidence: 71, reason: 'Bullish marubozu break' };
      }
      if (fullBody && isBear(c) && spot < p1.low) {
        return { bias: 'PE', setup: 'MARU_DN', confidence: 71, reason: 'Bearish marubozu break' };
      }
      return flat('MARU_WAIT', 'No marubozu break');
    }
  }

  // --- Smart Money Concepts (practical approximations on OHLC) ---
  {
    const look = Math.min(40, i);
    const window = candles.slice(i - look, i + 1);
    const swingHi = Math.max(...window.slice(0, -1).map((x) => x.high));
    const swingLo = Math.min(...window.slice(0, -1).map((x) => x.low));
    const c = candles[i];
    const p1 = candles[i - 1];
    const p2 = i >= 2 ? candles[i - 2] : null;
    const impulseUp =
      p2 != null && c.close > p2.high && p1.close < p1.open && c.close > c.open;
    const impulseDn =
      p2 != null && c.close < p2.low && p1.close > p1.open && c.close < c.open;

    if (strategyId === 'smc_order_block_bull') {
      if (impulseUp && p1.close < p1.open) {
        const inOb = spot >= p1.low && spot <= p1.high;
        if (inOb || (candles[i].low <= p1.high && spot > p1.close)) {
          return {
            bias: 'CE',
            setup: 'OB_BULL',
            confidence: 72,
            reason: 'Bullish order block retest',
          };
        }
      }
      return flat('OB_BULL_WAIT', 'No bullish OB');
    }

    if (strategyId === 'smc_order_block_bear') {
      if (impulseDn && p1.close > p1.open) {
        const inOb = spot >= p1.low && spot <= p1.high;
        if (inOb || (candles[i].high >= p1.low && spot < p1.close)) {
          return {
            bias: 'PE',
            setup: 'OB_BEAR',
            confidence: 72,
            reason: 'Bearish order block retest',
          };
        }
      }
      return flat('OB_BEAR_WAIT', 'No bearish OB');
    }

    if (strategyId === 'smc_fvg_bull' && p2) {
      const gap = c.low - p2.high;
      if (gap > 0 && spot >= p2.high && spot <= c.low) {
        return { bias: 'CE', setup: 'FVG_BULL', confidence: 70, reason: 'Bullish FVG fill zone' };
      }
      if (gap > 0 && candles[i].low <= c.low && spot > p2.high) {
        return { bias: 'CE', setup: 'FVG_BULL', confidence: 68, reason: 'Entering bullish FVG' };
      }
      return flat('FVG_B_WAIT', 'No bullish FVG');
    }

    if (strategyId === 'smc_fvg_bear' && p2) {
      const gap = p2.low - c.high;
      if (gap > 0 && spot <= p2.low && spot >= c.high) {
        return { bias: 'PE', setup: 'FVG_BEAR', confidence: 70, reason: 'Bearish FVG fill zone' };
      }
      if (gap > 0 && candles[i].high >= c.high && spot < p2.low) {
        return { bias: 'PE', setup: 'FVG_BEAR', confidence: 68, reason: 'Entering bearish FVG' };
      }
      return flat('FVG_S_WAIT', 'No bearish FVG');
    }

    if (strategyId === 'smc_liquidity_sweep_high') {
      if (candles[i].high > swingHi && spot < swingHi && c.close < c.open) {
        return {
          bias: 'PE',
          setup: 'LIQ_SWEEP_HI',
          confidence: 73,
          reason: 'Sweep above highs then reject',
        };
      }
      return flat('LIQ_HI_WAIT', 'No high sweep');
    }

    if (strategyId === 'smc_liquidity_sweep_low') {
      if (candles[i].low < swingLo && spot > swingLo && c.close > c.open) {
        return {
          bias: 'CE',
          setup: 'LIQ_SWEEP_LO',
          confidence: 73,
          reason: 'Sweep below lows then reclaim',
        };
      }
      return flat('LIQ_LO_WAIT', 'No low sweep');
    }

    if (strategyId === 'smc_bos_bull') {
      if (spot > swingHi && prev <= swingHi) {
        return { bias: 'CE', setup: 'BOS_BULL', confidence: 74, reason: 'Break of structure up' };
      }
      return flat('BOS_B_WAIT', 'No bullish BOS');
    }

    if (strategyId === 'smc_bos_bear') {
      if (spot < swingLo && prev >= swingLo) {
        return { bias: 'PE', setup: 'BOS_BEAR', confidence: 74, reason: 'Break of structure down' };
      }
      return flat('BOS_S_WAIT', 'No bearish BOS');
    }

    if (strategyId === 'smc_choch_bull') {
      if (i < 5) return flat('CHOCH_B_WAIT', 'Need more bars');
      const priorDn = closes[i - 5] > closes[i - 1] && closes[i - 1] < closes[i - 3];
      if (priorDn && spot > swingHi * 0.999) {
        return { bias: 'CE', setup: 'CHOCH_BULL', confidence: 71, reason: 'Bullish CHoCH' };
      }
      return flat('CHOCH_B_WAIT', 'No bullish CHoCH');
    }

    if (strategyId === 'smc_choch_bear') {
      if (i < 5) return flat('CHOCH_S_WAIT', 'Need more bars');
      const priorUp = closes[i - 5] < closes[i - 1] && closes[i - 1] > closes[i - 3];
      if (priorUp && spot < swingLo * 1.001) {
        return { bias: 'PE', setup: 'CHOCH_BEAR', confidence: 71, reason: 'Bearish CHoCH' };
      }
      return flat('CHOCH_S_WAIT', 'No bearish CHoCH');
    }

    if (strategyId === 'smc_breaker_block') {
      if (p2 && p1.close > p1.open && spot < p1.low && spot < p2.low) {
        return { bias: 'PE', setup: 'BREAKER_BEAR', confidence: 69, reason: 'Breaker block short' };
      }
      if (p2 && p1.close < p1.open && spot > p1.high && spot > p2.high) {
        return { bias: 'CE', setup: 'BREAKER_BULL', confidence: 69, reason: 'Breaker block long' };
      }
      return flat('BREAKER_WAIT', 'No breaker');
    }

    if (strategyId === 'smc_mitigation_block') {
      const mid = (swingHi + swingLo) / 2;
      if (spot < mid && candles[i].low <= swingLo * 1.002 && c.close > c.open) {
        return {
          bias: 'CE',
          setup: 'MITIGATION_LONG',
          confidence: 67,
          reason: 'Mitigation of lows',
        };
      }
      if (spot > mid && candles[i].high >= swingHi * 0.998 && c.close < c.open) {
        return {
          bias: 'PE',
          setup: 'MITIGATION_SHORT',
          confidence: 67,
          reason: 'Mitigation of highs',
        };
      }
      return flat('MIT_WAIT', 'No mitigation');
    }

    if (strategyId === 'smc_premium_discount') {
      const mid = (swingHi + swingLo) / 2;
      const width = swingHi - swingLo || 1;
      if (spot <= mid - width * 0.15 && c.close > c.open) {
        return { bias: 'CE', setup: 'DISCOUNT_BUY', confidence: 66, reason: 'Buy in discount' };
      }
      if (spot >= mid + width * 0.15 && c.close < c.open) {
        return { bias: 'PE', setup: 'PREMIUM_SELL', confidence: 66, reason: 'Sell in premium' };
      }
      return flat('PD_WAIT', 'Equilibrium zone');
    }

    if (strategyId === 'smc_inducement') {
      if (candles[i].high > swingHi && spot < p1.close && c.close < c.open) {
        return {
          bias: 'PE',
          setup: 'INDUCE_TRAP_HI',
          confidence: 70,
          reason: 'Inducement above highs',
        };
      }
      if (candles[i].low < swingLo && spot > p1.close && c.close > c.open) {
        return {
          bias: 'CE',
          setup: 'INDUCE_TRAP_LO',
          confidence: 70,
          reason: 'Inducement below lows',
        };
      }
      return flat('INDUCE_WAIT', 'No inducement trap');
    }
  }

  return flat('UNKNOWN', `No signal engine for ${strategyId}`);
}

export function lastAtr(candles: Candle[], period = 14): number {
  const a = atr(candles, period);
  return a[a.length - 1] || 0;
}
