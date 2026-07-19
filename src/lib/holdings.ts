import type { Exchange } from '@/lib/watchlist';

export type Holding = {
  id: string;
  symbol: string;
  exchange: Exchange;
  name: string;
  qty: number;
  avgPrice: number;
  /** Manual / sample last traded price until live feed */
  ltp: number;
  sector: string;
  notes: string;
  addedAt: string;
};

export type HoldingInput = Omit<Holding, 'id' | 'addedAt'>;

export const SECTORS = [
  'Banking',
  'IT',
  'Energy',
  'FMCG',
  'Pharma',
  'Auto',
  'Metal',
  'Telecom',
  'Index / ETF',
  'Other',
];

export function emptyHoldingInput(): HoldingInput {
  return {
    symbol: '',
    exchange: 'NSE',
    name: '',
    qty: 1,
    avgPrice: 0,
    ltp: 0,
    sector: 'Other',
    notes: '',
  };
}

export function holdingInvested(h: Pick<Holding, 'qty' | 'avgPrice'>): number {
  return h.qty * h.avgPrice;
}

export function holdingValue(h: Pick<Holding, 'qty' | 'ltp'>): number {
  return h.qty * h.ltp;
}

export function holdingPnL(h: Holding): number {
  return holdingValue(h) - holdingInvested(h);
}

export function holdingPnLPct(h: Holding): number {
  const inv = holdingInvested(h);
  if (inv <= 0) return 0;
  return (holdingPnL(h) / inv) * 100;
}

export function summarizeHoldings(holdings: Holding[]) {
  const invested = holdings.reduce((a, h) => a + holdingInvested(h), 0);
  const current = holdings.reduce((a, h) => a + holdingValue(h), 0);
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  const bySector = new Map<string, number>();
  for (const h of holdings) {
    const v = holdingValue(h);
    bySector.set(h.sector || 'Other', (bySector.get(h.sector || 'Other') || 0) + v);
  }
  const sectors = [...bySector.entries()]
    .map(([name, value]) => ({
      name,
      value,
      pct: current > 0 ? (value / current) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    count: holdings.length,
    invested,
    current,
    pnl,
    pnlPct,
    sectors,
  };
}
