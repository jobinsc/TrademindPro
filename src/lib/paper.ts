import {
  getBrokeragePerLot,
  netAfterBrokerage,
  paperBrokerage,
  PAPER_BROKERAGE_PER_LOT,
} from '@/lib/brokerage';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';

export type PaperSide = 'BUY' | 'SELL';
export type PaperMode = 'manual' | 'auto';
export type PaperInstrument = 'NIFTY' | 'BANKNIFTY' | 'STOCK' | 'OPTION';

export type PaperTrade = {
  id: string;
  mode: PaperMode;
  instrument: PaperInstrument;
  symbol: string;
  side: PaperSide;
  /** Lots for F&O, shares for stock */
  qty: number;
  entryPrice: number;
  exitPrice: number | null;
  /** Nifty/BankNifty option leg */
  optionType?: 'CE' | 'PE' | null;
  strike?: number | null;
  strategyId?: CatalogStrategyId | string;
  timeframe?: string;
  targetPoints?: number;
  stopLossPoints?: number;
  trailingStopPoints?: number;
  trailingActivatePoints?: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  brokerage?: number | null;
  grossPnl?: number | null;
  note?: string;
  /** Full company name for stock paper trades */
  stockName?: string;
  exchange?: 'NSE' | 'BSE';
};

export type PaperAccount = {
  cash: number;
  startingCash: number;
};

export type PaperTradeInput = {
  mode?: PaperMode;
  instrument: PaperInstrument;
  symbol: string;
  side: PaperSide;
  qty: number;
  entryPrice: number;
  optionType?: 'CE' | 'PE' | null;
  strike?: number | null;
  strategyId?: CatalogStrategyId | string;
  timeframe?: string;
  targetPoints?: number;
  stopLossPoints?: number;
  trailingStopPoints?: number;
  trailingActivatePoints?: number;
  note?: string;
  stockName?: string;
  exchange?: 'NSE' | 'BSE';
  brokeragePerLot?: number;
};

export { PAPER_BROKERAGE_PER_LOT };

export function defaultPaperAccount(): PaperAccount {
  return { cash: 100000, startingCash: 100000 };
}

/** Gross P&L before brokerage */
export function paperGrossPnL(t: PaperTrade): number | null {
  if (t.exitPrice == null) return null;
  const diff = t.exitPrice - t.entryPrice;
  const signed = t.side === 'BUY' ? diff : -diff;
  return Math.round(signed * t.qty);
}

/** Net P&L after brokerage */
export function paperPnL(t: PaperTrade, perLot?: number): number | null {
  if (t.exitPrice == null) return null;
  if (t.grossPnl != null && t.brokerage != null) {
    return Math.round(t.grossPnl - t.brokerage);
  }
  const gross = paperGrossPnL(t);
  if (gross == null) return null;
  const lots = Math.max(1, Math.floor(t.qty) || 1);
  return netAfterBrokerage(gross, lots, perLot ?? getBrokeragePerLot());
}

export function closePaperTradeWithBrokerage(
  trade: PaperTrade,
  exitPrice: number,
  perLot?: number
): PaperTrade {
  const closed: PaperTrade = {
    ...trade,
    exitPrice,
    status: 'closed',
    closedAt: new Date().toISOString(),
  };
  const gross = paperGrossPnL(closed) ?? 0;
  const lots = Math.max(1, Math.floor(trade.qty) || 1);
  const rate = perLot ?? getBrokeragePerLot();
  const brokerage = paperBrokerage(lots, rate);
  return {
    ...closed,
    grossPnl: Math.round(gross),
    brokerage,
  };
}

export function summarizePaper(trades: PaperTrade[], account: PaperAccount) {
  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');
  const realized = closed.reduce((a, t) => a + (paperPnL(t) || 0), 0);
  const brokeragePaid = closed.reduce((a, t) => {
    if (t.brokerage != null) return a + t.brokerage;
    return a + paperBrokerage(Math.max(1, Math.floor(t.qty) || 1));
  }, 0);
  const openCost = open.reduce((a, t) => a + t.qty * t.entryPrice, 0);
  return {
    openCount: open.length,
    closedCount: closed.length,
    realized,
    brokeragePaid,
    cash: account.cash,
    equityApprox: account.cash + openCost,
    startingCash: account.startingCash,
  };
}
