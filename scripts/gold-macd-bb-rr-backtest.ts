/**
 * Pro-style MACD BB gold backtest — ATR risk & fixed R:R (no $5 target).
 * Run: npx tsx scripts/gold-macd-bb-rr-backtest.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { fetchYahooCandles } from '../src/lib/yahoo-nifty';
import { GOLD_YAHOO_LABEL, GOLD_YAHOO_SYMBOL } from '../src/lib/gold-pulse/rules';

type Side = 'LONG' | 'SHORT';

type Params = {
  bbLen: number;
  bbDev: number;
  fastLen: number;
  slowLen: number;
  htfEmaLen: number;
  useHtf: boolean;
  sessionUtc: [number, number] | null;
  atrLen: number;
  /** Min bar range vs ATR to skip chop. */
  minAtrMult: number;
  /** Stop distance in ATRs. */
  slAtr: number;
  /** Reward multiple of risk (TP = slAtr * rr * ATR). */
  rr: number;
  costUsd: number;
  maxTradesPerDay: number;
  cooldownMs: number;
  /** Move SL to breakeven after +1R (before cost). */
  beAtR: number | null;
  /** Trail: lock keepFrac of MFE after trailAtR. */
  trailAtR: number | null;
  trailKeepFrac: number;
  /** Also exit if MACD returns inside (partial time stop). */
  exitOnInside: boolean;
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

