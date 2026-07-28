/**
 * GoldPulse — shared constants (strategies live in strategies.ts).
 */

export const GOLD_PULSE_NAME = 'GoldPulse';
export const GOLD_PULSE_VERSION = 'gold-dual-strategy-v13';

export const GOLD_YAHOO_SYMBOL = 'GC=F';
export const GOLD_YAHOO_LABEL = 'Gold (International)';

export const GOLD_UT_ENTRY = { keyValue: 1, atrPeriod: 10, tf: '15m' as const };
export const GOLD_UT_HTF = { keyValue: 1, atrPeriod: 14, tf: '30m' as const };

/** Desk shell — numeric rules come from active paper strategy. */
export const GOLD_PULSE_RULES = {
  observationOnly: false,
  liveOrdersAllowed: false,
  analyse: 'GOLD_GC_F' as const,
  trade: 'GOLD_FUTURES_PAPER' as const,
  dataSource: 'yahoo' as const,
  yahooSymbol: GOLD_YAHOO_SYMBOL,
  qty: 1,
  pointValue: 1,
  sector7Label: 'Sector 7 G',
  tickPollMsFlat: 20_000,
  tickPollMsInTrade: 12_000,
} as const;

export function goldPulseRuleSummary(): string[] {
  return [
    `${GOLD_PULSE_NAME} — two paper strategies (v12 Max & Sweep peak).`,
    `Version ${GOLD_PULSE_VERSION}. Enable one strategy for paper; study reports per strategy.`,
    `Data: Yahoo ${GOLD_YAHOO_SYMBOL} ${GOLD_UT_ENTRY.tf} + ${GOLD_UT_HTF.tf}.`,
    'Does not modify NexusPulse, Pinax, or other agents.',
  ];
}
