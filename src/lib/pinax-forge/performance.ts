/**
 * PinaxForge performance summary from paper trades.
 */

import type { PinaxPaperTrade, PinaxPerformanceSummary } from '@/lib/pinax-forge/types';

export function summarizePinaxPerformance(
  openTrades: PinaxPaperTrade[],
  closedTrades: PinaxPaperTrade[]
): PinaxPerformanceSummary {
  const wins = closedTrades.filter((t) => (t.netPnl ?? 0) > 0).length;
  const losses = closedTrades.filter((t) => (t.netPnl ?? 0) <= 0).length;
  const closed = closedTrades.length;
  const grossPnl = closedTrades.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
  const netPnl = closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const rrHits: Record<string, number> = { '1': 0, '1.5': 0, '2': 0 };

  for (const t of closedTrades) {
    if (t.exitReason === 'TARGET' && t.rrAchieved != null) {
      const key = String(t.rrAchieved);
      rrHits[key] = (rrHits[key] ?? 0) + 1;
    }
  }

  return {
    closedTrades: closed,
    openTrades: openTrades.length,
    wins,
    losses,
    winRate: closed > 0 ? Math.round((wins / closed) * 1000) / 10 : 0,
    grossPnl: Math.round(grossPnl * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
    expectancy: closed > 0 ? Math.round((netPnl / closed) * 100) / 100 : 0,
    rrHits,
  };
}
