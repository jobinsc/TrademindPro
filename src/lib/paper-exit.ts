/**
 * Shared paper-trade exit helpers — premium-point SL / target / trailing.
 */

export type PaperExitPoints = {
  stopLossPoints: number;
  targetPoints: number;
  trailingStopPoints?: number;
  trailingActivatePoints?: number;
  /**
   * Nexus-style MFE profit trail (Sector 7 A/B idea):
   * once peak move ≥ mfeTrailTriggerPts, exit if open profit < keepFrac × MFE.
   */
  mfeTrailEnabled?: boolean;
  mfeTrailTriggerPts?: number;
  /** Fraction of MFE to keep (0.5 = book when giveback > half of peak). */
  mfeTrailKeepFrac?: number;
};

export type PaperExitReason = 'target' | 'stop' | 'trailing' | 'mfe_trail';

export type PaperExitResult = {
  shouldClose: boolean;
  reason?: PaperExitReason;
  exitPremium?: number;
};

export function roundPremium(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Jimbo stock options: do not open (or keep) contracts with premium below ₹10.
 * Low-priced names (e.g. ITC ~₹5) are skipped entirely — no entry, no “cheap cap” mode.
 */
export const JIMBO_MIN_OPTION_ENTRY_PREMIUM = 10;

export function isJimboEntryPremiumAllowed(entryPremium: number): boolean {
  return Number.isFinite(entryPremium) && entryPremium >= JIMBO_MIN_OPTION_ENTRY_PREMIUM;
}

/** @deprecated Use JIMBO_MIN_OPTION_ENTRY_PREMIUM — cheap-cap trading is removed. */
export const CHEAP_OPTION_PREMIUM_BELOW = JIMBO_MIN_OPTION_ENTRY_PREMIUM;
/** @deprecated Cheap-cap mode removed; kept so older imports do not break. */
export const CHEAP_OPTION_POINT_CAP = 3;

/**
 * No-op retained for call-site compatibility. Jimbo no longer trades sub-₹10
 * premiums, so point caps are not applied.
 */
export function applyCheapOptionPointCap(
  points: PaperExitPoints,
  _entryPremium: number
): PaperExitPoints {
  return points;
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
  const peak = Math.max(peakPremium, currentPremium);
  const mfe = peak - entryPremium;

  if (movePts <= -stopPts) {
    return {
      shouldClose: true,
      reason: 'stop',
      exitPremium: roundPremium(Math.max(1, entryPremium - stopPts)),
    };
  }

  // Sector 7–style MFE giveback trail (arm after trigger, keep fraction of peak)
  if (points.mfeTrailEnabled) {
    const trigger = Math.max(1, points.mfeTrailTriggerPts ?? 7);
    const keepFrac = Math.min(0.95, Math.max(0.1, points.mfeTrailKeepFrac ?? 0.5));
    if (mfe >= trigger) {
      const keepMin = mfe * keepFrac;
      if (movePts < keepMin) {
        return {
          shouldClose: true,
          reason: 'mfe_trail',
          exitPremium: roundPremium(Math.max(1, currentPremium)),
        };
      }
    }
  }

  if (movePts >= tgtPts) {
    return {
      shouldClose: true,
      reason: 'target',
      exitPremium: roundPremium(entryPremium + tgtPts),
    };
  }

  if (trailPts > 0 && movePts >= trailAct) {
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
  if (reason === 'mfe_trail') {
    const trig = points.mfeTrailTriggerPts ?? 7;
    const keep = Math.round((points.mfeTrailKeepFrac ?? 0.5) * 100);
    return `MFE trail (arm ${trig}pts · keep ${keep}%)`;
  }
  return `trailing ${points.trailingStopPoints || 0}pts`;
}
