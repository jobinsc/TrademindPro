/**
 * Combo: Sector 7 G (15m UT + 30m HTF) entry ONLY when MACD BB agrees,
 * managed with ATR risk + fixed R:R (pro style).
 *
 * Run: npx tsx scripts/gold-s7g-macdbb-combo-backtest.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { runUtBot } from '../src/lib/nexus-pulse/ut-bot';
import { fetchYahooCandles } from '../src/lib/yahoo-nifty';
import {
  GOLD_PULSE_RULES,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_LABEL,
  GOLD_YAHOO_SYMBOL,
} from '../src/lib/gold-pulse/rules';
import type { GoldSide } from '../src/lib/gold-pulse/types';

type Side = GoldSide;

type Params = {
  bbLen: number;
  bbDev: number;
  fastLen: number;
  slowLen: number;
  atrLen: number;
  slAtr: number;
  rr: number;
  costUsd: number;
  maxTradesPerDay: number;
  cooldownMs: number;
  /** Require MACD first-break same direction (else just MACD outside BB). */
  requireMacdFirstBreak: boolean;
  /** Also allow entry if MACD already outside in direction (not only first). */
  macdOutsideOk: boolean;
  beAtR: number | null;
  trailAtR: number | null;
  trailKeepFrac: number;
  /** Exit on Sector 7 G (30m flip against). */
  exitOnHtfFlip: boolean;
  /** Exit when MACD returns inside. */
  exitOnMacdInside: boolean;
  sessionUtc: [number, number] | null;
};

type Trade = {
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  reason: string;
  riskUsd: number;
  rMultiple: number;
  gross: number;
  net: number;
};

function ema(vals: number[], len: number): number[] {
  const out = new Array(vals.length).fill(NaN);
  if (vals.length < len) return out;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += vals[i];
  let prev = sum / len;
  out[len - 1] = prev;
  const k = 2 / (len + 1);
  for (let i = len; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(vals: number[], len: number): number[] {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= len) sum -= vals[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function stdev(vals: number[], len: number): number[] {
  const out = new Array(vals.length).fill(NaN);
  for (let i = len - 1; i < vals.length; i++) {
    let sum = 0;
    for (let j = i - len + 1; j <= i; j++) sum += vals[j];
    const mean = sum / len;
    let v = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const d = vals[j] - mean;
      v += d * d;
    }
    out[i] = Math.sqrt(v / len);
  }
  return out;
}

function atrSeries(candles: Candle[], len: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr.push(candles[i].high - candles[i].low);
    else {
      const prev = candles[i - 1].close;
      tr.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prev),
          Math.abs(candles[i].low - prev)
        )
      );
    }
  }
  return sma(tr, len);
}

function htfIndexAt(times: number[], tMs: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= tMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}
function utcHour(iso: string) {
  return new Date(iso).getUTCHours();
}
function inSession(iso: string, session: [number, number] | null) {
  if (!session) return true;
  const h = utcHour(iso);
  const [a, b] = session;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}
function signed(side: Side, entry: number, px: number) {
  return side === 'LONG' ? px - entry : entry - px;
}

