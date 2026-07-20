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
  orbMinutes: 15,
};

/** Evaluate strategy on candle slice ending at last bar (closed). */
export function runCatalogSignal(
  strategyId: CatalogStrategyId | string,
  candles: Candle[]
): BarSignal | null {
  if (candles.length < 15) return null;
  const closes = candles.map((c) => c.close);
  const i = closes.length - 1;
  const spot = closes[i];
  const prev = closes[i - 1];

  // Delegate existing Nejoic cores
  if (
    strategyId === 'ema_cross' ||
    strategyId === 'rsi_bounce' ||
    strategyId === 'breakout' ||
    strategyId === 'orb' ||
    strategyId === 'vwap_reclaim' ||
    strategyId === 'macd_cross'
  ) {
    return runNejoicStrategy(strategyId, candles, DEFAULT_OPTS);
  }

  if (strategyId === 'price_action_hhll' || strategyId === 'swing_hl') {
    const pa = runPriceAction(candles, { leftBars: 3, rightBars: 3 });
    if (strategyId === 'price_action_hhll') {
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
    if (nearSup) return { bias: 'CE', setup: 'SUPPORT_BOUNCE', confidence: 66, reason: 'Bounce from support' };
    if (nearRes) return { bias: 'PE', setup: 'RESIST_REJECT', confidence: 66, reason: 'Reject from resistance' };
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

  return flat('UNKNOWN', `No signal engine for ${strategyId}`);
}

export function lastAtr(candles: Candle[], period = 14): number {
  const a = atr(candles, period);
  return a[a.length - 1] || 0;
}
