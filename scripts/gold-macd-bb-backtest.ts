/**
 * Backtest: AK MACD BB Gold Intraday+ rules
 * - First break of MACD outside BB only
 * - 15m HTF filter (close vs EMA21)
 * - NY session UTC 13-18
 * - ATR chop filter
 * - Exit: MACD back inside BB, opposite signal, SL, or EOD
 * - Cost $2
 *
 * Run: npx tsx scripts/gold-macd-bb-backtest.ts
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
  minAtrMult: number;
  /** Fixed SL $ (0 = off, use only MACD exit). */
  stopUsd: number;
  /** Fixed TP $ (0 = off). */
  targetUsd: number;
  costUsd: number;
  maxTradesPerDay: number;
  cooldownMs: number;
  /** Exit when MACD returns inside bands. */
  exitOnInside: boolean;
  /** Exit on opposite first-break. */
  exitOnOpposite: boolean;
};

type Trade = {
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  reason: string;
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

function atr(candles: Candle[], len: number): number[] {
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

function runBacktest(opts: {
  entry: Candle[];
  htf: Candle[];
  params: Params;
  label: string;
}) {
  const p = opts.params;
  const c = [...opts.entry].sort((a, b) => a.t.localeCompare(b.t));
  const h = [...opts.htf].sort((a, b) => a.t.localeCompare(b.t));
  const closes = c.map((x) => x.close);
  const fast = ema(closes, p.fastLen);
  const slow = ema(closes, p.slowLen);
  const macd = closes.map((_, i) =>
    Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : NaN
  );
  const basis = sma(macd.map((v) => (Number.isFinite(v) ? v : 0)), p.bbLen);
  // recompute BB only where macd valid — use raw macd with NaN handling
  const macdFilled = macd.map((v) => (Number.isFinite(v) ? v : 0));
  const bbBasis = sma(macdFilled, p.bbLen);
  const bbStd = stdev(macdFilled, p.bbLen);
  const upper = bbBasis.map((b, i) => (Number.isFinite(b) && Number.isFinite(bbStd[i]) ? b + p.bbDev * bbStd[i] : NaN));
  const lower = bbBasis.map((b, i) => (Number.isFinite(b) && Number.isFinite(bbStd[i]) ? b - p.bbDev * bbStd[i] : NaN));
  const atrArr = atr(c, p.atrLen);

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
    stop: number | null;
    tp: number | null;
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
    const move = o.side === 'LONG' ? exit - o.entry : o.entry - exit;
    const gross = Math.round(move * 100) / 100;
    const net = Math.round((gross - p.costUsd) * 100) / 100;
    trades.push({
      side: o.side,
      openedAt: o.openedAt,
      closedAt,
      entry: o.entry,
      exit,
      reason,
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
    if (![m, mPrev, up, lo, upPrev, loPrev].every(Number.isFinite)) continue;

    const above = m > up;
    const below = m < lo;
    const abovePrev = mPrev > upPrev;
    const belowPrev = mPrev < loPrev;
    const firstLong = above && !abovePrev;
    const firstShort = below && !belowPrev;
    const inside = !above && !below;

    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfBull = hi >= 0 && Number.isFinite(htfEma[hi]) && h[hi].close >= htfEma[hi];
    const htfBear = hi >= 0 && Number.isFinite(htfEma[hi]) && h[hi].close <= htfEma[hi];
    const day = dayKey(bar.t);
    const rangeOk =
      p.minAtrMult <= 0 ||
      (Number.isFinite(atrArr[i]) && bar.high - bar.low >= atrArr[i] * p.minAtrMult);

    // manage open
    if (open) {
      if (open.side === 'LONG' && open.stop != null && bar.low <= open.stop) {
        closeTrade(open, open.stop, bar.t, 'SL');
      } else if (open.side === 'SHORT' && open.stop != null && bar.high >= open.stop) {
        closeTrade(open, open.stop, bar.t, 'SL');
      } else if (open.side === 'LONG' && open.tp != null && bar.high >= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (open.side === 'SHORT' && open.tp != null && bar.low <= open.tp) {
        closeTrade(open, open.tp, bar.t, 'TP');
      } else if (p.exitOnInside && inside) {
        closeTrade(open, bar.close, bar.t, 'INSIDE');
      } else if (p.exitOnOpposite && open.side === 'LONG' && firstShort) {
        closeTrade(open, bar.close, bar.t, 'OPPOSITE');
      } else if (p.exitOnOpposite && open.side === 'SHORT' && firstLong) {
        closeTrade(open, bar.close, bar.t, 'OPPOSITE');
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

    const entry = bar.close;
    open = {
      side,
      openedAt: bar.t,
      entry,
      stop:
        p.stopUsd > 0
          ? side === 'LONG'
            ? entry - p.stopUsd
            : entry + p.stopUsd
          : null,
      tp:
        p.targetUsd > 0
          ? side === 'LONG'
            ? entry + p.targetUsd
            : entry - p.targetUsd
          : null,
    };
  }

  if (open && c.length) {
    const last = c[c.length - 1];
    closeTrade(open, last.close, last.t, 'EOD');
  }

  const days = [...tradingDays].sort();
  const daysWith = days.filter((d) => (dayCounts.get(d) || 0) > 0);
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const net = nets.reduce((a, b) => a + b, 0);

  return {
    label: opts.label,
    from: c[0]?.t,
    to: c[c.length - 1]?.t,
    bars: c.length,
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
    maxDd: Math.round(maxDd * 100) / 100,
    exitMix,
    hitsNetAbout5: trades.filter((t) => t.net >= 4.5 && t.net <= 5.5).length,
    params: p,
    lastTrades: trades.slice(-6),
  };
}

async function main() {
  // Yahoo has no 3m; use 5m entry + 15m HTF (same rules as suggested)
  const [r5, r15] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '5m', 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '15m', 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!r5.ok || !r5.candles.length) throw new Error(r5.error || '5m failed');
  if (!r15.ok || !r15.candles.length) throw new Error(r15.error || '15m failed');

  const base: Omit<Params, 'stopUsd' | 'targetUsd' | 'maxTradesPerDay' | 'exitOnInside' | 'exitOnOpposite'> = {
    bbLen: 10,
    bbDev: 1,
    fastLen: 12,
    slowLen: 26,
    htfEmaLen: 21,
    useHtf: true,
    sessionUtc: [13, 18],
    atrLen: 14,
    minAtrMult: 0.15,
    costUsd: 2,
    cooldownMs: 10 * 60 * 1000,
  };

  const specs: { label: string; params: Params }[] = [
    {
      label: 'NY+HTF first-break, exit inside, no SL/TP',
      params: {
        ...base,
        stopUsd: 0,
        targetUsd: 0,
        maxTradesPerDay: 3,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
    {
      label: 'NY+HTF, exit inside, TP7 SL5 (net~5 win)',
      params: {
        ...base,
        stopUsd: 5,
        targetUsd: 7,
        maxTradesPerDay: 3,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
    {
      label: 'NY+HTF, TP7 SL7 only (no inside exit)',
      params: {
        ...base,
        stopUsd: 7,
        targetUsd: 7,
        maxTradesPerDay: 3,
        exitOnInside: false,
        exitOnOpposite: false,
      },
    },
    {
      label: 'NY+HTF, TP7 SL5, max1/day',
      params: {
        ...base,
        stopUsd: 5,
        targetUsd: 7,
        maxTradesPerDay: 1,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
    {
      label: 'No HTF, NY, TP7 SL5, exit inside',
      params: {
        ...base,
        useHtf: false,
        stopUsd: 5,
        targetUsd: 7,
        maxTradesPerDay: 3,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
    {
      label: 'All-day+HTF, TP7 SL5, exit inside',
      params: {
        ...base,
        sessionUtc: null,
        stopUsd: 5,
        targetUsd: 7,
        maxTradesPerDay: 3,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
    {
      label: 'NY+HTF, TP10 SL6, exit inside',
      params: {
        ...base,
        stopUsd: 6,
        targetUsd: 10,
        maxTradesPerDay: 3,
        exitOnInside: true,
        exitOnOpposite: true,
      },
    },
  ];

  const rows = specs.map((s) =>
    runBacktest({
      entry: r5.candles,
      htf: r15.candles,
      params: s.params,
      label: s.label,
    })
  );
  const ranked = [...rows].sort((a, b) => b.net - a.net);

  console.log(
    JSON.stringify(
      {
        symbol: GOLD_YAHOO_SYMBOL,
        entryTf: '5m (Yahoo has no 3m — same improved rules)',
        htfTf: '15m',
        cost: '$2/round trip',
        from: r5.candles[0]?.t,
        to: r5.candles[r5.candles.length - 1]?.t,
        bars5m: r5.candles.length,
        best: ranked.slice(0, 3).map(({ lastTrades, params, ...rest }) => rest),
        all: ranked.map(({ lastTrades, params, ...rest }) => rest),
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
