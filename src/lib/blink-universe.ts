/**
 * Blink underlying universe — Nifty 50 index + Nifty 50 stock F&O names.
 * Lot sizes & strike steps are approximate (for backtest simulation).
 */

export type BlinkUnderlying = {
  symbol: string;
  exchange: 'NSE';
  name: string;
  kind: 'index' | 'stock';
  lotSize: number;
  strikeStep: number;
};

export const BLINK_NIFTY_INDEX: BlinkUnderlying = {
  symbol: 'NIFTY',
  exchange: 'NSE',
  name: 'Nifty 50 Index',
  kind: 'index',
  lotSize: 65,
  strikeStep: 50,
};

/** Nifty 50 constituents (F&O liquid names) */
export const BLINK_NIFTY50_STOCKS: BlinkUnderlying[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', name: 'Reliance Industries', kind: 'stock', lotSize: 250, strikeStep: 20 },
  { symbol: 'TCS', exchange: 'NSE', name: 'Tata Consultancy', kind: 'stock', lotSize: 150, strikeStep: 50 },
  { symbol: 'HDFCBANK', exchange: 'NSE', name: 'HDFC Bank', kind: 'stock', lotSize: 550, strikeStep: 20 },
  { symbol: 'ICICIBANK', exchange: 'NSE', name: 'ICICI Bank', kind: 'stock', lotSize: 700, strikeStep: 10 },
  { symbol: 'INFY', exchange: 'NSE', name: 'Infosys', kind: 'stock', lotSize: 400, strikeStep: 20 },
  { symbol: 'ITC', exchange: 'NSE', name: 'ITC', kind: 'stock', lotSize: 1600, strikeStep: 5 },
  { symbol: 'LT', exchange: 'NSE', name: 'Larsen & Toubro', kind: 'stock', lotSize: 150, strikeStep: 50 },
  { symbol: 'SBIN', exchange: 'NSE', name: 'State Bank of India', kind: 'stock', lotSize: 750, strikeStep: 5 },
  { symbol: 'BHARTIARTL', exchange: 'NSE', name: 'Bharti Airtel', kind: 'stock', lotSize: 475, strikeStep: 20 },
  { symbol: 'KOTAKBANK', exchange: 'NSE', name: 'Kotak Mahindra Bank', kind: 'stock', lotSize: 400, strikeStep: 20 },
  { symbol: 'HINDUNILVR', exchange: 'NSE', name: 'Hindustan Unilever', kind: 'stock', lotSize: 300, strikeStep: 20 },
  { symbol: 'AXISBANK', exchange: 'NSE', name: 'Axis Bank', kind: 'stock', lotSize: 625, strikeStep: 10 },
  { symbol: 'ASIANPAINT', exchange: 'NSE', name: 'Asian Paints', kind: 'stock', lotSize: 200, strikeStep: 50 },
  { symbol: 'MARUTI', exchange: 'NSE', name: 'Maruti Suzuki', kind: 'stock', lotSize: 50, strikeStep: 100 },
  { symbol: 'SUNPHARMA', exchange: 'NSE', name: 'Sun Pharma', kind: 'stock', lotSize: 350, strikeStep: 20 },
  { symbol: 'TITAN', exchange: 'NSE', name: 'Titan', kind: 'stock', lotSize: 175, strikeStep: 50 },
  { symbol: 'BAJFINANCE', exchange: 'NSE', name: 'Bajaj Finance', kind: 'stock', lotSize: 125, strikeStep: 100 },
  { symbol: 'WIPRO', exchange: 'NSE', name: 'Wipro', kind: 'stock', lotSize: 1500, strikeStep: 5 },
  { symbol: 'ULTRACEMCO', exchange: 'NSE', name: 'UltraTech Cement', kind: 'stock', lotSize: 50, strikeStep: 100 },
  { symbol: 'HCLTECH', exchange: 'NSE', name: 'HCL Tech', kind: 'stock', lotSize: 350, strikeStep: 20 },
  { symbol: 'NTPC', exchange: 'NSE', name: 'NTPC', kind: 'stock', lotSize: 1500, strikeStep: 5 },
  { symbol: 'POWERGRID', exchange: 'NSE', name: 'Power Grid', kind: 'stock', lotSize: 1900, strikeStep: 2.5 },
  { symbol: 'ONGC', exchange: 'NSE', name: 'ONGC', kind: 'stock', lotSize: 1900, strikeStep: 2.5 },
  { symbol: 'M&M', exchange: 'NSE', name: 'Mahindra & Mahindra', kind: 'stock', lotSize: 200, strikeStep: 50 },
  { symbol: 'ADANIENT', exchange: 'NSE', name: 'Adani Enterprises', kind: 'stock', lotSize: 300, strikeStep: 50 },
  { symbol: 'TATAMOTORS', exchange: 'NSE', name: 'Tata Motors', kind: 'stock', lotSize: 550, strikeStep: 10 },
  { symbol: 'JSWSTEEL', exchange: 'NSE', name: 'JSW Steel', kind: 'stock', lotSize: 675, strikeStep: 10 },
  { symbol: 'TATASTEEL', exchange: 'NSE', name: 'Tata Steel', kind: 'stock', lotSize: 550, strikeStep: 10 },
  { symbol: 'INDUSINDBK', exchange: 'NSE', name: 'IndusInd Bank', kind: 'stock', lotSize: 500, strikeStep: 20 },
  { symbol: 'TECHM', exchange: 'NSE', name: 'Tech Mahindra', kind: 'stock', lotSize: 600, strikeStep: 20 },
  { symbol: 'NESTLEIND', exchange: 'NSE', name: 'Nestle India', kind: 'stock', lotSize: 25, strikeStep: 100 },
  { symbol: 'BAJAJFINSV', exchange: 'NSE', name: 'Bajaj Finserv', kind: 'stock', lotSize: 500, strikeStep: 50 },
  { symbol: 'HDFCLIFE', exchange: 'NSE', name: 'HDFC Life', kind: 'stock', lotSize: 1100, strikeStep: 5 },
  { symbol: 'SBILIFE', exchange: 'NSE', name: 'SBI Life', kind: 'stock', lotSize: 375, strikeStep: 20 },
  { symbol: 'APOLLOHOSP', exchange: 'NSE', name: 'Apollo Hospitals', kind: 'stock', lotSize: 125, strikeStep: 50 },
  { symbol: 'DIVISLAB', exchange: 'NSE', name: 'Divi\'s Laboratories', kind: 'stock', lotSize: 100, strikeStep: 50 },
  { symbol: 'DRREDDY', exchange: 'NSE', name: 'Dr Reddy\'s', kind: 'stock', lotSize: 125, strikeStep: 50 },
  { symbol: 'CIPLA', exchange: 'NSE', name: 'Cipla', kind: 'stock', lotSize: 650, strikeStep: 10 },
  { symbol: 'EICHERMOT', exchange: 'NSE', name: 'Eicher Motors', kind: 'stock', lotSize: 175, strikeStep: 50 },
  { symbol: 'GRASIM', exchange: 'NSE', name: 'Grasim', kind: 'stock', lotSize: 250, strikeStep: 20 },
  { symbol: 'HINDALCO', exchange: 'NSE', name: 'Hindalco', kind: 'stock', lotSize: 1400, strikeStep: 5 },
  { symbol: 'BRITANNIA', exchange: 'NSE', name: 'Britannia', kind: 'stock', lotSize: 125, strikeStep: 50 },
  { symbol: 'COALINDIA', exchange: 'NSE', name: 'Coal India', kind: 'stock', lotSize: 1350, strikeStep: 5 },
  { symbol: 'HEROMOTOCO', exchange: 'NSE', name: 'Hero MotoCorp', kind: 'stock', lotSize: 150, strikeStep: 50 },
  { symbol: 'BPCL', exchange: 'NSE', name: 'BPCL', kind: 'stock', lotSize: 1800, strikeStep: 5 },
  { symbol: 'ADANIPORTS', exchange: 'NSE', name: 'Adani Ports', kind: 'stock', lotSize: 400, strikeStep: 20 },
  { symbol: 'TATACONSUM', exchange: 'NSE', name: 'Tata Consumer', kind: 'stock', lotSize: 550, strikeStep: 10 },
  { symbol: 'BEL', exchange: 'NSE', name: 'BEL', kind: 'stock', lotSize: 2850, strikeStep: 5 },
  { symbol: 'SHRIRAMFIN', exchange: 'NSE', name: 'Shriram Finance', kind: 'stock', lotSize: 825, strikeStep: 10 },
  { symbol: 'BAJAJ-AUTO', exchange: 'NSE', name: 'Bajaj Auto', kind: 'stock', lotSize: 75, strikeStep: 100 },
  { symbol: 'TRENT', exchange: 'NSE', name: 'Trent', kind: 'stock', lotSize: 100, strikeStep: 50 },
];

