/**
 * PinaxForge — separate from Blink.
 * Phase 3: manual overrides, journal tuning, EOD review export.
 */

export const PINAX_FORGE_NAME = 'PinaxForge';
export const PINAX_FORGE_VERSION = 'phase-3-atm';

/** Hard rules for paper v1 — kill-switch / trade-cap / profit target come later. */
export const PINAX_FORGE_RULES = {
  observationOnly: true,
  liveOrdersAllowed: false,
  analyse: 'NIFTY_50' as const,
  trade: 'NIFTY_OPTIONS' as const,
  /**
   * Paper fills: front-week only. Non-expiry = ATM nearest; expiry day =
   * CE ≤ spot / PE ≥ spot (cheap premium). Analysis is the gate, not premium band.
   */
  optionMode: 'atm' as const,
  lotSize: 1,
  /** Never next-week while this week's listed expiry still exists. */
  expiry: 'current_week' as const,
  /** Desk reference only — not enforced while optionMode is atm. */
  premiumPreferMin: 75,
  premiumPreferMax: 100,
  /** One open paper position; flip only on drastic bias reversal (not every opposite TAKE). */
  onePositionAtATime: true,
  /**
   * Opposite TAKE confidence to flip — high bar so we don't churn every candle.
   * Flip only when desk bias has firmly reversed against the open side.
   */
  marketFlipMinConfidence: 88,
  /** Desk must be opposite the open side (CE+DOWN / PE+UP). SIDEWAYS alone never flips. */
  marketFlipRequireBiasOpposite: true,
  /** Min hold before a market-flip exit (ms) — no instant churn after ENTRY. */
  marketFlipMinHoldMs: 5 * 60 * 1000,
  /**
   * If open option LTP is missing this long (ms) AND desk bias conflicts AND an
   * opposite TAKE is live → force close only (no auto flip-entry).
   */
  missingLtpForceExitMs: 2 * 60 * 1000,
  primaryTf: '1m' as const,
  secondaryTf: ['3m', '5m'] as const,
  morningLookbackSessions: 3,
  /** NSE FO live — no paper ENTRY before this (IST). */
  sessionEntryOpenIst: '09:15',
  sessionEntryCutoffIst: '15:10',
  /** Realistic ATM round-trip (brokerage + taxes) — don't overtrade through costs. */
  roundTripCostInr: 160,
  primaryRr: 2,
  trackRrMultiples: [1, 1.5, 2] as const,
  /** No fixed daily trade count — every real opportunity can be taken. */
  maxTradesPerDay: null as number | null,
  dailyLossKillSwitchInr: null as number | null,
  dailyProfitTargetInr: null as number | null,
  mandatoryStopLoss: true,
  /**
   * Max adverse fill vs armed SL/TARGET when LTP touches the level (₹).
   * Does NOT freeze marks — live LTP is always watched; slip only clips the exit fill.
   */
  maxSlippagePts: 0.5,
  /** When MFE ≥ this × risk, trail SL to breakeven (lock 0 give-back). */
  lockProfitBreakevenRr: 1,
  /** When MFE ≥ this × risk, trail SL to entry+1R (bank 1R). */
  lockProfitTrailRr: 1.5,
  /** Exit if never green for this long (ms) — cut hope trades. */
  neverGreenExitMs: 10 * 60 * 1000,
  /** Min Nifty |move| or range (pts) over lookback bars before new TAKE. */
  minNiftyMovePts: 15,
  movementLookbackBars: 8,
  /** Soft pause after TARGET before next entry (ms). */
  postTargetCooldownMs: 15 * 60 * 1000,
  /** Pause after ANY exit before next ENTRY — analyse, don't revenge-churn. */
  postExitCooldownMs: 15 * 60 * 1000,
  /**
   * After drastic flip close: do NOT auto-enter opposite same tick.
   * Wait for cooldown + fresh analysed TAKE (pro desk).
   */
  autoEnterOnFlip: false,
  /** SIDEWAYS: only TAKE at this confidence+ (chop filter). */
  sidewaysMinConfidence: 86,
  confirmations: [
    'BREAK_RETEST',
    'REJECTION_WICK',
    'STRUCTURE_HL_LH_PLUS_LEVEL',
  ] as const,
} as const;

/**
 * Desk philosophy (owner guidance — memory, not rigid day-pattern hardcodes).
 * Sole aim: make money. Every market day has chances — find them like a real desk.
 */
export const PINAX_FORGE_DESK_PHILOSOPHY = [
  'Sole aim: make profit (even small). Nothing else matters more than that.',
  'Every day, every kind of market — there are chances to trade and make money. Do not sit dead saying “no trade today.” Find the chance.',
  'Work with that vision: watch carefully, analyse (bias, S/R, prior days + live), then TAKE when money is there — CE or PE.',
  'Stick to the plan — not every candle is a trade; but every real opportunity of faith can be taken at any time. No fixed trade-count limit.',
  'Background research always continues. When the market changes suddenly / drastically, flip-close; re-analyse before next ENTRY (no instant opposite churn).',
  'ATM round-trip cost is real (~₹160+) — don’t churn; do take the real moves so net after cost is green.',
  'No fixed “bounce-fail every day” rule — remember patterns; never assume every day is the same shape.',
  'Study yesterday fully (S/R, bias, zones). ENTRY only from today’s live bars after 09:15 — never yesterday’s setup candles.',
  'LTP/quotes must be healthy before taking — data mistakes can collapse the session.',
  'Watch live LTP always; SL armed like an order window — touch SL/TARGET → exit (fill slip ≤ ₹0.50 only).',
  'Once in: manage for profit (trail / target). Cut dead trades. Bank what the market gives.',
] as const;

