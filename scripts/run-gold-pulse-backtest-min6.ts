/**
 * GoldPulse day-cap tests: max 6/day, and "aim for min 6/day".
 * Run: npx tsx scripts/run-gold-pulse-backtest-min6.ts
 */

import type { Candle } from '../src/lib/nejoic';
import { runUtBot } from '../src/lib/nexus-pulse/ut-bot';
import {
  GOLD_PULSE_RULES,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
} from '../src/lib/gold-pulse/rules';
import type { GoldExitReason, GoldSide } from '../src/lib/gold-pulse/types';
import {
  fetchGoldPulseCandles,
  runGoldPulseBacktest,
  type GoldBacktestResult,
} from '../src/lib/gold-pulse/backtest';

function slim(r: GoldBacktestResult, label: string) {
  return {
    label,
    maxTradesPerDay: r.params.maxTradesPerDay || 'unlimited',
    tradeCount: r.tradeCount,
    wins: r.wins,
    losses: r.losses,
    winRate: r.winRate,
    grossPnl: r.grossPnl,
    netPnl: r.netPnl,
    avgWin: r.avgWin,
    avgLoss: r.avgLoss,
    maxDrawdown: r.maxDrawdown,
    tradingDays: r.tradingDays,
    daysWithTrade: r.daysWithTrade,
    dayCoveragePct: r.dayCoveragePct,
    avgTradesPerActiveDay:
      r.daysWithTrade > 0
        ? Math.round((10 * r.tradeCount) / r.daysWithTrade) / 10
        : 0,
    exitMix: r.exitMix,
  };
}

