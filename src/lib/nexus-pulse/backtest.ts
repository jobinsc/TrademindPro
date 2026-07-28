import { fetchUpstoxIntradayCandles, fetchUpstoxNifty1mRange } from '@/lib/upstox-historical';
import { evaluateUtV2Entry } from '@/lib/nexus-pulse/signals';
import { resampleMinutes } from '@/lib/nexus-pulse/resample';
import { laneEntryAllowed, laneForceFlatAt, shouldSquareOffAll } from '@/lib/nexus-pulse/lanes';
import { openNexusPaperTrade, updateOpenTrades } from '@/lib/nexus-pulse/paper-broker';
import { modelEntryPremium, premiumStep, roundStrike } from '@/lib/option-sim';
import { NEXUS_PULSE_RULES, type NexusLaneId } from '@/lib/nexus-pulse/rules';
import { istDate } from '@/lib/pinax-forge/ist';
import type { Candle } from '@/lib/nejoic';
import type { NexusPaperTrade } from '@/lib/nexus-pulse/types';

export type NexusBacktestRun = {
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  days: number;
  trades: NexusPaperTrade[];
  note: string;
};

function pickSimStrikeAndPremium(spot: number, side: 'CE' | 'PE'): {
  strike: number;
  premium: number;
} {
  let strike = roundStrike(spot);
  let premium = modelEntryPremium(spot, strike, side, null);
  let guard = 0;
  while (premium < 50 && guard < 20) {
    strike += side === 'CE' ? -50 : 50;
    premium = modelEntryPremium(spot, strike, side, null);
    guard += 1;
  }
  return { strike, premium };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runNexusPulseBacktest(opts: {
  accessToken: string;
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
}): Promise<NexusBacktestRun> {
  const today = istDate();
  const wantsToday = opts.toDate >= today;
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const histTo = wantsToday ? (opts.fromDate < today ? yesterday : '') : opts.toDate;

  let merged: Candle[] = [];
  if (histTo && opts.fromDate <= histTo) {
    const hist = await fetchUpstoxNifty1mRange({
      accessToken: opts.accessToken,
      fromDate: opts.fromDate,
      toDate: histTo,
    });
    if (!hist.ok && hist.candles.length === 0) {
      throw new Error(hist.error || 'No historical candles for backtest');
    }
    merged.push(...hist.candles);
  }
  if (wantsToday) {
    const intra = await fetchUpstoxIntradayCandles({
      accessToken: opts.accessToken,
      unit: 'minutes',
      interval: 1,
    });
    if (intra.ok && intra.candles.length) {
      merged.push(...intra.candles);
    }
  }
  const candles = [...new Map(merged.map((c) => [c.t, c])).values()]
    .sort((a, b) => a.t.localeCompare(b.t))
    .filter((c) => c.t.slice(0, 10) >= opts.fromDate && c.t.slice(0, 10) <= opts.toDate);
  if (!candles.length) {
    throw new Error('No one-minute bars returned for the selected dates');
  }
  let openTrades: NexusPaperTrade[] = [];
  const closedTrades: NexusPaperTrade[] = [];

  for (let i = 80; i < candles.length; i++) {
    const bar = candles[i];
    const now = new Date(bar.t);
    const prefix: Candle[] = candles.slice(0, i + 1);
    const prevSpot = candles[i - 1]?.close ?? bar.close;
    const spot = bar.close;
    const candles3m = resampleMinutes(prefix, 3);
    const candles5m = resampleMinutes(prefix, 5);
    const { decision, ut3m, ut5m } = evaluateUtV2Entry({
      candles3m,
      candles5m,
      now,
    });

    const ltpMap = new Map<string, number>();
    for (const t of openTrades) {
      const mark = premiumStep(t.markPremium ?? t.entryPremium, prevSpot, spot, t.strike, t.side);
      ltpMap.set(t.instrumentKey, mark);
    }

    const ut3mSellEdge = Boolean(
      ut3m.last && ut3m.prev && ut3m.last.t !== ut3m.prev.t && ut3m.last.sell && !ut3m.prev.sell
    );
    const ut3mBuyEdge = Boolean(
      ut3m.last && ut3m.prev && ut3m.last.t !== ut3m.prev.t && ut3m.last.buy && !ut3m.prev.buy
    );

    const { stillOpen, closed } = updateOpenTrades(openTrades, ltpMap, {
      ut3mSellEdge,
      ut3mBuyEdge,
      pos5m: (ut5m.last?.pos ?? 0) as -1 | 0 | 1,
      forceFlat: laneForceFlatAt('morning_open_stop_15', now),
      squareOff: shouldSquareOffAll(now),
    });
    openTrades = stillOpen;
    for (const t of closed) closedTrades.push({ ...t, closedAt: bar.t });

    if (decision.side !== 'FLAT' && decision.new3mEdge) {
      const allowedLanes = opts.activeLanes.filter((laneId) => {
        if (openTrades.some((t) => t.laneId === laneId && t.status === 'open')) return false;
        return laneEntryAllowed(laneId, now).ok;
      });
      if (allowedLanes.length) {
        const sim = pickSimStrikeAndPremium(spot, decision.side);
        for (const laneId of allowedLanes) {
          const trade = openNexusPaperTrade({
            laneId,
            side: decision.side,
            instrumentKey: `SIM|${decision.side}|${sim.strike}`,
            tradingSymbol: `SIM NIFTY ${sim.strike} ${decision.side}`,
            strike: sim.strike,
            expiry: bar.t.slice(0, 10),
            entryPremium: sim.premium,
            entrySpot: spot,
            lotSize: NEXUS_PULSE_RULES.niftyLotSize,
          });
          openTrades.push({
            ...trade,
            openedAt: bar.t,
            markPremium: sim.premium,
          });
        }
      }
    }
  }

  if (openTrades.length && candles.length) {
    const lastBar = candles[candles.length - 1];
    const prevSpot = candles[candles.length - 2]?.close ?? lastBar.close;
    const ltpMap = new Map<string, number>();
    for (const t of openTrades) {
      ltpMap.set(
        t.instrumentKey,
        premiumStep(t.markPremium ?? t.entryPremium, prevSpot, lastBar.close, t.strike, t.side)
      );
    }
    const { closed } = updateOpenTrades(openTrades, ltpMap, {
      squareOff: true,
    });
    for (const t of closed) closedTrades.push({ ...t, closedAt: lastBar.t });
  }

  const wins = closedTrades.filter((t) => (t.netPnl ?? 0) > 0).length;
  const losses = closedTrades.filter((t) => (t.netPnl ?? 0) <= 0).length;
  const netPnl = round2(closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const grossPnl = round2(closedTrades.reduce((s, t) => s + (t.grossPnl ?? 0), 0));
  const daySet = new Set(closedTrades.map((t) => String(t.openedAt || '').slice(0, 10)).filter(Boolean));

  return {
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    activeLanes: opts.activeLanes,
    totalTrades: closedTrades.length,
    wins,
    losses,
    winRate: closedTrades.length ? Math.round((wins * 1000) / closedTrades.length) / 10 : 0,
    netPnl,
    grossPnl,
    days: daySet.size,
    trades: closedTrades.slice(-40),
    note: 'Uses historical Nifty 1m candles with simulated option premiums; useful for replay/audit, not exact historical option-chain fills.',
  };
}
