/**
 * GoldPulse — separate international gold paper agent (Yahoo GC=F).
 * Does NOT touch NexusPulse / PinaxForge / Blink / Nejoic logic.
 *
 * v6 tuned via Yahoo 15m+30m sweep (~9600 combos): trail OFF, 90m cooldown,
 * wider SL, exit mainly on Sector 7 G (30m flip) — net positive on that window.
 */

export const GOLD_PULSE_NAME = 'GoldPulse';
export const GOLD_PULSE_VERSION = 'gold-intl-ut-v6-15m30m-positive';

/** Yahoo continuous gold futures */
export const GOLD_YAHOO_SYMBOL = 'GC=F';
export const GOLD_YAHOO_LABEL = 'Gold (International)';

/** Entry timeframe UT (15m). */
export const GOLD_UT_ENTRY = { keyValue: 1, atrPeriod: 10, tf: '15m' as const };

/** Higher TF for Sector 7 G exit / direction filter (30m). */
export const GOLD_UT_HTF = { keyValue: 1, atrPeriod: 14, tf: '30m' as const };

export const GOLD_PULSE_RULES = {
  observationOnly: false,
  liveOrdersAllowed: false,
  analyse: 'GOLD_GC_F' as const,
  trade: 'GOLD_FUTURES_PAPER' as const,
  dataSource: 'yahoo' as const,
  yahooSymbol: GOLD_YAHOO_SYMBOL,
  qty: 1,
  pointValue: 1,
  roundTripCostUsd: 5,
  /** Sweep winner: trail off (kept for optional future use). */
  useTrail: false,
  trailMfeTrigger: 12,
  trailKeepFrac: 0.5,
  /** Wider SL so Sector 7 G can work; sweep used 0.6%. */
  defaultSlPct: 0.006,
  minSlUsd: 8,
  /** 90 minutes after any exit. */
  reentryCooldownMs: 90 * 60 * 1000,
  /** Do not exit on 15m flip — let 30m Sector 7 G / SL decide. */
  disableEntryFlipExit: true,
  entryFlipNeedsHtfAgainst: true,
  requireHtfStable: false,
  minEntryRangeUsd: 0,
  entryRangeLookback: 3,
  sideMode: 'BOTH' as const,
  tickPollMsFlat: 20_000,
  tickPollMsInTrade: 12_000,
  sector7Label: 'Sector 7 G',
} as const;

export function goldPulseRuleSummary(): string[] {
  const r = GOLD_PULSE_RULES;
  return [
    `${GOLD_PULSE_NAME} — separate agent. Does not modify NexusPulse, PinaxForge, Blink, or Nejoic.`,
    `Data: Yahoo Finance ${r.yahooSymbol} (international gold futures continuous).`,
    `Signal: UT Bot on ${GOLD_UT_ENTRY.tf} entry + ${GOLD_UT_HTF.tf} must agree.`,
    'Trades: paper LONG / SHORT gold price (not options).',
    `Main exit ${r.sector7Label}: ${GOLD_UT_HTF.tf} UT flips against the position.`,
    r.disableEntryFlipExit
      ? 'No 15m-flip exit (holds while 30m still agrees).'
      : `15m flip exit rules apply.`,
    r.useTrail
      ? `Trail after MFE ≥ $${r.trailMfeTrigger} (keep ${r.trailKeepFrac * 100}%).`
      : 'Trail exits OFF (sweep winner).',
    `SL ~${(r.defaultSlPct * 100).toFixed(1)}% of price (min $${r.minSlUsd}).`,
    `Re-entry cooldown ${r.reentryCooldownMs / 60000} minutes after any exit.`,
    `Cost model ~$${r.roundTripCostUsd}/round trip (paper).`,
    'Paper only — no live broker orders. Past Yahoo window ≠ future guarantee.',
  ];
}