function runCombo(opts: {
  entry: Candle[];
  htf: Candle[];
  params: Params;
  label: string;
}) {
  const p = opts.params;
  const c = [...opts.entry].sort((a, b) => a.t.localeCompare(b.t));
  const h = [...opts.htf].sort((a, b) => a.t.localeCompare(b.t));

  const utE = runUtBot(c, {
    keyValue: GOLD_UT_ENTRY.keyValue,
    atrPeriod: GOLD_UT_ENTRY.atrPeriod,
  });
  const utH = runUtBot(h, {
    keyValue: GOLD_UT_HTF.keyValue,
    atrPeriod: GOLD_UT_HTF.atrPeriod,
  });
  const htfTimes = h.map((x) => new Date(x.t).getTime());

  const closes = c.map((x) => x.close);
  const fast = ema(closes, p.fastLen);
  const slow = ema(closes, p.slowLen);
  const macd = closes.map((_, i) =>
    Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : NaN
  );
  const macdFilled = macd.map((v) => (Number.isFinite(v) ? v : 0));
  const bbBasis = sma(macdFilled, p.bbLen);
  const bbStd = stdev(macdFilled, p.bbLen);
  const upper = bbBasis.map((b, i) =>
    Number.isFinite(b) && Number.isFinite(bbStd[i]) ? b + p.bbDev * bbStd[i] : NaN
  );
  const lower = bbBasis.map((b, i) =>
    Number.isFinite(b) && Number.isFinite(bbStd[i]) ? b - p.bbDev * bbStd[i] : NaN
  );
  const atrArr = atrSeries(c, p.atrLen);

  const warm =
    Math.max(GOLD_UT_ENTRY.atrPeriod, GOLD_UT_HTF.atrPeriod, p.slowLen, p.bbLen, p.atrLen) + 5;

  const tradingDays = new Set<string>();
  for (const bar of c) {
    if (inSession(bar.t, p.sessionUtc)) tradingDays.add(dayKey(bar.t));
  }
  if (!p.sessionUtc) {
    for (const bar of c) tradingDays.add(dayKey(bar.t));
  }

  type Open = {
    side: Side;
    openedAt: string;
    entry: number;
    risk: number;
    stop: number;
    tp: number;
    mfeR: number;
    beArmed: boolean;
  };

  let open: Open | null = null;
  const trades: Trade[] = [];
  const dayCounts = new Map<string, number>();
  let lastExitMs = 0;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const exitMix: Record<string, number> = {};

  const closeTrade = (o: Open, exit: number, closedAt: string, reason: string) => {
    const move = signed(o.side, o.entry, exit);
    const gross = Math.round(move * 100) / 100;
    const net = Math.round((gross - p.costUsd) * 100) / 100;
    const rMultiple = o.risk > 0 ? Math.round((move / o.risk) * 100) / 100 : 0;
    trades.push({
      side: o.side,
      openedAt: o.openedAt,
      closedAt,
      entry: o.entry,
      exit,
      reason,
      riskUsd: Math.round(o.risk * 100) / 100,
      rMultiple,
      gross,
      net,
    });
    exitMix[reason] = (exitMix[reason] || 0) + 1;
    dayCounts.set(dayKey(o.openedAt), (dayCounts.get(dayKey(o.openedAt)) || 0) + 1);
    equity += net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    lastExitMs = new Date(closedAt).getTime();
    open = null;
  };

  for (let i = warm; i < c.length; i++) {
    const bar = c[i];
    const u = utE[i];
    const prev = utE[i - 1];
    if (!u || !prev) continue;

    const m = macd[i];
    const mPrev = macd[i - 1];
    const up = upper[i];
    const loB = lower[i];
    const upPrev = upper[i - 1];
    const loPrev = lower[i - 1];
    if (![m, mPrev, up, loB, upPrev, loPrev, atrArr[i]].every(Number.isFinite)) continue;
    if (atrArr[i] <= 0) continue;

    const above = m > up;
    const below = m < loB;
    const firstLongMacd = above && !(mPrev > upPrev);
    const firstShortMacd = below && !(mPrev < loPrev);
    const macdInside = !above && !below;

    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfPos = (hi >= 0 ? utH[hi]?.pos : 0) as -1 | 0 | 1;
    const day = dayKey(bar.t);

    if (open) {
      const favPx = open.side === 'LONG' ? bar.high : bar.low;
      open.mfeR = Math.max(open.mfeR, signed(open.side, open.entry, favPx) / open.risk);

      if (p.beAtR != null && !open.beArmed && open.mfeR >= p.beAtR) {
        open.beArmed = true;
        open.stop = open.entry;
      }
      if (p.trailAtR != null && open.mfeR >= p.trailAtR) {
        const lock = open.mfeR * p.trailKeepFrac * open.risk;
        if (open.side === 'LONG') open.stop = Math.max(open.stop, open.entry + lock);
        else open.stop = Math.min(open.stop, open.entry - lock);
      }

      if (open.side === 'LONG' && bar.low <= open.stop) {
        closeTrade(open, open.stop, bar.t, open.beArmed && open.stop >= open.entry ? 'BE_SL' : 'SL');
      } else if (open.side === 'SHORT' && bar.high >= open.stop) {
        closeTrade(open, open.stop, bar.t, open.beArmed && open.stop <= open.entry ? 'BE_SL' : 'SL');
      } else if (open.side === 'LONG' && bar.high >= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (open.side === 'SHORT' && bar.low <= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (p.exitOnHtfFlip && open.side === 'LONG' && htfPos === -1) {
        closeTrade(open, bar.close, bar.t, 'S7G');
      } else if (p.exitOnHtfFlip && open.side === 'SHORT' && htfPos === 1) {
        closeTrade(open, bar.close, bar.t, 'S7G');
      } else if (p.exitOnMacdInside && macdInside) {
        closeTrade(open, bar.close, bar.t, 'MACD_IN');
      }
    }

    if (open) continue;
    if (!inSession(bar.t, p.sessionUtc)) continue;
    if ((dayCounts.get(day) || 0) >= p.maxTradesPerDay) continue;
    if (lastExitMs && tMs - lastExitMs < p.cooldownMs) continue;

    // Sector 7 G style entry: 15m UT new edge + 30m agree
    const buyEdge = u.buy && !prev.buy;
    const sellEdge = u.sell && !prev.sell;
    let side: Side | null = null;
    if (buyEdge && htfPos === 1) side = 'LONG';
    if (sellEdge && htfPos === -1) side = 'SHORT';
    if (!side) continue;

    // MACD BB confirmation
    let macdOk = false;
    if (side === 'LONG') {
      if (p.requireMacdFirstBreak && firstLongMacd) macdOk = true;
      else if (p.macdOutsideOk && above) macdOk = true;
      else if (!p.requireMacdFirstBreak && !p.macdOutsideOk && above) macdOk = true;
    } else {
      if (p.requireMacdFirstBreak && firstShortMacd) macdOk = true;
      else if (p.macdOutsideOk && below) macdOk = true;
      else if (!p.requireMacdFirstBreak && !p.macdOutsideOk && below) macdOk = true;
    }
    if (!macdOk) continue;

    const risk = atrArr[i] * p.slAtr;
    if (risk < 1) continue;
    const entry = bar.close;
    const reward = risk * p.rr;

    open = {
      side,
      openedAt: bar.t,
      entry,
      risk,
      stop: side === 'LONG' ? entry - risk : entry + risk,
      tp: side === 'LONG' ? entry + reward : entry - reward,
      mfeR: 0,
      beArmed: false,
    };
  }

  if (open && c.length) {
    closeTrade(open, c[c.length - 1].close, c[c.length - 1].t, 'EOD');
  }

  const days = [...tradingDays].sort();
  const daysWith = days.filter((d) => (dayCounts.get(d) || 0) > 0);
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const net = nets.reduce((a, b) => a + b, 0);
  const avgR =
    trades.length > 0
      ? Math.round((trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length) * 100) / 100
      : 0;
  const avgRisk =
    trades.length > 0
      ? Math.round((trades.reduce((s, t) => s + t.riskUsd, 0) / trades.length) * 100) / 100
      : 0;
  const gw = trades.filter((t) => t.gross > 0).reduce((s, t) => s + t.gross, 0);
  const gl = Math.abs(trades.filter((t) => t.gross < 0).reduce((s, t) => s + t.gross, 0));
  const profitFactor = gl > 0 ? Math.round((gw / gl) * 100) / 100 : gw > 0 ? 99 : 0;

  return {
    label: opts.label,
    trades: trades.length,
    tradingDays: days.length,
    daysWithTrade: daysWith.length,
    dayCoveragePct: days.length ? Math.round((1000 * daysWith.length) / days.length) / 10 : 0,
    winRate: trades.length ? Math.round((1000 * wins.length) / trades.length) / 10 : 0,
    gross: Math.round(trades.reduce((s, t) => s + t.gross, 0) * 100) / 100,
    net: Math.round(net * 100) / 100,
    avgNet: trades.length ? Math.round((net / trades.length) * 100) / 100 : 0,
    avgWin: wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length
      ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100
      : 0,
    avgRiskUsd: avgRisk,
    expectancyR: avgR,
    profitFactor,
    maxDd: Math.round(maxDd * 100) / 100,
    exitMix,
    rr: p.rr,
    slAtr: p.slAtr,
    lastTrades: trades.slice(-5),
  };
}

/** Baseline: current GoldPulse v6 Sector 7 G (no MACD, no ATR RR) for comparison */
async function runBaselineS7G(entry: Candle[], htf: Candle[]) {
  const { runGoldPulseBacktest } = await import('../src/lib/gold-pulse/backtest');
  const r = runGoldPulseBacktest({ candlesEntry: entry, candlesHtf: htf });
  return {
    label: 'Baseline S7G v6 (current desk, $5 cost)',
    trades: r.tradeCount,
    winRate: r.winRate,
    gross: r.grossPnl,
    net: r.netPnl,
    maxDd: r.maxDrawdown,
    dayCoveragePct: r.dayCoveragePct,
    exitMix: r.exitMix,
  };
}

async function main() {
  const [r15, r30] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '15m', 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '30m', 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!r15.ok || !r15.candles.length) throw new Error(r15.error || '15m failed');
  if (!r30.ok || !r30.candles.length) throw new Error(r30.error || '30m failed');

  const base = {
    bbLen: 10,
    bbDev: 1,
    fastLen: 12,
    slowLen: 26,
    atrLen: 14,
    costUsd: 2,
    cooldownMs: GOLD_PULSE_RULES.reentryCooldownMs,
    beAtR: null as number | null,
    trailAtR: null as number | null,
    trailKeepFrac: 0.5,
    sessionUtc: null as [number, number] | null,
  };

  const specs: { label: string; params: Params }[] = [
    // MACD outside confirm + ATR RR
    {
      label: 'S7G+MACD outside · SL1ATR RR1:2 · $2 · exit S7G|TP|SL',
      params: {
        ...base,
        slAtr: 1,
        rr: 2,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:3 · $2 · exit S7G|TP|SL',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD first-break · SL1ATR RR1:2 · $2',
      params: {
        ...base,
        slAtr: 1,
        rr: 2,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: true,
        macdOutsideOk: false,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD first-break · SL1ATR RR1:3 · $2',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: true,
        macdOutsideOk: false,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:2 · max1/day',
      params: {
        ...base,
        slAtr: 1,
        rr: 2,
        maxTradesPerDay: 1,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:3 · max1/day',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 1,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:2 · BE@1R trail',
      params: {
        ...base,
        slAtr: 1,
        rr: 2,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
        beAtR: 1,
        trailAtR: 1.5,
        trailKeepFrac: 0.5,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:3 · BE@1R trail',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
        beAtR: 1,
        trailAtR: 1.5,
        trailKeepFrac: 0.5,
      },
    },
    {
      label: 'S7G+MACD outside · SL1.5ATR RR1:2.5 · $2',
      params: {
        ...base,
        slAtr: 1.5,
        rr: 2.5,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · SL1ATR RR1:3 · NY only',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
        sessionUtc: [13, 18],
      },
    },
    {
      label: 'S7G+MACD outside · TP/SL only (no S7G exit) RR1:2',
      params: {
        ...base,
        slAtr: 1,
        rr: 2,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: false,
        exitOnMacdInside: false,
      },
    },
    {
      label: 'S7G+MACD outside · TP/SL only (no S7G exit) RR1:3',
      params: {
        ...base,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: false,
        exitOnMacdInside: false,
      },
    },
    // Also cost $5 to compare fairly with baseline desk
    {
      label: 'S7G+MACD outside · SL1ATR RR1:3 · cost$5',
      params: {
        ...base,
        costUsd: 5,
        slAtr: 1,
        rr: 3,
        maxTradesPerDay: 3,
        requireMacdFirstBreak: false,
        macdOutsideOk: true,
        exitOnHtfFlip: true,
        exitOnMacdInside: false,
      },
    },
  ];

  const baseline = await runBaselineS7G(r15.candles, r30.candles);
  const rows = specs.map((s) =>
    runCombo({ entry: r15.candles, htf: r30.candles, params: s.params, label: s.label })
  );
  const ranked = [...rows].sort((a, b) => b.net - a.net);

  console.log(
    JSON.stringify(
      {
        setup: 'Sector 7 G entry + MACD BB confirm + ATR R:R',
        entryTf: '15m',
        htfTf: '30m',
        from: r15.candles[0]?.t,
        to: r15.candles[r15.candles.length - 1]?.t,
        baseline,
        best: ranked.slice(0, 5).map(({ lastTrades, ...r }) => r),
        all: ranked.map(({ lastTrades, ...r }) => r),
        bestDetail: ranked[0],
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
