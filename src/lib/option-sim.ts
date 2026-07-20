/**
 * Nifty option premium simulation for lab backtests (no historical chain).
 * Maps spot moves → premium via delta; supports ATM / ITM / OTM strikes.
 */

import { roundPremium } from '@/lib/paper-exit';

export type OptionMoneyness = 'atm' | 'itm' | 'otm';
export type OptionSide = 'CE' | 'PE';

const STRIKE_STEP = 50;

export function roundStrike(spot: number): number {
  return Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
}

/** Pick strike from spot, side, and moneyness */
export function pickOptionStrike(
  spot: number,
  side: OptionSide,
  moneyness: OptionMoneyness = 'atm'
): number {
  const atm = roundStrike(spot);
  if (moneyness === 'atm') return atm;
  if (side === 'CE') {
    return moneyness === 'itm' ? atm - STRIKE_STEP : atm + STRIKE_STEP;
  }
  return moneyness === 'itm' ? atm + STRIKE_STEP : atm - STRIKE_STEP;
}

/** Minutes since 09:15 IST (cash open) */
export function istMinutesFromOpen(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const istMin = (utcMin + 330) % (24 * 60);
  return istMin - (9 * 60 + 15);
}

/** Wall-clock minutes in IST (0 = midnight) */
export function istMinutesOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMin + 330) % (24 * 60);
}

export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True if candle time is inside [start, end] IST, e.g. 09:20–11:30 */
export function inTradeWindow(iso: string, startHm: string, endHm: string): boolean {
  const m = istMinutesOfDay(iso);
  if (m == null) return true;
  const s = parseHm(startHm);
  const e = parseHm(endHm);
  return m >= s && m <= e;
}

/** Rough CE delta from moneyness (0.25–0.75 for scalps) */
export function estimateCeDelta(spot: number, strike: number): number {
  const diff = (spot - strike) / Math.max(spot, 1);
  if (Math.abs(diff) < 0.001) return 0.5;
  if (diff > 0.015) return 0.68;
  if (diff > 0.005) return 0.58;
  if (diff < -0.015) return 0.32;
  if (diff < -0.005) return 0.42;
  return 0.5 + diff * 8;
}

export function estimateOptionDelta(
  spot: number,
  strike: number,
  side: OptionSide
): number {
  const ce = estimateCeDelta(spot, strike);
  return side === 'CE' ? ce : ce - 1;
}

/** Model entry premium (₹) — intrinsic + time value */
export function modelEntryPremium(
  spot: number,
  strike: number,
  side: OptionSide,
  minutesFromOpen: number | null
): number {
  const intrinsic =
    side === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const otmDist = Math.abs(spot - strike);
  const mins = minutesFromOpen ?? 120;
  const timeDecay = Math.max(0, mins * 0.015);
  const baseTv = Math.max(6, 42 - otmDist * 0.06 - timeDecay);
  const moneynessBoost = side === 'CE' && spot > strike ? 1.05 : side === 'PE' && spot < strike ? 1.05 : 1;
  return roundPremium(Math.max(1, (intrinsic + baseTv) * moneynessBoost));
}

/** One bar premium step from spot change */
export function premiumStep(
  prevPremium: number,
  prevSpot: number,
  newSpot: number,
  strike: number,
  side: OptionSide
): number {
  const delta = estimateOptionDelta(prevSpot, strike, side);
  const dSpot = newSpot - prevSpot;
  const change = delta * dSpot;
  const next = prevPremium + change;
  return roundPremium(Math.max(0.5, next));
}

export const TRADE_WINDOW_PRESETS: { id: string; label: string; start: string; end: string }[] = [
  { id: 'full', label: 'Full session (09:20–15:15)', start: '09:20', end: '15:15' },
  { id: 'open', label: 'Opening drive (09:20–11:30)', start: '09:20', end: '11:30' },
  { id: 'mid', label: 'Midday (11:30–13:30)', start: '11:30', end: '13:30' },
  { id: 'close', label: 'Power hour (13:30–15:15)', start: '13:30', end: '15:15' },
];
