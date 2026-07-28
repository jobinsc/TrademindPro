/**
 * Backtest: Gold ORB+ (cleaned Intrablast)
 * - ORB window (default NY ~13:30-14:30 UTC)
 * - First break only
 * - Optional EMA bias
 * - SL = ATR * slAtr, TP = risk * rr
 * - Cost $2
 *
 * Run: npx tsx scripts/gold-orb-plus-backtest.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { fetchYahooCandles } from '../src/lib/yahoo-nifty';
import { GOLD_YAHOO_LABEL, GOLD_YAHOO_SYMBOL } from '../src/lib/gold-pulse/rules';

type Side = 'LONG' | 'SHORT';

type Params = {
  /** UTC hour range [start, end) for ORB build */
  orbUtc: [number, number];
  emaLen: number;
  useEmaFilter: boolean;
  atrLen: number;
  slAtr: number;
  rr: number;
  costUsd: number;
  maxTradesPerDay: number;
  onlyFirstBreak: boolean;
};

type Trade = {
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  reason: string;
  risk: number;
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

function dayKey(iso: string) {
  return iso.slice(0, 10);
}
function utcHour(iso: string) {
  return new Date(iso).getUTCHours();
}
function utcMinute(iso: string) {
  return new Date(iso).getUTCMinutes();
}
/** Fractional UTC hour for session checks */
function utcHourFrac(iso: string) {
  return utcHour(iso) + utcMinute(iso) / 60;
}
function inOrbWindow(iso: string, orb: [number, number]) {
  const h = utcHourFrac(iso);
  const [a, b] = orb;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}
function signed(side: Side, entry: number, px: number) {
  return side === 'LONG' ? px - entry : entry - px;
}

function run(opts: { candles: Candle[]; params: Params; label: string }) {
  const p = opts.params;
  const c = [...opts.candles].sort((a, b) => a.t.localeCompare(b.t));
  const closes = c.map((x) => x.close);
  const emaArr = ema(closes, p.emaLen);
  const atrArr = atrSeries(c, p.atrLen);
  const warm = Math.max(p.emaLen, p.atrLen) + 5;

  // Per-day ORB state
  let curDay = '';
  let orbHi = NaN;
  let orbLo = NaN;
  let inOrb = false;
  let wasInOrb = false;
  let orbReady = false;
  let brokeUp = false;
  let brokeDn = false;
  let dayTrades = 0;

  type Open = {
    side: Side;
    openedAt: string;
    entry: number;
    risk: number;
    stop: number;
    tp: number;
  };

  let open: Open | null = null;
  const trades: Trade[] = [];
  const tradingDays = new Set<string>();
  const daysWithTrade = new Set<string>();
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
      risk: Math.round(o.risk * 100) / 100,
      rMultiple,
      gross,
      net,
    });
    exitMix[reason] = (exitMix[reason] || 0) + 1;
    daysWithTrade.add(dayKey(o.openedAt));
    equity += net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    open = null;
  };

  for (let i = warm; i < c.length; i++) {
    const bar = c[i];
    const day = dayKey(bar.t);
    tradingDays.add(day);

    if (day !== curDay) {
      curDay = day;
      orbHi = NaN;
      orbLo = NaN;
      inOrb = false;
      wasInOrb = false;
      orbReady = false;
      brokeUp = false;
      brokeDn = false;
      dayTrades = 0;
      // flatten overnight
      if (open) closeTrade(open, c[i - 1].close, c[i - 1].t, 'EOD');
    }

    wasInOrb = inOrb;
    inOrb = inOrbWindow(bar.t, p.orbUtc);

    if (inOrb && !wasInOrb) {
      orbHi = bar.high;
      orbLo = bar.low;
      orbReady = false;
    }
    if (inOrb) {
      orbHi = Math.max(orbHi, bar.high);
      orbLo = Math.min(orbLo, bar.low);
    }
    if (!inOrb && wasInOrb) {
      orbReady = Number.isFinite(orbHi) && Number.isFinite(orbLo) && orbHi > orbLo;
    }

    // Manage open
    if (open) {
      if (open.side === 'LONG' && bar.low <= open.stop) closeTrade(open, open.stop, bar.t, 'SL');
      else if (open.side === 'SHORT' && bar.high >= open.stop) closeTrade(open, open.stop, bar.t, 'SL');
      else if (open.side === 'LONG' && bar.high >= open.tp) closeTrade(open, open.tp, bar.t, 'TP');
      else if (open.side === 'SHORT' && bar.low <= open.tp) closeTrade(open, open.tp, bar.t, 'TP');
    }

    if (open) continue;
    if (!orbReady || inOrb) continue;
    if (dayTrades >= p.maxTradesPerDay) continue;
    if (!Number.isFinite(atrArr[i]) || atrArr[i] <= 0) continue;
    if (p.useEmaFilter && !Number.isFinite(emaArr[i])) continue;

    const prev = c[i - 1];
    const longBreak = bar.close > orbHi && prev.close <= orbHi;
    const shortBreak = bar.close < orbLo && prev.close >= orbLo;

    let side: Side | null = null;
    if (longBreak && (!p.onlyFirstBreak || !brokeUp)) {
      if (!p.useEmaFilter || bar.close > emaArr[i]) side = 'LONG';
    }
    if (!side && shortBreak && (!p.onlyFirstBreak || !brokeDn)) {
      if (!p.useEmaFilter || bar.close < emaArr[i]) side = 'SHORT';
    }
    if (!side) continue;

    const risk = atrArr[i] * p.slAtr;
    if (risk < 1) continue;
    const entry = bar.close;
    open = {
      side,
      openedAt: bar.t,
      entry,
      risk,
      stop: side === 'LONG' ? entry - risk : entry + risk,
      tp: side === 'LONG' ? entry + risk * p.rr : entry - risk * p.rr,
    };
    dayTrades += 1;
    if (side === 'LONG') brokeUp = true;
    else brokeDn = true;
  }

  if (open && c.length) closeTrade(open, c[c.length - 1].close, c[c.length - 1].t, 'EOD');

  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const net = nets.reduce((a, b) => a + b, 0);
  const avgR =
    trades.length > 0
      ? Math.round((trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length) * 100) / 100
      : 0;
  const gw = trades.filter((t) => t.gross > 0).reduce((s, t) => s + t.gross, 0);
  const gl = Math.abs(trades.filter((t) => t.gross < 0).reduce((s, t) => s + t.gross, 0));
  const pf = gl > 0 ? Math.round((gw / gl) * 100) / 100 : gw > 0 ? 99 : 0;
  const td = tradingDays.size;
  const dwt = daysWithTrade.size;

  return {
    label: opts.label,
    trades: trades.length,
    tradingDays: td,
    daysWithTrade: dwt,
    dayCoveragePct: td ? Math.round((1000 * dwt) / td) / 10 : 0,
    winRate: trades.length ? Math.round((1000 * wins.length) / trades.length) / 10 : 0,
    gross: Math.round(trades.reduce((s, t) => s + t.gross, 0) * 100) / 100,
    net: Math.round(net * 100) / 100,
    avgNet: trades.length ? Math.round((net / trades.length) * 100) / 100 : 0,
    avgWin: wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length
      ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100
      : 0,
    expectancyR: avgR,
    profitFactor: pf,
    maxDd: Math.round(maxDd * 100) / 100,
    exitMix,
    lastTrades: trades.slice(-6),
  };
}

