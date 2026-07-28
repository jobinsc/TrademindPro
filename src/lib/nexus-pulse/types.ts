import type { NexusLaneId } from '@/lib/nexus-pulse/rules';

export type UtBarSignal = {
  t: string;
  buy: boolean;
  sell: boolean;
  pos: -1 | 0 | 1;
  trailingStop: number;
  src: number;
};

export type NexusUtSnapshot = {
  tf: '3m' | '5m';
  keyValue: number;
  atrPeriod: number;
  bars: number;
  last: UtBarSignal | null;
  prev: UtBarSignal | null;
};

export type NexusSignalDecision = {
  at: string;
  side: 'CE' | 'PE' | 'FLAT';
  reason: string;
  buy3m: boolean;
  sell3m: boolean;
  pos5m: -1 | 0 | 1;
  new3mEdge: boolean;
};

export type NexusPaperTrade = {
  id: string;
  laneId: NexusLaneId;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  side: 'CE' | 'PE';
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry?: string;
  qty: number;
  lotSize: number;
  entryPremium: number;
  entrySpot: number;
  stopLossPremium: number;
  markPremium?: number;
  /** Highest option premium seen after entry (until close). */
  highPremium: number;
  /** Lowest option premium seen after entry (until close). */
  lowPremium: number;
  maxFavorablePts: number;
  maxAdversePts: number;
  exitPremium?: number;
  exitReason?: 'SL' | 'TARGET' | 'TRAIL' | 'UT_3M' | 'UT_5M' | 'SQ' | 'LANE_B_15' | 'MANUAL' | 'EOD';
  grossPnl?: number;
  netPnl?: number;
};

export type NexusAtmLegQuote = {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry?: string;
  ltp: number;
  bid?: number | null;
  ask?: number | null;
};

/** Live board like ATM Lab — Nifty + ATM CE/PE premiums. */
export type NexusAtmBoard = {
  spot: number;
  atmStrike: number;
  expiry: string | null;
  ce: NexusAtmLegQuote | null;
  pe: NexusAtmLegQuote | null;
  quotedAt: string;
  note?: string;
};

export type NexusPulseSettings = {
  activeLanes: NexusLaneId[];
  stopAfterLossEnabled: boolean;
  stopAfterLossInr: number;
};

export type NexusGuardState = {
  blockedNewEntries: boolean;
  reason: string | null;
  dayNetAtDecision: number;
};

export type NexusPulseSession = {
  sessionDate: string;
  startedAt: string;
  updatedAt: string;
  spot: number;
  /** Live Nifty + ATM CE/PE quotes (ATM Lab style). */
  board: NexusAtmBoard | null;
  ut3m: NexusUtSnapshot | null;
  ut5m: NexusUtSnapshot | null;
  lastSignal: NexusSignalDecision | null;
  settings: NexusPulseSettings;
  guard: NexusGuardState;
  openTrades: NexusPaperTrade[];
  closedTrades: NexusPaperTrade[];
  autoPaused: boolean;
};

export type NexusPulseStatus = {
  name: string;
  version: string;
  separateFromOthers: true;
  rules: string[];
  serverAt: string;
};
