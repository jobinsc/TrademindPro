/**
 * Shared paper-trade exit helpers — premium-point SL / target / trailing.
 */

export type PaperExitPoints = {
  stopLossPoints: number;
  targetPoints: number;
  trailingStopPoints?: number;
  trailingActivatePoints?: number;
};

export type PaperExitReason = 'target' | 'stop' | 'trailing';

export type PaperExitResult = {
  shouldClose: boolean;
  reason?: PaperExitReason;
  exitPremium?: number;
};

export function roundPremium(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed: string): number {
  const x = Math.sin(hashSeed(seed)) * 10000;
  return x - Math.floor(x);
}

/** Deterministic premium walk for paper mode when live LTP is unavailable. */
export function simulatedPremiumWalk(
  tradeId: string,
  entryPremium: number,
  openedAtMs: number,
  nowMs: number,
  tickMs: number
): { ltp: number; peak: number } {
  const ticks = Math.max(0, Math.floor((nowMs - openedAtMs) / Math.max(1, tickMs)));
  let ltp = entryPremium;
  let peak = entryPremium;
  for (let i = 1; i <= ticks; i++) {
    const r = seededUnit(`${tradeId}:${i}`);
    const step = (r - 0.48) * 4;
    ltp = Math.max(1, roundPremium(ltp + step));
    peak = Math.max(peak, ltp);
  }
  return { ltp, peak };
}

export function evaluatePaperPremiumExit(
  entryPremium: number,
  currentPremium: number,
  peakPremium: number,
  points: PaperExitPoints
): PaperExitResult {
  const stopPts = Math.max(1, points.stopLossPoints || 25);
  const tgtPts = Math.max(1, points.targetPoints || 40);
  const trailPts = points.trailingStopPoints || 0;
  const trailAct = points.trailingActivatePoints || 0;
  const movePts = currentPremium - entryPremium;

  if (movePts >= tgtPts) {
    return {
      shouldClose: true,
      reason: 'target',
      exitPremium: roundPremium(entryPremium + tgtPts),
    };
  }
  if (movePts <= -stopPts) {
    return {
      shouldClose: true,
      reason: 'stop',
      exitPremium: roundPremium(Math.max(1, entryPremium - stopPts)),
    };
  }
  if (trailPts > 0 && movePts >= trailAct) {
    const peak = Math.max(peakPremium, currentPremium);
    if (currentPremium <= peak - trailPts && movePts > 0) {
      return {
        shouldClose: true,
        reason: 'trailing',
        exitPremium: roundPremium(Math.max(entryPremium, peak - trailPts)),
      };
    }
  }
  return { shouldClose: false };
}

export function paperExitLabel(reason: PaperExitReason, points: PaperExitPoints): string {
  if (reason === 'target') return `target +${points.targetPoints}pts`;
  if (reason === 'stop') return `stop -${points.stopLossPoints}pts`;
  return `trailing ${points.trailingStopPoints || 0}pts`;
}