export type PinaxForgeModuleId =
  | 'data'
  | 'morning_desk'
  | 'setup_1m'
  | 'option_picker'
  | 'risk'
  | 'paper'
  | 'journal'
  | 'dashboard'
  | 'override'
  | 'tuning'
  | 'review';

export const PINAX_FORGE_MODULES: Array<{
  id: PinaxForgeModuleId;
  title: string;
  phase1: string;
  status: 'active' | 'shell' | 'next';
}> = [
  {
    id: 'data',
    title: 'Market data',
    phase1: 'Upstox live quotes + 1m intraday/historical for Nifty 50.',
    status: 'active',
  },
  {
    id: 'morning_desk',
    title: 'Morning desk (2–3 days)',
    phase1: 'Bias, PDH/PDL, buy/sell zones from prior sessions + today structure.',
    status: 'active',
  },
  {
    id: 'setup_1m',
    title: '1m setup engine',
    phase1: 'Break+retest · rejection wick · HL/LH+level — tuned from paper history.',
    status: 'active',
  },
  {
    id: 'option_picker',
    title: 'Option picker (front week)',
    phase1:
      'Current listed expiry only · ATM off-expiry · expiry-day CE≤spot / PE≥spot · analysis-gated.',
    status: 'active',
  },
  {
    id: 'risk',
    title: 'Risk engine',
    phase1:
      '1 lot · mandatory SL · 09:15–15:10 · one position · drastic flip only · paper only.',
    status: 'active',
  },
  {
    id: 'paper',
    title: 'Paper broker',
    phase1: 'Simulated fills at Upstox LTP · SL/target RR · rare drastic flip close (not every TAKE).',
    status: 'active',
  },
  {
    id: 'journal',
    title: 'Decision journal',
    phase1: 'Setups, entries, skips, overrides — .data/pinax-forge-journal-*.jsonl.',
    status: 'active',
  },
  {
    id: 'dashboard',
    title: 'Performance',
    phase1: 'Win rate, expectancy, after-cost P&L from closed paper trades.',
    status: 'active',
  },
  {
    id: 'override',
    title: 'Manual override',
    phase1: 'Pause/resume auto · force take/skip · manual close open paper trade.',
    status: 'active',
  },
  {
    id: 'tuning',
    title: 'Setup tuning',
    phase1: 'Min confidence + per-setup bonuses from last 14 days of paper results.',
    status: 'active',
  },
  {
    id: 'review',
    title: 'EOD review export',
    phase1: 'Download markdown summary — bias, trades, journal, tuning notes.',
    status: 'active',
  },
];

export function pinaxForgeRuleSummary(): string[] {
  const r = PINAX_FORGE_RULES;
  return [
    'Paper trading only — live orders blocked until you explicitly approve later.',
    'Sole aim: make money. Every day / every market has chances — find them and take them (like a real desk).',
    'Pro pace: watch every point → analyse with past + live → decide → TAKE. No fixed trade-count limit — every real opportunity of faith can be used at any time.',
    'Not every candle; never idle when the real chance is there. Churning through ₹' +
      r.roundTripCostInr +
      '+ cost is failure; missing a real opportunity is also failure.',
    'Day patterns are memories only — never hardcode as every-day rules; tomorrow can differ.',
    'Bias guides; CE or PE both valid when analysis says the side pays.',
    'Analyse Nifty 50 every tick · paper-trade current listed front expiry only · 1 lot.',
    'Strikes: liquid front-week that tracks Nifty — ATM nearest 50 off-expiry; on expiry day CE≤spot / PE≥spot.',
    `One position — flip only on drastic change (desk bias opposite + opposite TAKE ≥ ${r.marketFlipMinConfidence}%, hold ≥ ${r.marketFlipMinHoldMs / 60000}m). SIDEWAYS alone never flips.`,
    `Primary chart 1m · ENTRY only ${r.sessionEntryOpenIst}–${r.sessionEntryCutoffIst} IST · study prior days for S/R/bias; never ENTRY off yesterday’s setup bars.`,
    `RR primary 1:${r.primaryRr} · mandatory SL armed at entry · exit fill slip ≤ ₹${r.maxSlippagePts} on touch · cost ₹${r.roundTripCostInr}/round trip.`,
    'Manage winners with trail / target; time-stop if never green; TAKE when Nifty is moving · post-exit analyse window.',
    'Open position: watch live LTP (WS / 1s poll) — SL/TARGET on touch; slip only clips the fill.',
    'Confirmations (market-dependent): break+retest, rejection wick, structure HL/LH + level.',
    'Phase 3: pause auto entries, force take/skip, manual close, tuned thresholds from paper journal.',
    'No fixed max trades/day — opportunity-driven. Daily loss kill-switch / profit target: not fixed yet.',
    'Completely separate from Blink — Blink files and runtime are not part of this agent.',
    ...PINAX_FORGE_DESK_PHILOSOPHY,
  ];
}