function run(opts: { entry: Candle[]; htf: Candle[]; params: Params; label: string }) {
  const p = opts.params;
  const c = [...opts.entry].sort((a, b) => a.t.localeCompare(b.t));
  const h = [...opts.htf].sort((a, b) => a.t.localeCompare(b.t));
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

  const htfCloses = h.map((x) => x.close);
  const htfEma = ema(htfCloses, p.htfEmaLen);
  const htfTimes = h.map((x) => new Date(x.t).getTime());

  const warm = Math.max(p.slowLen, p.bbLen, p.atrLen) + 5;
  const tradingDays = new Set<string>();
  for (const bar of c) {
    if (inSession(bar.t, p.sessionUtc)) tradingDays.add(dayKey(bar.t));
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
    const m = macd[i];
    const mPrev = macd[i - 1];
    const up = upper[i];
    const lo = lower[i];
    const upPrev = upper[i - 1];
    const loPrev = lower[i - 1];
    if (![m, mPrev, up, lo, upPrev, loPrev, atrArr[i]].every(Number.isFinite)) continue;
    if (atrArr[i] <= 0) continue;

    const above = m > up;
    const below = m < lo;
    const firstLong = above && !(mPrev > upPrev);
    const firstShort = below && !(mPrev < loPrev);
    const inside = !above && !below;

    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfBull = hi >= 0 && Number.isFinite(htfEma[hi]) && h[hi].close >= htfEma[hi];
    const htfBear = hi >= 0 && Number.isFinite(htfEma[hi]) && h[hi].close <= htfEma[hi];
    const day = dayKey(bar.t);
    const rangeOk =
      p.minAtrMult <= 0 || bar.high - bar.low >= atrArr[i] * p.minAtrMult;

    if (open) {
      const favPx = open.side === 'LONG' ? bar.high : bar.low;
      const curR = signed(open.side, open.entry, favPx) / open.risk;
      open.mfeR = Math.max(open.mfeR, curR);

      // Breakeven
      if (p.beAtR != null && !open.beArmed && open.mfeR >= p.beAtR) {
        open.beArmed = true;
        open.stop = open.entry; // BE before cost; cost still hits on exit
      }

      // Trail from MFE
      if (p.trailAtR != null && open.mfeR >= p.trailAtR) {
        const lock = open.mfeR * p.trailKeepFrac * open.risk;
        if (open.side === 'LONG') {
          open.stop = Math.max(open.stop, open.entry + lock);
        } else {
          open.stop = Math.min(open.stop, open.entry - lock);
        }
      }

      if (open.side === 'LONG' && bar.low <= open.stop) {
        closeTrade(open, open.stop, bar.t, open.beArmed && open.stop >= open.entry ? 'BE_SL' : 'SL');
      } else if (open.side === 'SHORT' && bar.high >= open.stop) {
        closeTrade(open, open.stop, bar.t, open.beArmed && open.stop <= open.entry ? 'BE_SL' : 'SL');
      } else if (open.side === 'LONG' && bar.high >= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (open.side === 'SHORT' && bar.low <= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (p.exitOnInside && inside) {
        closeTrade(open, bar.close, bar.t, 'INSIDE');
      }
    }

    if (open) continue;
    if (!inSession(bar.t, p.sessionUtc)) continue;
    if ((dayCounts.get(day) || 0) >= p.maxTradesPerDay) continue;
    if (lastExitMs && tMs - lastExitMs < p.cooldownMs) continue;
    if (!rangeOk) continue;

    let side: Side | null = null;
    if (firstLong && (!p.useHtf || htfBull)) side = 'LONG';
    if (firstShort && (!p.useHtf || htfBear)) side = 'SHORT';
    if (!side) continue;

    const risk = atrArr[i] * p.slAtr;
    if (risk < 1) continue; // skip tiny risk noise
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
  const expectancyR =
    trades.length > 0
      ? Math.round(
          ((wins.length / trades.length) * (wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0) +
            (losses.length / trades.length) *
              (losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0)) *
            100
        ) / 100
      : 0;
  // Proper expectancy in R
  const expR =
    trades.length > 0
      ? Math.round((trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length) * 100) / 100
      : 0;
  const avgRisk =
    trades.length > 0
      ? Math.round((trades.reduce((s, t) => s + t.riskUsd, 0) / trades.length) * 100) / 100
      : 0;
  const profitFactor = (() => {
    const gw = trades.filter((t) => t.gross > 0).reduce((s, t) => s + t.gross, 0);
    const gl = Math.abs(trades.filter((t) => t.gross < 0).reduce((s, t) => s + t.gross, 0));
    return gl > 0 ? Math.round((gw / gl) * 100) / 100 : gw > 0 ? 99 : 0;
  })();

  void expectancyR;

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
    avgR: avgR,
    expectancyR: expR,
    profitFactor,
    maxDd: Math.round(maxDd * 100) / 100,
    exitMix,
    rr: p.rr,
    slAtr: p.slAtr,
  };
}

async function main() {
  const [r5, r15] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '5m', 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '15m', 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!r5.ok || !r5.candles.length) throw new Error(r5.error || '5m failed');
  if (!r15.ok || !r15.candles.length) throw new Error(r15.error || '15m failed');

  const base = {
    bbLen: 10,
    bbDev: 1,
    fastLen: 12,
    slowLen: 26,
    htfEmaLen: 21,
    useHtf: true,
    sessionUtc: [13, 18] as [number, number],
    atrLen: 14,
    minAtrMult: 0.15,
    costUsd: 2,
    maxTradesPerDay: 3,
    cooldownMs: 15 * 60 * 1000,
    beAtR: null as number | null,
    trailAtR: null as number | null,
    trailKeepFrac: 0.5,
    exitOnInside: false,
  };

  const specs: { label: string; params: Params }[] = [
    // Classic R:R matrix
    { label: 'SL1ATR RR1:1.5 NY+HTF', params: { ...base, slAtr: 1, rr: 1.5 } },
    { label: 'SL1ATR RR1:2 NY+HTF', params: { ...base, slAtr: 1, rr: 2 } },
    { label: 'SL1ATR RR1:2.5 NY+HTF', params: { ...base, slAtr: 1, rr: 2.5 } },
    { label: 'SL1ATR RR1:3 NY+HTF', params: { ...base, slAtr: 1, rr: 3 } },
    { label: 'SL1.5ATR RR1:2 NY+HTF', params: { ...base, slAtr: 1.5, rr: 2 } },
    { label: 'SL1.5ATR RR1:3 NY+HTF', params: { ...base, slAtr: 1.5, rr: 3 } },
    { label: 'SL2ATR RR1:2 NY+HTF', params: { ...base, slAtr: 2, rr: 2 } },
    { label: 'SL2ATR RR1:3 NY+HTF', params: { ...base, slAtr: 2, rr: 3 } },

    // Pro management: BE + trail
    {
      label: 'SL1ATR RR1:2 BE@1R trail@1.5R keep50%',
      params: { ...base, slAtr: 1, rr: 2, beAtR: 1, trailAtR: 1.5, trailKeepFrac: 0.5 },
    },
    {
      label: 'SL1ATR RR1:3 BE@1R trail@1.5R keep50%',
      params: { ...base, slAtr: 1, rr: 3, beAtR: 1, trailAtR: 1.5, trailKeepFrac: 0.5 },
    },
    {
      label: 'SL1.5ATR RR1:2.5 BE@1R',
      params: { ...base, slAtr: 1.5, rr: 2.5, beAtR: 1 },
    },

    // Max 1/day quality
    {
      label: 'SL1ATR RR1:2 max1/day',
      params: { ...base, slAtr: 1, rr: 2, maxTradesPerDay: 1 },
    },
    {
      label: 'SL1ATR RR1:3 max1/day',
      params: { ...base, slAtr: 1, rr: 3, maxTradesPerDay: 1 },
    },
    {
      label: 'SL1ATR RR1:2.5 BE+trail max1/day',
      params: {
        ...base,
        slAtr: 1,
        rr: 2.5,
        maxTradesPerDay: 1,
        beAtR: 1,
        trailAtR: 1.5,
        trailKeepFrac: 0.5,
      },
    },

    // With MACD inside exit (time stop)
    {
      label: 'SL1ATR RR1:2 + exit inside',
      params: { ...base, slAtr: 1, rr: 2, exitOnInside: true },
    },
    {
      label: 'SL1ATR RR1:3 + exit inside',
      params: { ...base, slAtr: 1, rr: 3, exitOnInside: true },
    },
  ];

  const rows = specs.map((s) => run({ entry: r5.candles, htf: r15.candles, params: s.params, label: s.label }));
  const ranked = [...rows].sort((a, b) => {
    // Rank like a pro: net first, then expectancy R, then PF, then lower DD
    if (b.net !== a.net) return b.net - a.net;
    if (b.expectancyR !== a.expectancyR) return b.expectancyR - a.expectancyR;
    return a.maxDd - b.maxDd;
  });

  console.log(
    JSON.stringify(
      {
        symbol: GOLD_YAHOO_SYMBOL,
        style: 'Pro ATR risk + fixed R:R (no fixed $5 target)',
        entryTf: '5m',
        htfTf: '15m',
        cost: '$2/RT',
        from: r5.candles[0]?.t,
        to: r5.candles[r5.candles.length - 1]?.t,
        best: ranked.slice(0, 5),
        all: ranked,
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
