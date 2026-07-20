/**
 * Paper-trading brokerage (round-trip cost per lot).
 * Rate is editable in Nejoic / Paper settings (default ₹175).
 */

export const DEFAULT_BROKERAGE_PER_LOT = 175;

const LS_KEY = 'trademindpro_brokerage_per_lot_v1';

/** Read saved rate (shared across Nejoic + Paper). */
export function getBrokeragePerLot(): number {
  if (typeof window === 'undefined') return DEFAULT_BROKERAGE_PER_LOT;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  } catch {
    /* ignore */
  }
  // Fallback: Nejoic settings blob
  try {
    const raw = localStorage.getItem('trademindpro_nejoic_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { settings?: { brokeragePerLot?: number } };
      const n = Number(parsed.settings?.brokeragePerLot);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_BROKERAGE_PER_LOT;
}

export function setBrokeragePerLot(rupees: number): number {
  const n = Math.max(0, Math.round(Number(rupees) || 0));
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, String(n));
  }
  return n;
}

/** @deprecated use getBrokeragePerLot() — kept as default constant */
export const PAPER_BROKERAGE_PER_LOT = DEFAULT_BROKERAGE_PER_LOT;

/** Round-trip brokerage for N lots. */
export function paperBrokerage(lots: number, perLot?: number): number {
  const n = Math.max(1, Math.floor(Number(lots) || 1));
  const rate =
    perLot != null && Number.isFinite(perLot) && perLot >= 0
      ? Math.round(perLot)
      : getBrokeragePerLot();
  return rate * n;
}

/** Gross P&L minus brokerage. */
export function netAfterBrokerage(
  grossPnl: number,
  lots: number,
  perLot?: number
): number {
  return Math.round(grossPnl - paperBrokerage(lots, perLot));
}