/** Force up to `targetPerDay` entries/day by using shorter cooldown + pos-align entries. */
function runMinTradesPerDay(opts: {
  candlesEntry: Candle[];
  candlesHtf: Candle[];
  targetPerDay: number;
  cooldownMs: number;
}): GoldBacktestResult & { daysHitTarget: number; daysHitTargetPct: number } {
  const cEntry = [...opts.candlesEntry].sort((a, b) => a.t.localeCompare(b.t));
  const cHtf = [...opts.candlesHtf].sort((a, b) => a.t.localeCompare(b.t));
  const utEntry = runUtBot(cEntry, {
    keyValue: GOLD_UT_ENTRY.keyValue,
    atrPeriod: GOLD_UT_ENTRY.atrPeriod,
  });
  const utHtf = runUtBot(cHtf, {
    keyValue: GOLD_UT_HTF.keyValue,
    atrPeriod: GOLD_UT_HTF.atrPeriod,
  });
  const htfTimes = cHtf.map((c) => new Date(c.t).getTime());
  const warm = Math.max(GOLD_UT_ENTRY.atrPeriod, GOLD_UT_HTF.atrPeriod) + 5;

  const htfIndexAt = (tMs: number) => {
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
  };

  const signed = (side: GoldSide, entry: number, px: number) =>
    side === 'LONG' ? px - entry : entry - px;

  type Open = {
    id: number;
    side: GoldSide;
    openedAt: string;
    entry: number;
    stop: number;
    mfe: number;
    mae: number;
    openBar: number;
  };

  let open: Open | null = null;
  const trades: GoldBacktestResult['trades'] = [];
  let nextId = 1;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let lastExitMs = 0;
  const exitMix: Record<string, number> = {};
  const dayCounts = new Map<string, number>();
  const tradingDays = new Set<string>();
  const dayKey = (iso: string) => iso.slice(0, 10);
  const slDist = (entry: number) =>
    Math.max(entry * GOLD_PULSE_RULES.defaultSlPct, GOLD_PULSE_RULES.minSlUsd);

  const close = (
    o: Open,
    exitPrice: number,
    closedAt: string,
    reason: GoldExitReason,
    barIdx: number
  ) => {
    const move = signed(o.side, o.entry, exitPrice);
    const gross = move * GOLD_PULSE_RULES.qty * GOLD_PULSE_RULES.pointValue;
    const net = gross - GOLD_PULSE_RULES.roundTripCostUsd;
    trades.push({
      id: o.id,
      side: o.side,
      openedAt: o.openedAt,
      closedAt,
      entryPrice: o.entry,
      exitPrice,
      exitReason: reason,
      grossPnl: Math.round(gross * 100) / 100,
      netPnl: Math.round(net * 100) / 100,
      mfe: Math.round(o.mfe * 100) / 100,
      mae: Math.round(o.mae * 100) / 100,
      barsHeld: Math.max(1, barIdx - o.openBar),
    });
    exitMix[reason] = (exitMix[reason] || 0) + 1;
    equity += net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    lastExitMs = new Date(closedAt).getTime();
    open = null;
  };

  for (let i = warm; i < cEntry.length; i++) {
    const bar = cEntry[i];
    const u = utEntry[i];
    const prev = utEntry[i - 1];
    if (!u) continue;
    const day = dayKey(bar.t);
    tradingDays.add(day);
    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(tMs);
    const htfPos = (hi >= 0 ? utHtf[hi]?.pos : 0) as -1 | 0 | 1;

    if (open) {
      const moveHi = signed(open.side, open.entry, open.side === 'LONG' ? bar.high : bar.low);
      const moveLo = signed(open.side, open.entry, open.side === 'LONG' ? bar.low : bar.high);
      open.mfe = Math.max(open.mfe, moveHi, moveLo);
      open.mae = Math.max(open.mae, -Math.min(moveHi, moveLo));

      if (open.side === 'LONG' && bar.low <= open.stop) close(open, open.stop, bar.t, 'SL', i);
      else if (open.side === 'SHORT' && bar.high >= open.stop) close(open, open.stop, bar.t, 'SL', i);
      else if (open.side === 'LONG' && htfPos === -1) close(open, bar.close, bar.t, 'UT_HTF', i);
      else if (open.side === 'SHORT' && htfPos === 1) close(open, bar.close, bar.t, 'UT_HTF', i);
    }

    if (!open && prev) {
      const count = dayCounts.get(day) || 0;
      if (count >= opts.targetPerDay) continue;

      const cooldownOk = !lastExitMs || tMs - lastExitMs >= opts.cooldownMs;
      if (!cooldownOk) continue;

      // Prefer new edge; if behind on daily quota, allow pos-align (still need HTF agree)
      const buyEdge = u.buy && !prev.buy;
      const sellEdge = u.sell && !prev.sell;
      const needFill = count < opts.targetPerDay;
      let side: GoldSide | null = null;
      if (buyEdge && htfPos === 1) side = 'LONG';
      else if (sellEdge && htfPos === -1) side = 'SHORT';
      else if (needFill && u.pos === 1 && htfPos === 1) side = 'LONG';
      else if (needFill && u.pos === -1 && htfPos === -1) side = 'SHORT';

      if (!side) continue;

      const entry = bar.close;
      const dist = slDist(entry);
      open = {
        id: nextId++,
        side,
        openedAt: bar.t,
        entry,
        stop: side === 'LONG' ? entry - dist : entry + dist,
        mfe: 0,
        mae: 0,
        openBar: i,
      };
      dayCounts.set(day, count + 1);
    }
  }

  if (open && cEntry.length) {
    const last = cEntry[cEntry.length - 1];
    close(open, last.close, last.t, 'EOD', cEntry.length - 1);
  }

  const nets = trades.map((t) => t.netPnl);
  const wins = nets.filter((n) => n >= 0);
  const losses = nets.filter((n) => n < 0);
  const gross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const daysWithTrade = [...dayCounts.values()].filter((n) => n > 0).length;
  const daysHitTarget = [...dayCounts.values()].filter((n) => n >= opts.targetPerDay).length;
  const td = tradingDays.size;

  return {
    ok: true,
    symbol: 'GC=F',
    entryTf: GOLD_UT_ENTRY.tf,
    htfTf: GOLD_UT_HTF.tf,
    barsEntry: cEntry.length,
    barsHtf: cHtf.length,
    from: cEntry[0]?.t ?? null,
    to: cEntry[cEntry.length - 1]?.t ?? null,
    tradeCount: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? Math.round((1000 * wins.length) / trades.length) / 10 : 0,
    grossPnl: Math.round(gross * 100) / 100,
    netPnl: Math.round(net * 100) / 100,
    avgWin: wins.length ? Math.round((wins.reduce((a, b) => a + b, 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length
      ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 100) / 100
      : 0,
    maxDrawdown: Math.round(maxDd * 100) / 100,
    exitMix,
    trades,
    note: `Aim min ${opts.targetPerDay}/day, cooldown ${opts.cooldownMs / 60000}m, soft pos-align fills.`,
    params: {
      ...GOLD_PULSE_RULES,
      trailMfeTrigger: GOLD_PULSE_RULES.trailMfeTrigger,
      trailKeepFrac: GOLD_PULSE_RULES.trailKeepFrac,
      reentryCooldownMs: opts.cooldownMs,
      entryFlipNeedsHtfAgainst: GOLD_PULSE_RULES.entryFlipNeedsHtfAgainst,
      disableEntryFlipExit: GOLD_PULSE_RULES.disableEntryFlipExit,
      defaultSlPct: GOLD_PULSE_RULES.defaultSlPct,
      minSlUsd: GOLD_PULSE_RULES.minSlUsd,
      roundTripCostUsd: GOLD_PULSE_RULES.roundTripCostUsd,
      requireHtfStable: GOLD_PULSE_RULES.requireHtfStable,
      minEntryRangeUsd: GOLD_PULSE_RULES.minEntryRangeUsd,
      entryRangeLookback: GOLD_PULSE_RULES.entryRangeLookback,
      sideMode: GOLD_PULSE_RULES.sideMode,
      useTrail: GOLD_PULSE_RULES.useTrail,
      maxTradesPerDay: opts.targetPerDay,
    },
    tradingDays: td,
    daysWithTrade,
    dayCoveragePct: td ? Math.round((1000 * daysWithTrade) / td) / 10 : 0,
    daysHitTarget,
    daysHitTargetPct: td ? Math.round((1000 * daysHitTarget) / td) / 10 : 0,
  };
}

async function main() {
  const data = await fetchGoldPulseCandles();
  if (!data.ok) {
    console.error(data);
    process.exit(1);
  }

  const unlimited = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
  });
  const max6 = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params: { maxTradesPerDay: 6 },
  });
  const min6_15m = runMinTradesPerDay({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    targetPerDay: 6,
    cooldownMs: 15 * 60 * 1000,
  });
  const min6_30m = runMinTradesPerDay({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    targetPerDay: 6,
    cooldownMs: 30 * 60 * 1000,
  });
  const min6_45m = runMinTradesPerDay({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    targetPerDay: 6,
    cooldownMs: 45 * 60 * 1000,
  });

  const extra = (r: ReturnType<typeof runMinTradesPerDay>) => ({
    ...slim(r, r.note),
    daysHitMin6: r.daysHitTarget,
    daysHitMin6Pct: r.daysHitTargetPct,
  });

  console.log(
    JSON.stringify(
      {
        setup: '15m + 30m Sector 7 G',
        from: unlimited.from,
        to: unlimited.to,
        compare: [
          slim(unlimited, 'v6 unlimited (90m cooldown)'),
          slim(max6, 'v6 max 6/day (90m cooldown)'),
          extra(min6_45m),
          extra(min6_30m),
          extra(min6_15m),
        ],
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
