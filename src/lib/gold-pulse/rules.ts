/**
 * GoldPulse — separate international gold paper agent (Yahoo GC=F).
 * Does NOT touch NexusPulse / PinaxForge / Blink / Nejoic logic.
 */

export const GOLD_PULSE_NAME = 'GoldPulse';
export const GOLD_PULSE_VERSION = 'gold-intl-ut-v4-15m30m';

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
  /** Paper: 1 unit; PnL = price move × pointValue (USD). */
  qty: 1,
  /** $1 PnL per $1/oz move (simple oz proxy). */
  pointValue: 1,
  /** Flat paper cost per round trip (USD). */
  roundTripCostUsd: 5,
  /** Trail after MFE ≥ trigger ($); exit if open profit < keepFrac × MFE. */
  trailMfeTrigger: 8,
  trailKeepFrac: 0.5,
  /** SL = % of entry price distance in $. */
  defaultSlPct: 0.004,
  minSlUsd: 3,
  tickPollMsFlat: 20_000,
  tickPollMsInTrade: 12_000,
  /** Display name for HTF UT exit (same idea as NexusPulse Sector 7 A). */
  sector7Label: 'Sector 7 G',
} as const;

export function goldPulseRuleSummary(): string[] {
  const r = GOLD_PULSE_RULES;
  return [
    `${GOLD_PULSE_NAME} — separate agent. Does not modify NexusPulse, PinaxForge, Blink, or Nejoic.`,
    `Data: Yahoo Finance ${r.yahooSymbol} (international gold futures continuous).`,
    `Signal: UT Bot on ${GOLD_UT_ENTRY.tf} entry + ${GOLD_UT_HTF.tf} must agree.`,
    'Trades: paper LONG / SHORT gold price (not options).',
    `Exit ${r.sector7Label}: ${GOLD_UT_HTF.tf} UT flips against the position (same idea as Sector 7 A on Nifty).`,
    `Also exit: opposite ${GOLD_UT_ENTRY.tf} UT, trail, stop-loss.`,
    `Cost model ~$${r.roundTripCostUsd}/round trip (paper).`,
    'Paper only — no live broker orders.',
    'Backtest: Yahoo 15m + 30m history.',
  ];
}
