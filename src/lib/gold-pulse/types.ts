import type { UtBotBar } from '@/lib/nexus-pulse/ut-bot';

export type GoldSide = 'LONG' | 'SHORT';

export type GoldExitReason =
  | 'SL'
  | 'TRAIL'
  | 'UT_ENTRY'
  | 'UT_HTF'
  | 'MANUAL'
  | 'EOD';

export type GoldPaperTrade = {
  id: string;
  openedAt: string;
  status: 'open' | 'closed';
  side: GoldSide;
  symbol: string;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  markPrice: number;
  highPrice: number;
  lowPrice: number;
  maxFavorableUsd: number;
  maxAdverseUsd: number;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: GoldExitReason;
  grossPnl?: number;
  netPnl?: number;
};

export type GoldUtSnap = {
  tf: string;
  keyValue: number;
  atrPeriod: number;
  bars: number;
  last: UtBotBar | null;
  prev: UtBotBar | null;
};

export type GoldSignal = {
  at: string;
  side: GoldSide | 'FLAT';
  reason: string;
  entryBuy: boolean;
  entrySell: boolean;
  htfPos: -1 | 0 | 1;
  newEntryEdge: boolean;
};

export type GoldPulseSession = {
  sessionDate: string;
  startedAt: string;
  updatedAt: string;
  spot: number;
  symbol: string;
  dataSource: 'yahoo';
  utEntry: GoldUtSnap | null;
  utHtf: GoldUtSnap | null;
  lastSignal: GoldSignal | null;
  openTrades: GoldPaperTrade[];
  closedTrades: GoldPaperTrade[];
  autoPaused: boolean;
  lastError?: string | null;
};
