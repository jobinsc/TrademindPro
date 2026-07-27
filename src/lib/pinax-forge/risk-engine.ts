/**
 * PinaxForge risk engine — hard rules for paper phase.
 */

import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import { isBeforeEntryCutoff, isSessionOpen } from '@/lib/pinax-forge/ist';
import type { PinaxPaperTrade, PinaxSetupSignal } from '@/lib/pinax-forge/types';

export type RiskCheckResult = {
  allowed: boolean;
  reason: string;
};

export function hasOpenPaperTrade(openTrades: PinaxPaperTrade[]): boolean {
  return openTrades.some((t) => t.status === 'open');
}

export function checkEntryRisk(opts: {
  now?: Date;
  openTrades: PinaxPaperTrade[];
  closedTrades?: PinaxPaperTrade[];
  signal: PinaxSetupSignal;
  hasOption: boolean;
  hasStopLoss: boolean;
}): RiskCheckResult {
  if (!PINAX_FORGE_RULES.liveOrdersAllowed && !PINAX_FORGE_RULES.observationOnly) {
    return { allowed: false, reason: 'Live orders blocked — paper only' };
  }

  if (!isSessionOpen(PINAX_FORGE_RULES.sessionEntryOpenIst, opts.now)) {
    return {
      allowed: false,
      reason: `Market not open — no ENTRY before ${PINAX_FORGE_RULES.sessionEntryOpenIst} IST`,
    };
  }

  if (!isBeforeEntryCutoff(PINAX_FORGE_RULES.sessionEntryCutoffIst, opts.now)) {
    return {
      allowed: false,
      reason: `Entry cutoff ${PINAX_FORGE_RULES.sessionEntryCutoffIst} IST passed`,
    };
  }

  // Analysis may keep running in background; only the open position blocks a new fill.
  if (PINAX_FORGE_RULES.onePositionAtATime && hasOpenPaperTrade(opts.openTrades)) {
    return {
      allowed: false,
      reason: 'Position open — analysis continues; flip closes first on opposite TAKE, then entry',
    };
  }

  const maxDay = PINAX_FORGE_RULES.maxTradesPerDay;
  if (maxDay != null) {
    const done = (opts.closedTrades?.length ?? 0) + opts.openTrades.filter((t) => t.status === 'open').length;
    if (done >= maxDay) {
      return {
        allowed: false,
        reason: `Daily trade cap ${maxDay} reached — quality over quantity (pro desk)`,
      };
    }
  }

  if (opts.signal.decision !== 'TAKE') {
    return {
      allowed: false,
      reason: opts.signal.skipReason || 'Setup marked SKIP by engine',
    };
  }

  if (opts.signal.confidence < 70) {
    return { allowed: false, reason: 'Confidence below 70 — wait for cleaner setup' };
  }

  if (!opts.hasOption) {
    return {
      allowed: false,
      reason: 'No front-week option quote — Upstox chain/LTP unavailable',
    };
  }

  if (PINAX_FORGE_RULES.mandatoryStopLoss && !opts.hasStopLoss) {
    return { allowed: false, reason: 'Mandatory stop-loss not set' };
  }

  return { allowed: true, reason: 'Analysis + risk OK — paper entry allowed' };
}

/** Default SL = 20% of entry premium (options), min ₹8 */
export function defaultStopLossPremium(entryPremium: number): number {
  const sl = Math.max(8, Math.round(entryPremium * 0.2 * 100) / 100);
  return Math.round((entryPremium - sl) * 100) / 100;
}

export function buildTargetPremiums(
  entryPremium: number,
  stopLossPremium: number
): { rr: number; price: number }[] {
  const risk = entryPremium - stopLossPremium;
  if (risk <= 0) return [];
  return PINAX_FORGE_RULES.trackRrMultiples.map((rr) => ({
    rr,
    price: Math.round((entryPremium + risk * rr) * 100) / 100,
  }));
}

export function paperLotQty(): number {
  return PINAX_FORGE_RULES.lotSize;
}
