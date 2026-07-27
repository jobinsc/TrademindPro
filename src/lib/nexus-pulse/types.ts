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

export type NexusPulseSession = {
  sessionDate: string;
  startedAt: string;
  updatedAt: string;
  spot: number;
  ut3m: NexusUtSnapshot | null;
  ut5m: NexusUtSnapshot | null;
  lastSignal: NexusSignalDecision | null;
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
