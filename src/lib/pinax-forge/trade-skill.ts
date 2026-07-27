/**
 * PinaxForge profit desk skills — lock green fast, cut dead trades, enter only when Nifty moves.
 * Philosophy: catch liquid movement with Nifty, bank profit like a human desk (not rigid day scripts).
 */

import type { Candle } from '@/lib/nejoic';
import { isSessionOpen } from '@/lib/pinax-forge/ist';
import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import type { PinaxPaperTrade } from '@/lib/pinax-forge/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function initialRiskPts(trade: PinaxPaperTrade): number {
  const initial = trade.initialStopLossPremium ?? trade.stopLossPremium;
  return Math.max(0.5, round2(trade.entryPremium - initial));
}

/**
 * Trail SL up once MFE pays — lock profit like a pro (don't give it all back).
 * - MFE ≥ 1R  → SL to breakeven (entry)
 * - MFE ≥ 1.5R → SL to entry + 1R (bank 1R)
 * Never lowers SL.
 */
export function applyLockProfitTrail(trade: PinaxPaperTrade): {
  trade: PinaxPaperTrade;
  trailed: boolean;
  note?: string;
} {
  const risk = initialRiskPts(trade);
  const mfe = trade.maxFavorablePts ?? 0;
  let nextSl = trade.stopLossPremium;
  let note: string | undefined;

  if (mfe >= risk * PINAX_FORGE_RULES.lockProfitTrailRr) {
    const lock1 = round2(trade.entryPremium + risk);
    if (lock1 > nextSl) {
      nextSl = lock1;
      note = `Lock trail · MFE +₹${mfe} ≥ ${PINAX_FORGE_RULES.lockProfitTrailRr}R · SL → ₹${nextSl} (bank ~1R)`;
    }
  } else if (mfe >= risk * PINAX_FORGE_RULES.lockProfitBreakevenRr) {
    const be = round2(trade.entryPremium);
    if (be > nextSl) {
      nextSl = be;
      note = `Lock trail · MFE +₹${mfe} ≥ ${PINAX_FORGE_RULES.lockProfitBreakevenRr}R · SL → breakeven ₹${nextSl}`;
    }
  }

  if (nextSl <= trade.stopLossPremium) {
    return { trade, trailed: false };
  }

  return {
    trade: { ...trade, stopLossPremium: nextSl },
    trailed: true,
    note,
  };
}

/** Never-green time stop — hope trades kill the book. Only after market open. */
export function shouldTimeStopNeverGreen(
  trade: PinaxPaperTrade,
  nowMs = Date.now()
): boolean {
  if (trade.everProfit) return false;
  if (!isSessionOpen(PINAX_FORGE_RULES.sessionEntryOpenIst, new Date(nowMs))) {
    return false;
  }
  const opened = new Date(trade.openedAt).getTime();
  if (!Number.isFinite(opened)) return false;
  return nowMs - opened >= PINAX_FORGE_RULES.neverGreenExitMs;
}

export type MovementQuality = {
  ok: boolean;
  movePts: number;
  rangePts: number;
  reason: string;
};

/**
 * Enter only when Nifty is actually moving — dead chop wastes premium.
 * Uses last N 1m candles: net |close change| or high-low range.
 */
export function assessNiftyMovementQuality(
  candles: Candle[],
  lookback = PINAX_FORGE_RULES.movementLookbackBars
): MovementQuality {
  const sorted = [...candles].sort((a, b) => a.t.localeCompare(b.t));
  if (sorted.length < Math.max(3, lookback)) {
    return {
      ok: false,
      movePts: 0,
      rangePts: 0,
      reason: 'Not enough today’s bars yet — keep analysing, wait for clear Nifty movement',
    };
  }

  const window = sorted.slice(-lookback);
  const first = window[0];
  const last = window[window.length - 1];
  const movePts = round2(Math.abs(last.close - first.open));
  const hi = Math.max(...window.map((c) => c.high));
  const lo = Math.min(...window.map((c) => c.low));
  const rangePts = round2(hi - lo);
  const minMove = PINAX_FORGE_RULES.minNiftyMovePts;
  const ok = movePts >= minMove || rangePts >= minMove;

  return {
    ok,
    movePts,
    rangePts,
    reason: ok
      ? `Nifty moving · |Δ| ${movePts} / range ${rangePts} (≥ ${minMove})`
      : `Nifty quiet · |Δ| ${movePts} / range ${rangePts} < ${minMove} — wait for real movement`,
  };
}

/** Soft cooldown after a TARGET win — avoid revenge re-entry into noise. */
export function inPostTargetCooldown(
  closedTrades: PinaxPaperTrade[],
  nowMs = Date.now()
): boolean {
  const lastWin = [...closedTrades]
    .reverse()
    .find((t) => t.exitReason === 'TARGET' && t.closedAt);
  if (!lastWin?.closedAt) return false;
  const t = new Date(lastWin.closedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t < PINAX_FORGE_RULES.postTargetCooldownMs;
}

/** After any exit — pause, re-analyse with past + live, then decide (pro desk pace). */
export function inPostExitCooldown(
  closedTrades: PinaxPaperTrade[],
  nowMs = Date.now()
): boolean {
  const last = [...closedTrades].reverse().find((t) => t.closedAt);
  if (!last?.closedAt) return false;
  const t = new Date(last.closedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t < PINAX_FORGE_RULES.postExitCooldownMs;
}