export const BLINK_ALL_UNDERLYINGS: BlinkUnderlying[] = [
  BLINK_NIFTY_INDEX,
  ...BLINK_NIFTY50_STOCKS,
];

const BY_SYMBOL = new Map(BLINK_ALL_UNDERLYINGS.map((u) => [u.symbol, u]));

export function blinkUnderlying(symbol: string): BlinkUnderlying {
  const key = symbol.trim().toUpperCase();
  return BY_SYMBOL.get(key) ?? BLINK_NIFTY_INDEX;
}

/** Backtest / P&L qty per lot: Nifty options = 65, stocks = 1 */
export function blinkDefaultLotSize(symbol: string): number {
  return blinkUnderlying(symbol).kind === 'index' ? 65 : 1;
}

/** Total traded units = lot size × number of lots */
export function blinkTradeQty(symbol: string, lots: number): number {
  return blinkDefaultLotSize(symbol) * Math.max(1, lots);
}

/**
 * Brokerage per lot scaled to qty — Nifty 65-lot ≈ ₹175; qty 1 stock ≈ ₹20.
 * Prevents absurd ₹523/day losses from Nifty brokerage on 1-unit stock backtests.
 */
export function blinkDefaultBrokerage(symbol: string, lotSize?: number): number {
  const u = blinkUnderlying(symbol);
  const qty = Math.max(1, lotSize ?? blinkDefaultLotSize(symbol));
  if (u.kind === 'index') {
    return Math.max(20, Math.round(175 * (qty / 65)));
  }
  return Math.max(10, Math.round(20 * qty));
}

/** Exchange F&O lot (info only — backtest uses blinkDefaultLotSize for stocks) */
export function blinkFoLotSize(symbol: string): number {
  return blinkUnderlying(symbol).lotSize;
}

export function blinkUnderlyingLabel(symbol: string): string {
  return blinkUnderlying(symbol).name;
}

export function blinkStrikeStep(symbol: string, spot?: number): number {
  const meta = blinkUnderlying(symbol);
  if (meta.strikeStep > 0) return meta.strikeStep;
  if (!spot) return 50;
  if (spot < 500) return 5;
  if (spot < 2000) return 20;
  if (spot < 5000) return 50;
  return 100;
}

/** Live Upstox option LTP is wired for Nifty index only today */
export function blinkSupportsLiveOptions(symbol: string): boolean {
  return blinkUnderlying(symbol).kind === 'index';
}

export function isBlinkNifty50Stock(symbol: string): boolean {
  return blinkUnderlying(symbol).kind === 'stock';
}
