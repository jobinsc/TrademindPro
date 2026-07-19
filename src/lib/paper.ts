export type PaperSide = 'BUY' | 'SELL';

export type PaperTrade = {
  id: string;
  symbol: string;
  side: PaperSide;
  qty: number;
  entryPrice: number;
  exitPrice: number | null;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
};

export type PaperAccount = {
  cash: number;
  startingCash: number;
};

export function defaultPaperAccount(): PaperAccount {
  return { cash: 100000, startingCash: 100000 };
}

export function paperPnL(t: PaperTrade): number | null {
  if (t.exitPrice == null) return null;
  const diff = t.exitPrice - t.entryPrice;
  const signed = t.side === 'BUY' ? diff : -diff;
  return signed * t.qty;
}

export function summarizePaper(trades: PaperTrade[], account: PaperAccount) {
  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');
  const realized = closed.reduce((a, t) => a + (paperPnL(t) || 0), 0);
  const openCost = open.reduce((a, t) => a + t.qty * t.entryPrice, 0);
  return {
    openCount: open.length,
    closedCount: closed.length,
    realized,
    cash: account.cash,
    equityApprox: account.cash + openCost + realized * 0, // cash already reflects closed; open still uses cash reserved
    startingCash: account.startingCash,
  };
}
