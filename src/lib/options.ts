export type OptionSide = 'CE' | 'PE';

export type OptionRow = {
  strike: number;
  ceLtp: number;
  ceOi: number;
  ceOiChange: number;
  ceIv: number;
  peLtp: number;
  peOi: number;
  peOiChange: number;
  peIv: number;
};

export type OptionsUnderlying = {
  id: string;
  symbol: string;
  name: string;
  spot: number;
  changePct: number;
  expiry: string;
};

export const UNDERLYINGS: OptionsUnderlying[] = [
  {
    id: 'nifty',
    symbol: 'NIFTY',
    name: 'Nifty 50',
    spot: 24812.35,
    changePct: 0.34,
    expiry: '2026-07-24',
  },
  {
    id: 'banknifty',
    symbol: 'BANKNIFTY',
    name: 'Bank Nifty',
    spot: 52140.8,
    changePct: 0.28,
    expiry: '2026-07-24',
  },
  {
    id: 'reliance',
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    spot: 2984.5,
    changePct: 0.42,
    expiry: '2026-07-31',
  },
];

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

/** Demo options chain — replaced by live NSE F&O feed later */
export function buildDemoChain(underlying: OptionsUnderlying): OptionRow[] {
  const step = underlying.symbol === 'BANKNIFTY' ? 100 : underlying.symbol === 'NIFTY' ? 50 : 20;
  const atm = roundTo(underlying.spot, step);
  const rows: OptionRow[] = [];

  for (let i = -5; i <= 5; i++) {
    const strike = atm + i * step;
    const dist = Math.abs(i);
    const ceLtp = Math.max(5, underlying.spot * 0.012 - dist * (step * 0.08) + (i < 0 ? 40 : 0));
    const peLtp = Math.max(5, underlying.spot * 0.012 - dist * (step * 0.08) + (i > 0 ? 40 : 0));
    rows.push({
      strike,
      ceLtp: Math.round(ceLtp * 100) / 100,
      ceOi: 1_200_000 - dist * 80_000 + (i === 0 ? 200_000 : 0),
      ceOiChange: (3 - dist) * 15_000 * (i <= 0 ? 1 : -1),
      ceIv: 12 + dist * 1.4 + (i < 0 ? 2 : 0),
      peLtp: Math.round(peLtp * 100) / 100,
      peOi: 1_100_000 - dist * 70_000 + (i === 0 ? 180_000 : 0),
      peOiChange: (3 - dist) * 12_000 * (i >= 0 ? 1 : -1),
      peIv: 13 + dist * 1.3 + (i > 0 ? 2 : 0),
    });
  }
  return rows;
}

export function calcPcr(rows: OptionRow[]): number {
  const peOi = rows.reduce((a, r) => a + r.peOi, 0);
  const ceOi = rows.reduce((a, r) => a + r.ceOi, 0);
  if (ceOi <= 0) return 0;
  return Math.round((peOi / ceOi) * 100) / 100;
}

/** Simple max-pain estimate: strike with min combined OI * distance cost */
export function calcMaxPain(rows: OptionRow[]): number {
  let best = rows[0]?.strike ?? 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of rows) {
    let score = 0;
    for (const r of rows) {
      const cePay = Math.max(0, r.strike - candidate.strike) * r.ceOi;
      const pePay = Math.max(0, candidate.strike - r.strike) * r.peOi;
      score += cePay + pePay;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate.strike;
    }
  }
  return best;
}

export function avgIv(rows: OptionRow[]): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((a, r) => a + (r.ceIv + r.peIv) / 2, 0);
  return Math.round((sum / rows.length) * 10) / 10;
}
