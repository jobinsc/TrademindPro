import { NEXUS_PULSE_RULES } from '@/lib/nexus-pulse/rules';
import type { NexusPaperTrade } from '@/lib/nexus-pulse/types';

function uid(): string {
  return `nx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function defaultStopLoss(entryPremium: number): number {
  const sl = Math.max(
    NEXUS_PULSE_RULES.minSlPremiumPts,
    Math.round(entryPremium * NEXUS_PULSE_RULES.defaultSlPct * 100) / 100
  );
  return round2(entryPremium - sl);
}

export function openNexusPaperTrade(opts: {
  laneId: NexusPaperTrade['laneId'];
  side: 'CE' | 'PE';
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry?: string;
  entryPremium: number;
  entrySpot: number;
  lotSize?: number;
}): NexusPaperTrade {
  const lotSize = opts.lotSize ?? NEXUS_PULSE_RULES.niftyLotSize;
  const sl = defaultStopLoss(opts.entryPremium);
  return {
    id: uid(),
    laneId: opts.laneId,
    openedAt: new Date().toISOString(),
    status: 'open',
    side: opts.side,
    instrumentKey: opts.instrumentKey,
    tradingSymbol: opts.tradingSymbol,
    strike: opts.strike,
    expiry: opts.expiry,
    qty: NEXUS_PULSE_RULES.lotSize,
    lotSize,
    entryPremium: round2(opts.entryPremium),
    entrySpot: opts.entrySpot,
    stopLossPremium: sl,
    markPremium: round2(opts.entryPremium),
    highPremium: round2(opts.entryPremium),
    lowPremium: round2(opts.entryPremium),
    maxFavorablePts: 0,
    maxAdversePts: 0,
  };
}

function applyExcursion(trade: NexusPaperTrade, mark: number): NexusPaperTrade {
  const fav = Math.max(0, mark - trade.entryPremium);
  const adv = Math.max(0, trade.entryPremium - mark);
  const high = Math.max(trade.highPremium ?? trade.entryPremium, mark);
  const low = Math.min(trade.lowPremium ?? trade.entryPremium, mark);
  return {
    ...trade,
    markPremium: round2(mark),
    highPremium: round2(high),
    lowPremium: round2(low),
    maxFavorablePts: round2(Math.max(trade.maxFavorablePts, fav)),
    maxAdversePts: round2(Math.max(trade.maxAdversePts, adv)),
  };
}

/** Trail giveback per Nexus handoff (premium pts on option). */
export function shouldTrailExit(trade: NexusPaperTrade, mark: number): boolean {
  const mfe = trade.maxFavorablePts;
  if (mfe < NEXUS_PULSE_RULES.trailMfeTriggerPts) return false;
  const openUp = mark - trade.entryPremium;
  const keepMin = mfe * NEXUS_PULSE_RULES.trailKeepFrac;
  return openUp < keepMin;
}

export function closeNexusTrade(
  trade: NexusPaperTrade,
  exitPremium: number,
  exitReason: NexusPaperTrade['exitReason']
): NexusPaperTrade {
  const marked = applyExcursion(trade, exitPremium);
  const gross =
    (exitPremium - marked.entryPremium) * marked.qty * marked.lotSize;
  const net = gross - NEXUS_PULSE_RULES.roundTripCostInr;
  return {
    ...marked,
    status: 'closed',
    closedAt: new Date().toISOString(),
    exitPremium: round2(exitPremium),
    exitReason,
    grossPnl: round2(gross),
    netPnl: round2(net),
  };
}

export function updateOpenTrades(
  open: NexusPaperTrade[],
  ltpByKey: Map<string, number>,
  opts: {
    /** Opposite 3m UT signal on a new closed 3m bar (matches BOTS real-option study). */
    ut3mSellEdge?: boolean;
    ut3mBuyEdge?: boolean;
    pos5m?: -1 | 0 | 1;
    forceFlat?: boolean;
    squareOff?: boolean;
    /**
     * When false: only SQ / Lane-B time exits (and optional SL).
     * Trail + UT wait for a new closed 1m option print — same as real-option study.
     */
    studyExitsEnabled?: boolean;
  }
): { stillOpen: NexusPaperTrade[]; closed: NexusPaperTrade[] } {
  const stillOpen: NexusPaperTrade[] = [];
  const closed: NexusPaperTrade[] = [];
  const studyExits = opts.studyExitsEnabled !== false;

  for (const t of open) {
    const ltp = ltpByKey.get(t.instrumentKey);
    if (ltp == null) {
      stillOpen.push(t);
      continue;
    }
    let marked = studyExits ? applyExcursion(t, ltp) : { ...t, markPremium: round2(ltp) };

    if (opts.squareOff) {
      closed.push(closeNexusTrade(marked, ltp, 'SQ'));
      continue;
    }
    if (opts.forceFlat && marked.laneId === 'morning_open_stop_15') {
      closed.push(closeNexusTrade(marked, ltp, 'LANE_B_15'));
      continue;
    }
    if (NEXUS_PULSE_RULES.mandatoryStopLoss && ltp <= marked.stopLossPremium) {
      closed.push(closeNexusTrade(marked, Math.max(ltp, marked.stopLossPremium - 0.5), 'SL'));
      continue;
    }
    if (!studyExits) {
      stillOpen.push(marked);
      continue;
    }
    if (shouldTrailExit(marked, ltp)) {
      closed.push(closeNexusTrade(marked, ltp, 'TRAIL'));
      continue;
    }
    if (marked.side === 'CE' && opts.ut3mSellEdge) {
      closed.push(closeNexusTrade(marked, ltp, 'UT_3M'));
      continue;
    }
    if (marked.side === 'PE' && opts.ut3mBuyEdge) {
      closed.push(closeNexusTrade(marked, ltp, 'UT_3M'));
      continue;
    }
    if (marked.side === 'CE' && opts.pos5m === -1) {
      closed.push(closeNexusTrade(marked, ltp, 'UT_5M'));
      continue;
    }
    if (marked.side === 'PE' && opts.pos5m === 1) {
      closed.push(closeNexusTrade(marked, ltp, 'UT_5M'));
      continue;
    }

    stillOpen.push(marked);
  }

  return { stillOpen, closed };
}
