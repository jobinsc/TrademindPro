/**
 * UT Bot Alerts — port of your TradingView Pine v4 script (Heikin Ashi off by default).
 */

import type { Candle } from '@/lib/nejoic';

export type UtBotParams = {
  keyValue: number;
  atrPeriod: number;
  useHeikinAshi?: boolean;
};

function atrSeries(candles: Candle[], period: number): number[] {
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

function crossover(aPrev: number, aNow: number, bPrev: number, bNow: number): boolean {
  return aPrev <= bPrev && aNow > bNow;
}

/** Pine: ema(src, 1) ≈ src for bar signals. */
function ema1(src: number): number {
  return src;
}

export type UtBotBar = {
  t: string;
  src: number;
  trailingStop: number;
  pos: -1 | 0 | 1;
  buy: boolean;
  sell: boolean;
  barbuy: boolean;
  barsell: boolean;
};

/**
 * Run UT Bot bar-by-bar on ascending candles (same semantics as Pine study).
 */
export function runUtBot(candles: Candle[], params: UtBotParams): UtBotBar[] {
  if (!candles.length) return [];

  const sorted = [...candles].sort((a, b) => a.t.localeCompare(b.t));
  const atrs = atrSeries(sorted, params.atrPeriod);
  const out: UtBotBar[] = [];

  let pos: -1 | 0 | 1 = 0;

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const src = c.close; // HA not wired yet — matches h=false in Pine
    const nLoss = params.keyValue * (atrs[i] ?? 0);
    const srcPrev = i > 0 ? sorted[i - 1].close : src;
    const stopPrev = i > 0 ? out[i - 1].trailingStop : 0;

    let trailingStop: number;
    if (src > stopPrev && srcPrev > stopPrev) {
      trailingStop = Math.max(stopPrev, src - nLoss);
    } else if (src < stopPrev && srcPrev < stopPrev) {
      trailingStop = Math.min(stopPrev, src + nLoss);
    } else if (src > stopPrev) {
      trailingStop = src - nLoss;
    } else {
      trailingStop = src + nLoss;
    }

    if (srcPrev < stopPrev && src > stopPrev) pos = 1;
    else if (srcPrev > stopPrev && src < stopPrev) pos = -1;
    else if (i === 0) pos = 0;

    const emaNow = ema1(src);
    const emaPrev = ema1(srcPrev);
    const buy =
      src > trailingStop && crossover(emaPrev, emaNow, stopPrev, trailingStop);
    const sell =
      src < trailingStop && crossover(stopPrev, trailingStop, emaPrev, emaNow);
    const barbuy = src > trailingStop;
    const barsell = src < trailingStop;

    out.push({
      t: c.t,
      src,
      trailingStop,
      pos,
      buy,
      sell,
      barbuy,
      barsell,
    });
  }

  return out;
}

export function utSnapshot(
  candles: Candle[],
  params: UtBotParams,
  tf: '3m' | '5m'
): import('@/lib/nexus-pulse/types').NexusUtSnapshot {
  const bars = runUtBot(candles, params);
  const last = bars.length ? bars[bars.length - 1] : null;
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  return {
    tf,
    keyValue: params.keyValue,
    atrPeriod: params.atrPeriod,
    bars: bars.length,
    last: last
      ? {
          t: last.t,
          buy: last.buy,
          sell: last.sell,
          pos: last.pos,
          trailingStop: last.trailingStop,
          src: last.src,
        }
      : null,
    prev: prev
      ? {
          t: prev.t,
          buy: prev.buy,
          sell: prev.sell,
          pos: prev.pos,
          trailingStop: prev.trailingStop,
          src: prev.src,
        }
      : null,
  };
}