async function main() {
  // 5m has ~1mo; also try 15m
  const [r5, r15] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '5m', 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '15m', 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!r5.ok || !r5.candles.length) throw new Error(r5.error || '5m failed');
  if (!r15.ok || !r15.candles.length) throw new Error(r15.error || '15m failed');

  const specs: { label: string; tf: '5m' | '15m'; params: Params }[] = [
    {
      label: '5m NY ORB 13:30-14:30 · EMA50 · SL1ATR RR2 · max2 · first',
      tf: '5m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 2,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m NY ORB · EMA50 · SL1ATR RR3 · max2',
      tf: '5m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 3,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m NY ORB · EMA50 · SL1ATR RR2 · max1',
      tf: '5m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 2,
        costUsd: 2,
        maxTradesPerDay: 1,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m NY ORB · no EMA · SL1ATR RR2 · max2',
      tf: '5m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: false,
        atrLen: 14,
        slAtr: 1,
        rr: 2,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m London ORB 07-08 · EMA50 · SL1ATR RR2 · max2',
      tf: '5m',
      params: {
        orbUtc: [7, 8],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 2,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m London ORB · EMA50 · SL1ATR RR3 · max2',
      tf: '5m',
      params: {
        orbUtc: [7, 8],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 3,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '15m NY ORB · EMA50 · SL1ATR RR2 · max2',
      tf: '15m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 2,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '15m NY ORB · EMA50 · SL1ATR RR3 · max1',
      tf: '15m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1,
        rr: 3,
        costUsd: 2,
        maxTradesPerDay: 1,
        onlyFirstBreak: true,
      },
    },
    {
      label: '15m London ORB · EMA50 · SL1.5ATR RR2.5 · max2',
      tf: '15m',
      params: {
        orbUtc: [7, 8],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1.5,
        rr: 2.5,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
    {
      label: '5m NY ORB · EMA50 · SL1.5ATR RR2.5 · max2',
      tf: '5m',
      params: {
        orbUtc: [13.5, 14.5],
        emaLen: 50,
        useEmaFilter: true,
        atrLen: 14,
        slAtr: 1.5,
        rr: 2.5,
        costUsd: 2,
        maxTradesPerDay: 2,
        onlyFirstBreak: true,
      },
    },
  ];

  const rows = specs.map((s) =>
    run({
      candles: s.tf === '5m' ? r5.candles : r15.candles,
      params: s.params,
      label: s.label,
    })
  );
  const ranked = [...rows].sort((a, b) => b.net - a.net);

  console.log(
    JSON.stringify(
      {
        strategy: 'Gold ORB+ (cleaned Intrablast)',
        symbol: GOLD_YAHOO_SYMBOL,
        cost: '$2/RT',
        from5m: r5.candles[0]?.t,
        to5m: r5.candles[r5.candles.length - 1]?.t,
        best: ranked.slice(0, 4).map(({ lastTrades, ...r }) => r),
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
