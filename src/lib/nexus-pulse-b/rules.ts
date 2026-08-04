/**
 * NexusPulse Sector 7 B — Sensex twin of Sector 7 A (isolated paper desk).
 */

export const NEXUS_PULSE_B_NAME = 'NexusPulse';
export const NEXUS_PULSE_B_VERSION = 'sector-7b-v8-closed-tf';
export const NEXUS_SECTOR_7B_LABEL = 'Sector 7 B';

/** Same UT params as Sector 7 A: Key=1, ATR=10 on 3m; ATR=14 on 5m. */
export const NEXUS_B_UT_3M = { keyValue: 1, atrPeriod: 10 } as const;
export const NEXUS_B_UT_5M = { keyValue: 1, atrPeriod: 14 } as const;

export const SENSEX_INDEX_INSTRUMENT_KEY = 'BSE_INDEX|SENSEX';

export const NEXUS_PULSE_B_RULES = {
  observationOnly: false,
  liveOrdersAllowed: false,
  analyse: 'SENSEX' as const,
  trade: 'SENSEX_OPTIONS' as const,
  sideMode: 'buy_premium_only' as const,
  lotSize: 1,
  /** Sensex weekly FO lot. */
  sensexLotSize: 20,
  strikeStep: 100,
  /**
   * Align live desk to Sensex real-option study: strict ATM + 3m-bar gate.
   * (Former live rule ₹250–300 band is off while this is true.)
   */
  matchRealOptionStudy: true,
  /** Legacy band (unused while matchRealOptionStudy). */
  premiumBandMin: 250,
  premiumBandMax: 300,
  premiumBandTarget: 275,
  /** @deprecated — study-aligned live uses ATM only. */
  minPremiumFloor: 0,
  /** Spot drift (pts) before re-resolving ATM legs — ~1 Sensex strike. */
  atmReselectSpotDrift: 80,
  roundTripCostInr: 70,
  sessionOpenIst: '09:15',
  sessionSquareOffIst: '15:14',
  laneBStopNewIst: '15:00',
  /** Same trail as real-option study — arm at 12 pts MFE, keep 50%. */
  trailMfeTriggerPts: 12,
  trailKeepFrac: 0.5,
  mandatoryStopLoss: false,
  defaultSlPct: 0.2,
  minSlPremiumPts: 8,
  tickPollMsFlat: 15_000,
  tickPollMsInTrade: 8_000,
} as const;

export type NexusBLaneId = 'current_bans' | 'morning_open_stop_15';

export const NEXUS_B_LANES: Record<
  NexusBLaneId,
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

export function nexusBRuleSummary(): string[] {
  const r = NEXUS_PULSE_B_RULES;
  return [
    `${NEXUS_PULSE_B_NAME} ${NEXUS_SECTOR_7B_LABEL} — Sensex twin of Sector 7 A. Isolated from Nifty desk / Pinax / Blink.`,
    `Signal: ${NEXUS_SECTOR_7B_LABEL} on Sensex 3m entries + 5m direction must agree (same UT as Sector 7 A).`,
    r.matchRealOptionStudy
      ? `Trades: buy CE/PE at **strict ATM** (same as Sensex real-option study), front-week Sensex, 1 lot (${r.sensexLotSize}).`
      : `Trades: buy CE/PE with premium ₹${r.premiumBandMin}–${r.premiumBandMax} (nearest ATM in band), front-week Sensex, 1 lot (${r.sensexLotSize}).`,
    `Strike step ₹${r.strikeStep}. Default lane B only (study-style); optional lane A.`,
    `Trail: MFE ≥ ${r.trailMfeTriggerPts} premium pts → exit if open profit < ${r.trailKeepFrac * 100}% of MFE.`,
    `Exits: trail + opposite 3m ${NEXUS_SECTOR_7B_LABEL} (new 3m bar only) + 5m against; no same-bar reverse; SQ 15:14.`,
    'Live entries: same as study — today’s session bars only, first 40×1m warm-up, then 1m-close fills.',
    `Cost model ₹${r.roundTripCostInr}/round trip on closed trades.`,
    'Paper only until you explicitly approve live.',
  ];
}
