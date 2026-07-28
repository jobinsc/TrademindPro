/**
 * GoldPulse 1m scalp probe — target ~$5/trade net, cost $2 (not $5).
 * Yahoo 1m only ~7 days. Run: npx tsx scripts/gold-pulse-1m-scalp-test.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { runUtBot } from '../src/lib/nexus-pulse/ut-bot';
import { fetchYahooCandles } from '../src/lib/yahoo-nifty';
import { GOLD_YAHOO_LABEL, GOLD_YAHOO_SYMBOL } from '../src/lib/gold-pulse/rules';

type Side = 'LONG' | 'SHORT';

type Params = {
  targetUsd: number;
  stopUsd: number;
  costUsd: number;
  maxTradesPerDay: number;
  cooldownMs: number;
  requireEdge: boolean;
  sessionUtc: [number, number] | null;
};

type Trade = {
  day: string;
  side: Side;
  openedAt: string;
  closedAt: string;
  reason: string;
  gross: number;
  net: number;
};

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
function htfIndexAt(htfTimes: number[], tMs: number) {
  let lo = 0;
  let hi = htfTimes.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (htfTimes[mid] <= tMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function run(opts: { entry: Candle[]; htf: Candle[]; params: Params }) {
  const p = opts.params;
  const cE = [...opts.entry].sort((a, b) => a.t.localeCompare(b.t));
  const cH = [...opts.htf].sort((a, b) => a.t.localeCompare(b.t));
  const utE = runUtBot(cE, { keyValue: 1, atrPeriod: 10 });
  const utH = runUtBot(cH, { keyValue: 1, atrPeriod: 14 });
  const htfTimes = cH.map((c) => new Date(c.t).getTime());
  const warm = 25;

  const tradingDays = new Set<string>();
  for (const c of cE) {
    if (inSession(c.t, p.sessionUtc)) tradingDays.add(dayKey(c.t));
  }
  if (!p.sessionUtc) {
    for (const c of cE) tradingDays.add(dayKey(c.t));
  }

  type Open = {
    side: Side;
    openedAt: string;
    entry: number;
    tp: number;
    sl: number;
    openBar: number;
  };

  let open: Open | null = null;
  const trades: Trade[] = [];
  const dayCounts = new Map<string, number>();
  let lastExitMs = 0;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const exitMix: Record<string, number> = {};

  const close = (o: Open, exit: number, closedAt: string, reason: string, i: number) => {
    const gross = Math.round(signed(o.side, o.entry, exit) * 100) / 100;
    const net = Math.round((gross - p.costUsd) * 100) / 100;
    trades.push({
      day: dayKey(o.openedAt),
      side: o.side,
      openedAt: o.openedAt,
      closedAt,
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

  for (let i = warm; i < cE.length; i++) {
    const bar = cE[i];
    const u = utE[i];
    const prev = utE[i - 1];
    if (!u || !prev) continue;
    const day = dayKey(bar.t);
    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfPos = (hi >= 0 ? utH[hi]?.pos : 0) as -1 | 0 | 1;

    if (open) {
      if (open.side === 'LONG') {
        if (bar.low <= open.sl) close(open, open.sl, bar.t, 'SL', i);
        else if (bar.high >= open.tp) close(open, open.tp, bar.t, 'TP', i);
      } else {
        if (bar.high >= open.sl) close(open, open.sl, bar.t, 'SL', i);
        else if (bar.low <= open.tp) close(open, open.tp, bar.t, 'TP', i);
      }
    }

    if (open) continue;
    if (!tradingDays.has(day)) continue;
    if ((dayCounts.get(day) || 0) >= p.maxTradesPerDay) continue;
    if (!inSession(bar.t, p.sessionUtc)) continue;
    if (lastExitMs && tMs - lastExitMs < p.cooldownMs) continue;

    const buyOk = p.requireEdge ? u.buy && !prev.buy : u.buy;
    const sellOk = p.requireEdge ? u.sell && !prev.sell : u.sell;
    let side: Side | null = null;
    if (buyOk && htfPos === 1) side = 'LONG';
    if (sellOk && htfPos === -1) side = 'SHORT';
    if (!side) continue;

    const entry = bar.close;
    open = {
      side,
      openedAt: bar.t,
      entry,
      tp: side === 'LONG' ? entry + p.targetUsd : entry - p.targetUsd,
      sl: side === 'LONG' ? entry - p.stopUsd : entry + p.stopUsd,
      openBar: i,
    };
  }

  if (open) {
    const last = cE[cE.length - 1];
    close(open, last.close, last.t, 'EOD', cE.length - 1);
  }

  const days = [...tradingDays].sort();
  const daysWith = days.filter((d) => (dayCounts.get(d) || 0) > 0);
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const net = nets.reduce((a, b) => a + b, 0);
  const near5 = trades.filter((t) => t.net >= 4.5 && t.net <= 5.5).length;

  return {
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
    hitsNetAbout5: near5,
    params: p,
  };
}

async function main() {
  const [r1, r5] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '1m', 0, GOLD_YAHOO_LABEL, '7d'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '5m', 0, GOLD_YAHOO_LABEL, '7d'),
  ]);
  if (!r1.ok || !r1.candles.length) throw new Error(r1.error || '1m failed');
  if (!r5.ok || !r5.candles.length) throw new Error(r5.error || '5m failed');

  // Net ~$5 with cost $2 => gross TP $7
  const combos: { label: string; params: Params }[] = [
    {
      label: '1m+5m TP7 SL5 cost2 max3 NY',
      params: {
        targetUsd: 7,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 10 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [13, 18],
      },
    },
    {
      label: '1m+5m TP7 SL7 cost2 max3 NY',
      params: {
        targetUsd: 7,
        stopUsd: 7,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 10 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [13, 18],
      },
    },
    {
      label: '1m+5m TP7 SL4 cost2 max3 NY',
      params: {
        targetUsd: 7,
        stopUsd: 4,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 10 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [13, 18],
      },
    },
    {
      label: '1m+5m TP7 SL5 cost2 max1 NY',
      params: {
        targetUsd: 7,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 1,
        cooldownMs: 5 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [13, 18],
      },
    },
    {
      label: '1m+5m TP7 SL5 cost2 max6 all-day',
      params: {
        targetUsd: 7,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 6,
        cooldownMs: 15 * 60 * 1000,
        requireEdge: true,
        sessionUtc: null,
      },
    },
    {
      label: '1m+5m TP7 SL5 cost2 max3 London',
      params: {
        targetUsd: 7,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 10 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [7, 12],
      },
    },
    {
      label: '1m+5m TP10 SL5 cost2 max3 NY (net~8)',
      params: {
        targetUsd: 10,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 10 * 60 * 1000,
        requireEdge: true,
        sessionUtc: [13, 18],
      },
    },
    {
      label: '1m+5m TP7 SL5 cost2 max3 all-day edge',
      params: {
        targetUsd: 7,
        stopUsd: 5,
        costUsd: 2,
        maxTradesPerDay: 3,
        cooldownMs: 20 * 60 * 1000,
        requireEdge: true,
        sessionUtc: null,
      },
    },
  ];

  const rows = combos.map((c) => ({
    label: c.label,
    ...run({ entry: r1.candles, htf: r5.candles, params: c.params }),
  }));

  const ranked = [...rows].sort((a, b) => b.net - a.net);

  console.log(
    JSON.stringify(
      {
        symbol: GOLD_YAHOO_SYMBOL,
        entryTf: '1m',
        htfTf: '5m',
        bars1m: r1.candles.length,
        bars5m: r5.candles.length,
        from: r1.candles[0]?.t,
        to: r1.candles[r1.candles.length - 1]?.t,
        assumption: 'Cost $2/round trip. TP $7 gross => ~$5 net on wins.',
        note: 'Yahoo 1m history is only ~7 days — short sample.',
        best: ranked.slice(0, 4),
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
