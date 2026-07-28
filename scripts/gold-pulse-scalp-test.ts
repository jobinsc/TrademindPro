/**
 * GoldPulse scalp probe — fixed setups, max 1 trade/day, fixed $ TP/SL.
 * Goal: check if ~$5–6 net/trade is realistic without overtrading,
 * and how often trading days get at least one fill.
 *
 * Run: npx tsx scripts/gold-pulse-scalp-test.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { runUtBot } from '../src/lib/nexus-pulse/ut-bot';
import { fetchYahooCandles } from '../src/lib/yahoo-nifty';
import { GOLD_YAHOO_LABEL, GOLD_YAHOO_SYMBOL } from '../src/lib/gold-pulse/rules';

type Side = 'LONG' | 'SHORT';

type ScalpParams = {
  targetUsd: number; // gross TP
  stopUsd: number; // gross SL
  costUsd: number;
  maxTradesPerDay: number;
  /** UTC hour window [start, end) — null = all day */
  sessionUtc: [number, number] | null;
  /** Require new UT buy/sell edge (not just pos). */
  requireEdge: boolean;
  /** If still flat near end of window, take first HTF-aligned bar (soft daily fill). */
  forceDailyIfMissed: boolean;
  forceAfterUtcHour: number;
};

type Trade = {
  day: string;
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  reason: 'TP' | 'SL' | 'EOD';
  gross: number;
  net: number;
  barsHeld: number;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function utcHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

function htfIndexAt(htfTimes: number[], tMs: number): number {
  let lo = 0;
  let hi = htfTimes.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (htfTimes[mid] <= tMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function signed(side: Side, entry: number, px: number) {
  return side === 'LONG' ? px - entry : entry - px;
}

function inSession(iso: string, session: [number, number] | null): boolean {
  if (!session) return true;
  const h = utcHour(iso);
  const [a, b] = session;
  if (a <= b) return h >= a && h < b;
  return h >= a || h < b;
}

function runScalp(opts: {
  entry: Candle[];
  htf: Candle[];
  params: ScalpParams;
}): {
  trades: Trade[];
  tradingDays: string[];
  daysWithTrade: string[];
  dayCoveragePct: number;
  net: number;
  gross: number;
  winRate: number;
  avgNet: number;
  avgWin: number;
  avgLoss: number;
  maxDd: number;
  exitMix: Record<string, number>;
  params: ScalpParams;
} {
  const p = opts.params;
  const cEntry = [...opts.entry].sort((a, b) => a.t.localeCompare(b.t));
  const cHtf = [...opts.htf].sort((a, b) => a.t.localeCompare(b.t));
  const utE = runUtBot(cEntry, { keyValue: 1, atrPeriod: 10 });
  const utH = runUtBot(cHtf, { keyValue: 1, atrPeriod: 14 });
  const htfTimes = cHtf.map((c) => new Date(c.t).getTime());
  const warm = 20;

  const tradingDaySet = new Set<string>();
  for (const c of cEntry) {
    if (inSession(c.t, p.sessionUtc) || !p.sessionUtc) tradingDaySet.add(dayKey(c.t));
  }
  // Prefer days that have bars in session if session set
  if (p.sessionUtc) {
    tradingDaySet.clear();
    for (const c of cEntry) {
      if (inSession(c.t, p.sessionUtc)) tradingDaySet.add(dayKey(c.t));
    }
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
  const exitMix: Record<string, number> = {};
  let equity = 0;
  let peak = 0;
  let maxDd = 0;

  const close = (o: Open, exit: number, closedAt: string, reason: Trade['reason'], barIdx: number) => {
    const move = signed(o.side, o.entry, exit);
    const gross = Math.round(move * 100) / 100;
    const net = Math.round((gross - p.costUsd) * 100) / 100;
    const day = dayKey(o.openedAt);
    trades.push({
      day,
      side: o.side,
      openedAt: o.openedAt,
      closedAt,
      entry: o.entry,
      exit,
      reason,
      gross,
      net,
      barsHeld: Math.max(1, barIdx - o.openBar),
    });
    exitMix[reason] = (exitMix[reason] || 0) + 1;
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    equity += net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    open = null;
  };

  for (let i = warm; i < cEntry.length; i++) {
    const bar = cEntry[i];
    const u = utE[i];
    const prev = utE[i - 1];
    if (!u || !prev) continue;
    const day = dayKey(bar.t);
    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfPos = (hi >= 0 ? utH[hi]?.pos : 0) as -1 | 0 | 1;

    if (open) {
      if (open.side === 'LONG') {
        if (bar.low <= open.sl) {
          close(open, open.sl, bar.t, 'SL', i);
        } else if (bar.high >= open.tp) {
          close(open, open.tp, bar.t, 'TP', i);
        }
      } else {
        if (bar.high >= open.sl) {
          close(open, open.sl, bar.t, 'SL', i);
        } else if (bar.low <= open.tp) {
          close(open, open.tp, bar.t, 'TP', i);
        }
      }
    }

    if (open) continue;
    if (!tradingDaySet.has(day)) continue;
    if ((dayCounts.get(day) || 0) >= p.maxTradesPerDay) continue;
    if (!inSession(bar.t, p.sessionUtc)) continue;

    const buyEdge = u.buy && !prev.buy;
    const sellEdge = u.sell && !prev.sell;
    const buyOk = p.requireEdge ? buyEdge : u.buy;
    const sellOk = p.requireEdge ? sellEdge : u.sell;

    let side: Side | null = null;
    if (buyOk && htfPos === 1) side = 'LONG';
    if (sellOk && htfPos === -1) side = 'SHORT';

    // Soft daily fill: after force hour, allow HTF-aligned pos without edge
    if (
      !side &&
      p.forceDailyIfMissed &&
      (dayCounts.get(day) || 0) === 0 &&
      utcHour(bar.t) >= p.forceAfterUtcHour &&
      inSession(bar.t, p.sessionUtc)
    ) {
      if (htfPos === 1 && u.pos === 1) side = 'LONG';
      if (htfPos === -1 && u.pos === -1) side = 'SHORT';
    }

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

  if (open && cEntry.length) {
    const last = cEntry[cEntry.length - 1];
    close(open, last.close, last.t, 'EOD', cEntry.length - 1);
  }

  const tradingDays = [...tradingDaySet].sort();
  const daysWithTrade = tradingDays.filter((d) => (dayCounts.get(d) || 0) > 0);
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const net = nets.reduce((a, b) => a + b, 0);
  const gross = trades.reduce((a, t) => a + t.gross, 0);

  return {
    trades,
    tradingDays,
    daysWithTrade,
    dayCoveragePct: tradingDays.length
      ? Math.round((1000 * daysWithTrade.length) / tradingDays.length) / 10
      : 0,
    net: Math.round(net * 100) / 100,
    gross: Math.round(gross * 100) / 100,
    winRate: trades.length ? Math.round((1000 * wins.length) / trades.length) / 10 : 0,
    avgNet: trades.length ? Math.round((net / trades.length) * 100) / 100 : 0,
    avgWin: wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length
      ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100
      : 0,
    maxDd: Math.round(maxDd * 100) / 100,
    exitMix,
    params: p,
  };
}

function summarize(label: string, r: ReturnType<typeof runScalp>) {
  const near56 = r.trades.filter((t) => t.net >= 4.5 && t.net <= 6.5).length;
  return {
    label,
    trades: r.trades.length,
    tradingDays: r.tradingDays.length,
    daysWithTrade: r.daysWithTrade.length,
    dayCoveragePct: r.dayCoveragePct,
    winRate: r.winRate,
    gross: r.gross,
    net: r.net,
    avgNet: r.avgNet,
    avgWin: r.avgWin,
    avgLoss: r.avgLoss,
    maxDd: r.maxDd,
    exitMix: r.exitMix,
    hitsNear5to6Net: near56,
    costUsd: r.params.costUsd,
    targetGross: r.params.targetUsd,
    stopGross: r.params.stopUsd,
    session: r.params.sessionUtc,
    requireEdge: r.params.requireEdge,
    forceDaily: r.params.forceDailyIfMissed,
  };
}

async function main() {
  const [r5, r15] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '5m', 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, '15m', 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!r5.ok || !r5.candles.length) throw new Error(r5.error || '5m failed');
  if (!r15.ok || !r15.candles.length) throw new Error(r15.error || '15m failed');

  const combos: { label: string; params: ScalpParams }[] = [];

  // Fixed: max 1/day, cost $5, TP sized for ~$5-6 net => gross ~$10-11
  const bases: Array<Partial<ScalpParams> & { label: string }> = [
    { label: 'strict edge all-day TP11 SL11', targetUsd: 11, stopUsd: 11, requireEdge: true, forceDailyIfMissed: false, sessionUtc: null },
    { label: 'strict edge all-day TP11 SL8', targetUsd: 11, stopUsd: 8, requireEdge: true, forceDailyIfMissed: false, sessionUtc: null },
    { label: 'strict edge all-day TP10 SL10', targetUsd: 10, stopUsd: 10, requireEdge: true, forceDailyIfMissed: false, sessionUtc: null },
    { label: 'strict London UTC7-12 TP11 SL11', targetUsd: 11, stopUsd: 11, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [7, 12] },
    { label: 'strict NY UTC13-18 TP11 SL11', targetUsd: 11, stopUsd: 11, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    { label: 'strict NY UTC13-18 TP11 SL8', targetUsd: 11, stopUsd: 8, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    // Soft daily fill so most days get a trade
    { label: 'daily-fill all-day TP11 SL11', targetUsd: 11, stopUsd: 11, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 15, sessionUtc: null },
    { label: 'daily-fill NY TP11 SL11', targetUsd: 11, stopUsd: 11, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 16, sessionUtc: [13, 19] },
    { label: 'daily-fill NY TP11 SL8', targetUsd: 11, stopUsd: 8, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 16, sessionUtc: [13, 19] },
    { label: 'daily-fill London TP11 SL8', targetUsd: 11, stopUsd: 8, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 10, sessionUtc: [7, 13] },
    // Slightly larger target (still scalp-ish)
    { label: 'strict NY TP15 SL10', targetUsd: 15, stopUsd: 10, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    { label: 'daily-fill NY TP15 SL10', targetUsd: 15, stopUsd: 10, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 16, sessionUtc: [13, 19] },
    // Better R:R — wins larger than $5-6 but maybe net positive avg near that
    { label: 'strict NY TP20 SL8', targetUsd: 20, stopUsd: 8, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    { label: 'strict NY TP25 SL10', targetUsd: 25, stopUsd: 10, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    { label: 'strict NY TP30 SL12', targetUsd: 30, stopUsd: 12, requireEdge: true, forceDailyIfMissed: false, sessionUtc: [13, 18] },
    { label: 'daily NY TP20 SL8', targetUsd: 20, stopUsd: 8, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 16, sessionUtc: [13, 19] },
    { label: 'daily NY TP25 SL10', targetUsd: 25, stopUsd: 10, requireEdge: true, forceDailyIfMissed: true, forceAfterUtcHour: 16, sessionUtc: [13, 19] },
  ];

  const costs = [5, 2, 1];

  for (const b of bases) {
    for (const costUsd of costs) {
      // Only re-run expensive matrix for key labels at lower cost
      if (costUsd !== 5 && !b.label.includes('NY') && !b.label.includes('TP20') && !b.label.includes('TP25')) {
        continue;
      }
      combos.push({
        label: `${b.label} cost$${costUsd}`,
        params: {
          targetUsd: b.targetUsd!,
          stopUsd: b.stopUsd!,
          costUsd,
          maxTradesPerDay: 1,
          sessionUtc: b.sessionUtc ?? null,
          requireEdge: b.requireEdge ?? true,
          forceDailyIfMissed: b.forceDailyIfMissed ?? false,
          forceAfterUtcHour: b.forceAfterUtcHour ?? 16,
        },
      });
    }
  }

  const rows = combos.map((c) =>
    summarize(
      c.label,
      runScalp({ entry: r5.candles, htf: r15.candles, params: c.params })
    )
  );

  // Rank: prefer positive net, high day coverage, avgNet near 5-6
  const ranked = [...rows].sort((a, b) => {
    const score = (r: (typeof rows)[0]) =>
      (r.net > 0 ? 1000 : 0) +
      r.net +
      r.dayCoveragePct * 2 +
      (r.avgNet >= 4 && r.avgNet <= 8 ? 50 : 0) -
      r.maxDd;
    return score(b) - score(a);
  });

  console.log(
    JSON.stringify(
      {
        symbol: GOLD_YAHOO_SYMBOL,
        entryTf: '5m',
        htfTf: '15m',
        bars5m: r5.candles.length,
        bars15m: r15.candles.length,
        from: r5.candles[0]?.t,
        to: r5.candles[r5.candles.length - 1]?.t,
        note:
          'Max 1 trade/day. TP/SL fixed $. Cost $5. Soft daily-fill = if no edge by hour, take HTF-aligned bar once.',
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
