/**
 * GoldPulse backtest — Yahoo GC=F entry TF + HTF Sector 7 G (currently 15m + 30m).
 */

import type { Candle } from '@/lib/nejoic';
import { runUtBot } from '@/lib/nexus-pulse/ut-bot';
import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import {
  GOLD_PULSE_RULES,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_LABEL,
  GOLD_YAHOO_SYMBOL,
} from '@/lib/gold-pulse/rules';
import type { GoldExitReason, GoldSide } from '@/lib/gold-pulse/types';

export type GoldBacktestTrade = {
  id: number;
  side: GoldSide;
  openedAt: string;
  closedAt: string;
  entryPrice: number;
  exitPrice: number;
  exitReason: GoldExitReason;
  grossPnl: number;
  netPnl: number;
  mfe: number;
  mae: number;
  barsHeld: number;
};

export type GoldBacktestResult = {
  ok: true;
  symbol: string;
  entryTf: string;
  htfTf: string;
  barsEntry: number;
  barsHtf: number;
  from: string | null;
  to: string | null;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  exitMix: Record<string, number>;
  trades: GoldBacktestTrade[];
  note: string;
};

function signedMove(side: GoldSide, entry: number, px: number): number {
  return side === 'LONG' ? px - entry : entry - px;
}

function slDistance(entry: number): number {
  return Math.max(entry * GOLD_PULSE_RULES.defaultSlPct, GOLD_PULSE_RULES.minSlUsd);
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

export function runGoldPulseBacktest(opts: {
  candlesEntry: Candle[];
  candlesHtf: Candle[];
}): GoldBacktestResult {
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
  const trades: GoldBacktestTrade[] = [];
  let nextId = 1;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let lastExitMs = 0;
  const exitMix: Record<string, number> = {};

  const closeTrade = (
    o: Open,
    exitPrice: number,
    closedAt: string,
    reason: GoldExitReason,
    barIdx: number
  ) => {
    const move = signedMove(o.side, o.entry, exitPrice);
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

    const tMs = new Date(bar.t).getTime();
    const hi = htfIndexAt(htfTimes, tMs);
    const htfPos = (hi >= 0 ? utHtf[hi]?.pos : 0) as -1 | 0 | 1;

    if (open) {
      const moveHi = signedMove(open.side, open.entry, open.side === 'LONG' ? bar.high : bar.low);
      const moveLo = signedMove(open.side, open.entry, open.side === 'LONG' ? bar.low : bar.high);
      open.mfe = Math.max(open.mfe, moveHi, moveLo);
      open.mae = Math.max(open.mae, -Math.min(moveHi, moveLo));

      if (open.side === 'LONG' && bar.low <= open.stop) {
        closeTrade(open, open.stop, bar.t, 'SL', i);
      } else if (open.side === 'SHORT' && bar.high >= open.stop) {
        closeTrade(open, open.stop, bar.t, 'SL', i);
      } else if (open.side === 'LONG' && htfPos === -1) {
        closeTrade(open, bar.close, bar.t, 'UT_HTF', i);
      } else if (open.side === 'SHORT' && htfPos === 1) {
        closeTrade(open, bar.close, bar.t, 'UT_HTF', i);
      } else {
        const entryAgainst =
          (open.side === 'LONG' && u.pos === -1) || (open.side === 'SHORT' && u.pos === 1);
        const htfAgainst =
          (open.side === 'LONG' && htfPos === -1) || (open.side === 'SHORT' && htfPos === 1);
        if (
          entryAgainst &&
          (!GOLD_PULSE_RULES.entryFlipNeedsHtfAgainst || htfAgainst)
        ) {
          closeTrade(open, bar.close, bar.t, 'UT_ENTRY', i);
        } else {
          const move = signedMove(open.side, open.entry, bar.close);
          if (
            open.mfe >= GOLD_PULSE_RULES.trailMfeTrigger &&
            move < GOLD_PULSE_RULES.trailKeepFrac * open.mfe
          ) {
            closeTrade(open, bar.close, bar.t, 'TRAIL', i);
          }
        }
      }
    }

    if (!open && prev) {
      const buyEdge = u.buy && !prev.buy;
      const sellEdge = u.sell && !prev.sell;
      let side: GoldSide | null = null;
      if (buyEdge && htfPos === 1) side = 'LONG';
      if (sellEdge && htfPos === -1) side = 'SHORT';

      const cooldownOk =
        !lastExitMs || tMs - lastExitMs >= GOLD_PULSE_RULES.reentryCooldownMs;

      if (side && cooldownOk) {
        const entry = bar.close;
        const dist = slDistance(entry);
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
      }
    }
  }

  if (open && cEntry.length) {
    const last = cEntry[cEntry.length - 1];
    closeTrade(open, last.close, last.t, 'EOD', cEntry.length - 1);
  }

  const nets = trades.map((t) => t.netPnl);
  const wins = nets.filter((n) => n >= 0);
  const losses = nets.filter((n) => n < 0);
  const gross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const net = trades.reduce((s, t) => s + t.netPnl, 0);

  return {
    ok: true,
    symbol: GOLD_YAHOO_SYMBOL,
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
    note: `Yahoo ${GOLD_YAHOO_SYMBOL}: UT ${GOLD_UT_ENTRY.tf}+${GOLD_UT_HTF.tf}. Trail≥$${GOLD_PULSE_RULES.trailMfeTrigger}, cooldown ${GOLD_PULSE_RULES.reentryCooldownMs / 60000}m, 15m-flip only if 30m against. Cost $${GOLD_PULSE_RULES.roundTripCostUsd}/trade.`,
  };
}

export async function fetchAndRunGoldPulseBacktest(): Promise<
  GoldBacktestResult | { ok: false; error: string }
> {
  const [rEntry, rHtf] = await Promise.all([
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, GOLD_UT_ENTRY.tf, 0, GOLD_YAHOO_LABEL, '1mo'),
    fetchYahooCandles(GOLD_YAHOO_SYMBOL, GOLD_UT_HTF.tf, 0, GOLD_YAHOO_LABEL, '1mo'),
  ]);
  if (!rEntry.ok || !rEntry.candles.length) {
    return { ok: false, error: rEntry.error || `Yahoo ${GOLD_UT_ENTRY.tf} failed` };
  }
  if (!rHtf.ok || !rHtf.candles.length) {
    return { ok: false, error: rHtf.error || `Yahoo ${GOLD_UT_HTF.tf} failed` };
  }
  return runGoldPulseBacktest({ candlesEntry: rEntry.candles, candlesHtf: rHtf.candles });
}
