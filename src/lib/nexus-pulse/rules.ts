/**
 * NexusPulse — Nifty Sector 7 A options paper desk (isolated from PinaxForge / Blink / ATM Lab).
 */

export const NEXUS_PULSE_NAME = 'NexusPulse';
export const NEXUS_PULSE_VERSION = 'sector-7a-v1';
/** Display name for the signal / 5m flip exit (internal codes still UT_*). */
export const NEXUS_SECTOR_7A_LABEL = 'Sector 7 A';

/** Sector 7 A params: Key=1, ATR=10 on 3m; ATR=14 on 5m. */
export const NEXUS_UT_3M = { keyValue: 1, atrPeriod: 10 } as const;
export const NEXUS_UT_5M = { keyValue: 1, atrPeriod: 14 } as const;

export const NEXUS_PULSE_RULES = {
  observationOnly: false,
  liveOrdersAllowed: false,
  analyse: 'NIFTY_50' as const,
  trade: 'NIFTY_OPTIONS' as const,
  /** Long premium only — CE on bullish Sector 7 A, PE on bearish. */
  sideMode: 'buy_premium_only' as const,
  lotSize: 1,
  niftyLotSize: 65,
  roundTripCostInr: 70,
  sessionOpenIst: '09:15',
  sessionSquareOffIst: '15:14',
  /** Lane B: force flat + no new entries from 15:00. */
  laneBStopNewIst: '15:00',
  /** Trail after option MFE (premium pts) ≥ trigger; exit if giveback > (1 - keepFrac) × MFE. */
  trailMfeTriggerPts: 12,
  trailKeepFrac: 0.5,
  /** BOTS NexusPulse study uses trail + UT exits only (no premium SL). */
  mandatoryStopLoss: false,
  /** Default SL = 20% of entry premium (options), min ₹8 — same desk habit as PinaxForge. */
  defaultSlPct: 0.2,
  minSlPremiumPts: 8,
  /** Poll slowly — Upstox REST rate limit (UDAPI10005). Candles cached ~45s. */
  tickPollMsFlat: 15_000,
  tickPollMsInTrade: 8_000,
} as const;

export type NexusLaneId = 'current_bans' | 'morning_open_stop_15';

export const NEXUS_LANES: Record<
  NexusLaneId,
  { title: string; description: string }
> = {
  current_bans: {
    title: 'A · Current bans',
    description: 'No new entries 09:15–09:30; no new 14:00–14:45; SQ 15:14.',
  },
  morning_open_stop_15: {
    title: 'B · Morning open / stop 15:00',
    description: 'Entries from 09:15; from 15:00 no new + force flat; SQ 15:14.',
  },
};

export function nexusRuleSummary(): string[] {
  const r = NEXUS_PULSE_RULES;
  return [
    `${NEXUS_PULSE_NAME} — separate agent. Does not modify Blink, ATM Lab, or PinaxForge.`,
    `Signal: ${NEXUS_SECTOR_7A_LABEL} on Nifty 3m entries + 5m direction must agree.`,
    'Trades: buy CE/PE (ATM or ₹50+ stepped strike if ATM cheap), front-week Nifty, 1 lot.',
    `Two paper lanes (A/B) with different session windows — see ${Object.keys(NEXUS_LANES).join(', ')}.`,
    `Trail: MFE ≥ ${r.trailMfeTriggerPts} premium pts → exit if open profit < ${r.trailKeepFrac * 100}% of MFE.`,
    `Exits: trail + opposite 3m ${NEXUS_SECTOR_7A_LABEL} (new bar) + 5m against; no premium SL; SQ 15:14.`,
    `Cost model ₹${r.roundTripCostInr}/round trip on closed trades.`,
    'Paper only until you explicitly approve live.',
  ];
}
