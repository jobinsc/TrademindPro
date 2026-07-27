/**
 * PinaxForge types — Phase 3.
 */

import type { PinaxForgeModuleId } from '@/lib/pinax-forge/rules';
import { PINAX_FORGE_NAME, PINAX_FORGE_VERSION } from '@/lib/pinax-forge/rules';
import type {
  PinaxMorningContext,
  PinaxMorningRead,
  TradingZone,
} from '@/lib/pinax-forge/morning-desk';

export type PinaxForgeStatus = {
  ok: true;
  agent: typeof PINAX_FORGE_NAME;
  version: typeof PINAX_FORGE_VERSION;
  liveOrdersAllowed: false;
  paperOnly: true;
  separateFromBlink: true;
  serverAt: string;
  modules: PinaxForgeModuleId[];
  message: string;
  /** Upstox Market Data V3 WS (PinaxForge paper desk only). */
  wsConnected?: boolean;
  lastTickAt?: string | null;
};

export type PinaxSetupKind =
  | 'BREAK_RETEST'
  | 'REJECTION_WICK'
  | 'STRUCTURE_HL_LH_PLUS_LEVEL';

export type PinaxSetupSignal = {
  id: string;
  at: string;
  kind: PinaxSetupKind;
  side: 'CE' | 'PE';
  spot: number;
  level: number;
  confidence: number;
  reasons: string[];
  alignedWithBias: boolean;
  decision: 'TAKE' | 'SKIP';
  skipReason?: string;
};

export type PinaxOptionCandidate = {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  side: 'CE' | 'PE';
  expiry: string;
  lotSize: number;
  premium: number;
  /** Legacy field — true when picker accepts the contract (ATM mode always true). */
  inPreferredBand: boolean;
  isAtm?: boolean;
  score: number;
};

export type PinaxMarkSample = {
  at: string;
  premium: number;
  spot?: number;
};

export type PinaxPaperTrade = {
  id: string;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  side: 'CE' | 'PE';
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry: string;
  qty: number;
  lotSize: number;
  entryPremium: number;
  /** Spot at paper entry — used for adverse-exit spot break checks. */
  entrySpot?: number;
  exitPremium?: number;
  markPremium?: number;
  stopLossPremium: number;
  targetPremiums: { rr: number; price: number }[];
  setupKind: PinaxSetupKind;
  setupId: string;
  grossPnl?: number;
  netPnl?: number;
  exitReason?: 'SL' | 'TARGET' | 'MANUAL' | 'EOD' | 'ADVERSE' | 'TIME';
  rrAchieved?: number;
  /** Original SL at entry — used for R-multiples when trailing. */
  initialStopLossPremium?: number;
  /**
   * Training / exit-quality path stats (updated every tick with a mark).
   * High/Low = absolute option premium extremes after entry until close.
   * MFE = max premium pts above entry; MAE = max premium pts below entry.
   */
  highPremium?: number;
  lowPremium?: number;
  maxFavorablePts?: number;
  maxAdversePts?: number;
  everProfit?: boolean;
  firstProfitAt?: string;
  /** Capped mark trail for post-session path study (not every ms forever). */
  markPath?: PinaxMarkSample[];
};

export type PinaxJournalEntry = {
  at: string;
  type: 'SETUP' | 'ENTRY' | 'EXIT' | 'SKIP' | 'INFO' | 'OVERRIDE';
  message: string;
  setupId?: string;
  tradeId?: string;
  detail?: Record<string, unknown>;
};

export type PinaxKindStat = {
  wins: number;
  losses: number;
  winRate: number;
};

export type PinaxTuningProfile = {
  updatedAt: string;
  sampleTrades: number;
  minConfidence: number;
  kindBonus: Record<PinaxSetupKind, number>;
  kindStats: Record<PinaxSetupKind, PinaxKindStat>;
  notes: string[];
};

export type PinaxPerformanceSummary = {
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  netPnl: number;
  expectancy: number;
  rrHits: Record<string, number>;
};

export type PinaxPriceActionSnapshot = {
  support: number | null;
  resistance: number | null;
  trend: 1 | -1 | 0;
  lastLabel: string | null;
  structureText: string;
};

export type PinaxForgeSession = {
  sessionDate: string;
  startedAt: string;
  updatedAt: string;
  spot: number;
  morningContext: PinaxMorningContext;
  morningRead: PinaxMorningRead | null;
  zones: TradingZone[];
  priceAction: PinaxPriceActionSnapshot;
  optionCandidates: PinaxOptionCandidate[];
  openTrades: PinaxPaperTrade[];
  closedTrades: PinaxPaperTrade[];
  lastSetups: PinaxSetupSignal[];
  recentJournal: PinaxJournalEntry[];
  performance: PinaxPerformanceSummary;
  entryCutoffReached: boolean;
  autoPaused: boolean;
  blockedSetupKeys: string[];
  tuning: PinaxTuningProfile;
  /**
   * Last bias-aligned TAKE seen while a position was open (or just closed).
   * Used so PE/CE still enters after flat even if the close tick has empty setups.
   */
  pendingTake?: PinaxSetupSignal | null;
};

export type PinaxEodReview = {
  sessionDate: string;
  generatedAt: string;
  hasSession: boolean;
  markdown: string;
  summary: {
    spot: number;
    bias: string | null;
    performance: PinaxPerformanceSummary;
    closedCount: number;
    openCount: number;
    autoPaused: boolean;
  } | null;
  tuning: PinaxTuningProfile;
};

export type PinaxOverrideAction =
  | 'pause_auto'
  | 'resume_auto'
  | 'force_take'
  | 'force_skip'
  | 'close_trade';

export type PinaxOverrideResponse = {
  ok: boolean;
  error?: string;
  session?: PinaxForgeSession;
};

export type PinaxReviewResponse = {
  ok: boolean;
  error?: string;
  review?: PinaxEodReview;
};

export type PinaxInitResponse = {
  ok: boolean;
  error?: string;
  session?: PinaxForgeSession;
};

export type PinaxTickResponse = {
  ok: boolean;
  error?: string;
  session?: PinaxForgeSession;
  tickAt?: string;
  wsConnected?: boolean;
  lastTickAt?: string | null;
};

export type PinaxJournalResponse = {
  ok: boolean;
  error?: string;
  entries?: PinaxJournalEntry[];
  sessionDate?: string;
};
