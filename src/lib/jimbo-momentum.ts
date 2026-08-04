/**
 * Jimbo opening / intraday momentum shortlist.
 * Rank liquid F&O names by thrust vs prev close + vs open — no candle wait.
 */

import type { LiquidStock } from '@/lib/jimbo';

export type MomentumSide = 'UP' | 'DOWN';

export type MomentumQuote = {
  lastPrice: number;
  open: number;
  changePct: number | null;
  change: number | null;
};

export type MomentumRow = {
  symbol: string;
  name: string;
  lotSize: number;
  liquidityRank: number;
  lastPrice: number;
  open: number;
  changePct: number;
  fromOpenPct: number;
  /** Combined thrust score (signed: + up, − down) */
  score: number;
  side: MomentumSide;
  /** Suggested ATM options bias for a quick scalp */
  optionBias: 'CE' | 'PE';
};

const FOCUS_KEY = 'trademindpro_jimbo_momentum_focus_v1';

export function readMomentumFocus(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.map((s) => String(s).toUpperCase()).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function writeMomentumFocus(symbols: string[]) {
  try {
    localStorage.setItem(
      FOCUS_KEY,
      JSON.stringify([...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 20))
    );
  } catch {
    /* ignore */
  }
}

/**
 * Score = blend of day % vs prev close + % vs today's open.
 * Same-direction open thrust is rewarded; fighting open is downgraded.
 */
export function scoreMomentumQuote(q: MomentumQuote): {
  changePct: number;
  fromOpenPct: number;
  score: number;
} | null {
  const ltp = Number(q.lastPrice);
  const open = Number(q.open);
  if (!(ltp > 0)) return null;
  const changePct =
    typeof q.changePct === 'number' && Number.isFinite(q.changePct)
      ? q.changePct
      : open > 0
        ? ((ltp - open) / open) * 100
        : 0;
  const fromOpenPct = open > 0 ? ((ltp - open) / open) * 100 : 0;

  // Prefer continuation vs open (classic opening drive)
  let score = changePct * 0.55 + fromOpenPct * 0.45;
  if (changePct > 0 && fromOpenPct < 0) score *= 0.55; // gap up fading
  if (changePct < 0 && fromOpenPct > 0) score *= 0.55; // gap down covering
  return { changePct, fromOpenPct, score };
}

export function rankLiquidMomentum(
  universe: LiquidStock[],
  quotes: Record<string, MomentumQuote>,
  topN = 5
): { up: MomentumRow[]; down: MomentumRow[] } {
  const rows: MomentumRow[] = [];
  for (const stock of universe) {
    const q = quotes[stock.symbol];
    if (!q) continue;
    const scored = scoreMomentumQuote(q);
    if (!scored) continue;
    const side: MomentumSide = scored.score >= 0 ? 'UP' : 'DOWN';
    rows.push({
      symbol: stock.symbol,
      name: stock.name,
      lotSize: stock.lotSize,
      liquidityRank: stock.liquidityRank,
      lastPrice: q.lastPrice,
      open: q.open > 0 ? q.open : q.lastPrice,
      changePct: scored.changePct,
      fromOpenPct: scored.fromOpenPct,
      score: scored.score,
      side,
      optionBias: side === 'UP' ? 'CE' : 'PE',
    });
  }

  const up = [...rows]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  const down = [...rows]
    .filter((r) => r.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, topN);

  return { up, down };
}
