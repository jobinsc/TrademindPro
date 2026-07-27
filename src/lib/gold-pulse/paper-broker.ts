import { GOLD_PULSE_RULES } from '@/lib/gold-pulse/rules';
import type { GoldExitReason, GoldPaperTrade, GoldSide } from '@/lib/gold-pulse/types';

function uid(): string {
  return `gp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function signedMove(side: GoldSide, entry: number, mark: number): number {
  return side === 'LONG' ? mark - entry : entry - mark;
}

export function openGoldPaperTrade(opts: {
  side: GoldSide;
  price: number;
  symbol: string;
}): GoldPaperTrade {
  const { pointValue, defaultSlPct, minSlUsd, qty } = GOLD_PULSE_RULES;
  const slDist = Math.max(opts.price * defaultSlPct, minSlUsd);
  const stopLoss =
    opts.side === 'LONG' ? opts.price - slDist : opts.price + slDist;

  return {
    id: uid(),
    openedAt: new Date().toISOString(),
    status: 'open',
    side: opts.side,
    symbol: opts.symbol,
    qty,
    entryPrice: opts.price,
    stopLoss,
    markPrice: opts.price,
    highPrice: opts.price,
    lowPrice: opts.price,
    maxFavorableUsd: 0,
    maxAdverseUsd: 0,
  };
}

export function closeGoldTrade(
  t: GoldPaperTrade,
  exitPrice: number,
  reason: GoldExitReason
): GoldPaperTrade {
  const move = signedMove(t.side, t.entryPrice, exitPrice);
  const gross = move * t.qty * GOLD_PULSE_RULES.pointValue;
  const net = gross - GOLD_PULSE_RULES.roundTripCostUsd;
  return {
    ...t,
    status: 'closed',
    closedAt: new Date().toISOString(),
    exitPrice,
    exitReason: reason,
    markPrice: exitPrice,
    grossPnl: Math.round(gross * 100) / 100,
    netPnl: Math.round(net * 100) / 100,
  };
}

export function updateOpenGoldTrades(
  open: GoldPaperTrade[],
  spot: number,
  opts: {
    entryPos: -1 | 0 | 1;
    htfPos: -1 | 0 | 1;
  }
): { open: GoldPaperTrade[]; closed: GoldPaperTrade[] } {
  const still: GoldPaperTrade[] = [];
  const closed: GoldPaperTrade[] = [];
  const { trailMfeTrigger, trailKeepFrac } = GOLD_PULSE_RULES;

  for (const t of open) {
    const high = Math.max(t.highPrice, spot);
    const low = Math.min(t.lowPrice, spot);
    const move = signedMove(t.side, t.entryPrice, spot);
    const mfe = Math.max(t.maxFavorableUsd, move);
    const mae = Math.max(t.maxAdverseUsd, -move);
    const marked: GoldPaperTrade = {
      ...t,
      markPrice: spot,
      highPrice: high,
      lowPrice: low,
      maxFavorableUsd: Math.round(mfe * 100) / 100,
      maxAdverseUsd: Math.round(mae * 100) / 100,
    };

    // Stop
    if (marked.side === 'LONG' && spot <= marked.stopLoss) {
      closed.push(closeGoldTrade(marked, spot, 'SL'));
      continue;
    }
    if (marked.side === 'SHORT' && spot >= marked.stopLoss) {
      closed.push(closeGoldTrade(marked, spot, 'SL'));
      continue;
    }

    // Sector 7 G — HTF UT against position
    if (marked.side === 'LONG' && opts.htfPos === -1) {
      closed.push(closeGoldTrade(marked, spot, 'UT_HTF'));
      continue;
    }
    if (marked.side === 'SHORT' && opts.htfPos === 1) {
      closed.push(closeGoldTrade(marked, spot, 'UT_HTF'));
      continue;
    }

    // Entry TF flip — only if HTF also against (improved rule)
    const entryAgainst =
      (marked.side === 'LONG' && opts.entryPos === -1) ||
      (marked.side === 'SHORT' && opts.entryPos === 1);
    const htfAgainst =
      (marked.side === 'LONG' && opts.htfPos === -1) ||
      (marked.side === 'SHORT' && opts.htfPos === 1);
    if (
      entryAgainst &&
      (!GOLD_PULSE_RULES.entryFlipNeedsHtfAgainst || htfAgainst)
    ) {
      closed.push(closeGoldTrade(marked, spot, 'UT_ENTRY'));
      continue;
    }

    // Trail
    if (mfe >= trailMfeTrigger) {
      const openProfit = move;
      if (openProfit < trailKeepFrac * mfe) {
        closed.push(closeGoldTrade(marked, spot, 'TRAIL'));
        continue;
      }
    }

    still.push(marked);
  }

  return { open: still, closed };
}
