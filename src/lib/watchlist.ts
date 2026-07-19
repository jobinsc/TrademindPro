export type Exchange = 'NSE' | 'BSE';

export type WatchSymbol = {
  id: string;
  symbol: string;
  exchange: Exchange;
  name: string;
  notes: string;
  addedAt: string;
  /** Demo last price until live broker feed is connected */
  lastPrice: number;
  changePct: number;
};

export type Watchlist = {
  id: string;
  name: string;
  symbols: WatchSymbol[];
  createdAt: string;
};

export const POPULAR_SYMBOLS: {
  symbol: string;
  exchange: Exchange;
  name: string;
  lastPrice: number;
  changePct: number;
}[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', name: 'Reliance Industries', lastPrice: 2984.5, changePct: 0.42 },
  { symbol: 'TCS', exchange: 'NSE', name: 'Tata Consultancy', lastPrice: 3912.0, changePct: -0.18 },
  { symbol: 'INFY', exchange: 'NSE', name: 'Infosys', lastPrice: 1648.25, changePct: 0.65 },
  { symbol: 'HDFCBANK', exchange: 'NSE', name: 'HDFC Bank', lastPrice: 1702.1, changePct: 0.21 },
  { symbol: 'ICICIBANK', exchange: 'NSE', name: 'ICICI Bank', lastPrice: 1288.4, changePct: -0.35 },
  { symbol: 'SBIN', exchange: 'NSE', name: 'State Bank of India', lastPrice: 812.55, changePct: 0.88 },
  { symbol: 'BHARTIARTL', exchange: 'NSE', name: 'Bharti Airtel', lastPrice: 1865.0, changePct: 0.12 },
  { symbol: 'ITC', exchange: 'NSE', name: 'ITC Limited', lastPrice: 468.75, changePct: -0.22 },
  { symbol: 'NIFTY 50', exchange: 'NSE', name: 'Nifty 50 Index', lastPrice: 24812.35, changePct: 0.34 },
  { symbol: 'BANKNIFTY', exchange: 'NSE', name: 'Bank Nifty Index', lastPrice: 52140.8, changePct: 0.28 },
];

export function emptyWatchlist(name = 'My Watchlist'): Watchlist {
  return {
    id: crypto.randomUUID(),
    name,
    symbols: [],
    createdAt: new Date().toISOString(),
  };
}

export function makeSymbol(input: {
  symbol: string;
  exchange: Exchange;
  name?: string;
  notes?: string;
  lastPrice?: number;
  changePct?: number;
}): WatchSymbol {
  const symbol = input.symbol.trim().toUpperCase();
  const popular = POPULAR_SYMBOLS.find((p) => p.symbol === symbol);
  return {
    id: crypto.randomUUID(),
    symbol,
    exchange: input.exchange,
    name: input.name?.trim() || popular?.name || symbol,
    notes: input.notes?.trim() || '',
    addedAt: new Date().toISOString(),
    lastPrice: input.lastPrice ?? popular?.lastPrice ?? 0,
    changePct: input.changePct ?? popular?.changePct ?? 0,
  };
}
