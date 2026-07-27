/**
 * GoldPulse — separate international gold paper agent (Yahoo GC=F).
 * Does NOT touch NexusPulse / PinaxForge / Blink / Nejoic logic.
 */

export const GOLD_PULSE_NAME = 'GoldPulse';
export const GOLD_PULSE_VERSION = 'gold-intl-ut-v5-15m30m-improved';

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
  /** Trail only after stronger move (was $8). */
  trailMfeTrigger: 12,
  trailKeepFrac: 0.5,
  defaultSlPct: 0.004,
  minSlUsd: 3,
  /** No new entry for this long after any exit. */
  reentryCooldownMs: 45 * 60 * 1000,
  /**
   * If true: exit on 15m flip only when 30m also disagrees.
   * If 30m still agrees, hold for Sector 7 G / trail / SL.
   */
  entryFlipNeedsHtfAgainst: true,
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
    `Exit ${r.sector7Label}: ${GOLD_UT_HTF.tf} UT flips against the position.`,
    r.entryFlipNeedsHtfAgainst
      ? `15m flip exit only if 30m also against you (else hold for Sector 7 G / trail / SL).`
      : `Also exit: opposite ${GOLD_UT_ENTRY.tf} UT.`,
    `Trail after MFE ≥ $${r.trailMfeTrigger} (keep ${r.trailKeepFrac * 100}%).`,
    `Re-entry cooldown ${r.reentryCooldownMs / 60000} minutes after any exit.`,
    `Cost model ~$${r.roundTripCostUsd}/round trip (paper).`,
    'Paper only — no live broker orders.',
  ];
}
