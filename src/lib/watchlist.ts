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
  /**
   * Pinned rows stay on top (1 = first, 2 = second, …).
   * When sorting by change/exchange/etc., pinned stay first in pin order;
   * the rest of the list sorts normally underneath.
   */
  pinOrder?: number | null;
};

export type Watchlist = {
  id: string;
  name: string;
  symbols: WatchSymbol[];
  createdAt: string;
};

/** Always kept #1 and #2 on the primary (first) watchlist */
export const PRIMARY_PINNED: {
  symbol: string;
  exchange: Exchange;
  name: string;
  pinOrder: number;
}[] = [
  { symbol: 'NIFTY', exchange: 'NSE', name: 'Nifty 50', pinOrder: 1 },
  { symbol: 'SENSEX', exchange: 'BSE', name: 'BSE Sensex', pinOrder: 2 },
];

export const POPULAR_SYMBOLS: {
  symbol: string;
  exchange: Exchange;
  name: string;
  lastPrice: number;
  changePct: number;
}[] = [
  { symbol: 'NIFTY', exchange: 'NSE', name: 'Nifty 50', lastPrice: 24300, changePct: 0.34 },
  { symbol: 'BANKNIFTY', exchange: 'NSE', name: 'Nifty Bank', lastPrice: 52000, changePct: 0.28 },
  { symbol: 'SENSEX', exchange: 'BSE', name: 'BSE Sensex', lastPrice: 78000, changePct: 0.3 },
  { symbol: 'FINNIFTY', exchange: 'NSE', name: 'Nifty Financial Services', lastPrice: 26000, changePct: 0.2 },
  { symbol: 'MIDCPNIFTY', exchange: 'NSE', name: 'Nifty Midcap Select', lastPrice: 14000, changePct: 0.25 },
  { symbol: 'NIFTYNXT50', exchange: 'NSE', name: 'Nifty Next 50', lastPrice: 31000, changePct: 0.22 },
  { symbol: 'INDIAVIX', exchange: 'NSE', name: 'India VIX', lastPrice: 13.2, changePct: -1.1 },
  { symbol: 'NIFTYIT', exchange: 'NSE', name: 'Nifty IT', lastPrice: 29000, changePct: 0.15 },
  { symbol: 'RELIANCE', exchange: 'NSE', name: 'Reliance Industries', lastPrice: 2984.5, changePct: 0.42 },
  { symbol: 'TCS', exchange: 'NSE', name: 'Tata Consultancy', lastPrice: 3912.0, changePct: -0.18 },
  { symbol: 'INFY', exchange: 'NSE', name: 'Infosys', lastPrice: 1648.25, changePct: 0.65 },
  { symbol: 'HDFCBANK', exchange: 'NSE', name: 'HDFC Bank', lastPrice: 1702.1, changePct: 0.21 },
  { symbol: 'ICICIBANK', exchange: 'NSE', name: 'ICICI Bank', lastPrice: 1288.4, changePct: -0.35 },
  { symbol: 'SBIN', exchange: 'NSE', name: 'State Bank of India', lastPrice: 812.55, changePct: 0.88 },
  { symbol: 'BHARTIARTL', exchange: 'NSE', name: 'Bharti Airtel', lastPrice: 1865.0, changePct: 0.12 },
  { symbol: 'ITC', exchange: 'NSE', name: 'ITC Limited', lastPrice: 468.75, changePct: -0.22 },
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
  pinOrder?: number | null;
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
    pinOrder: input.pinOrder ?? null,
  };
}

export function isPinned(s: WatchSymbol): boolean {
  return typeof s.pinOrder === 'number' && s.pinOrder > 0;
}

export function isPrimaryCorePin(s: WatchSymbol): boolean {
  return PRIMARY_PINNED.some(
    (p) => p.symbol === s.symbol && p.exchange === s.exchange
  );
}

/** Ensure first watchlist always has NIFTY #1 and SENSEX #2 pinned on top. */
export function ensurePrimaryWatchlist(list: Watchlist): Watchlist {
  let symbols = [...list.symbols];
  let changed = false;

  for (const core of PRIMARY_PINNED) {
    const existing = symbols.find(
      (s) => s.symbol === core.symbol && s.exchange === core.exchange
    );
    if (!existing) {
      symbols.push(
        makeSymbol({
          symbol: core.symbol,
          exchange: core.exchange,
          name: core.name,
          pinOrder: core.pinOrder,
        })
      );
      changed = true;
    } else if (existing.pinOrder !== core.pinOrder) {
      symbols = symbols.map((s) =>
        s.id === existing.id ? { ...s, pinOrder: core.pinOrder } : s
      );
      changed = true;
    }
  }

  // Keep core pins at their reserved slots; renumber any extra user pins after 2
  const cores = PRIMARY_PINNED.map((c) =>
    symbols.find((s) => s.symbol === c.symbol && s.exchange === c.exchange)!
  );
  const extras = symbols
    .filter((s) => !isPrimaryCorePin(s) && isPinned(s))
    .sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
  const unpinned = symbols.filter((s) => !isPinned(s) && !isPrimaryCorePin(s));

  const renumberedExtras = extras.map((s, i) => ({
    ...s,
    pinOrder: 3 + i,
  }));

  const nextSymbols = [...cores, ...renumberedExtras, ...unpinned];
  const sameOrder =
    nextSymbols.length === list.symbols.length &&
    nextSymbols.every((s, i) => s.id === list.symbols[i]?.id && s.pinOrder === list.symbols[i]?.pinOrder);

  if (!changed && sameOrder) return list;
  return { ...list, symbols: nextSymbols };
}

/** Pinned rows first (by pinOrder); remaining rows keep incoming order (already sorted). */
export function applyPinPriority<T extends WatchSymbol>(rows: T[]): T[] {
  const pinned = rows
    .filter((r) => isPinned(r))
    .sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
  const rest = rows.filter((r) => !isPinned(r));
  return [...pinned, ...rest];
}

export function nextPinOrder(symbols: WatchSymbol[]): number {
  const max = symbols.reduce(
    (m, s) => (isPinned(s) ? Math.max(m, s.pinOrder || 0) : m),
    0
  );
  return Math.max(3, max + 1); // reserve 1–2 for NIFTY/SENSEX on primary
}
