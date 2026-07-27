/**
 * PinaxForge setup tuning — learns from closed paper trades across recent sessions.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { PinaxPaperTrade, PinaxSetupKind, PinaxTuningProfile } from '@/lib/pinax-forge/types';
import { dayAdd, istDate } from '@/lib/pinax-forge/ist';
import { loadPinaxSession } from '@/lib/pinax-forge/session-store';

const DATA_DIR = path.join(process.cwd(), '.data');
const BASE_CONFIDENCE = 70;
const LOOKBACK_DAYS = 14;

export function defaultTuningProfile(): PinaxTuningProfile {
  return {
    updatedAt: new Date().toISOString(),
    sampleTrades: 0,
    minConfidence: BASE_CONFIDENCE,
    kindBonus: {
      BREAK_RETEST: 0,
      REJECTION_WICK: 0,
      STRUCTURE_HL_LH_PLUS_LEVEL: 0,
    },
    kindStats: {
      BREAK_RETEST: { wins: 0, losses: 0, winRate: 0 },
      REJECTION_WICK: { wins: 0, losses: 0, winRate: 0 },
      STRUCTURE_HL_LH_PLUS_LEVEL: { wins: 0, losses: 0, winRate: 0 },
    },
    notes: ['Default thresholds — need more closed paper trades to tune.'],
  };
}

async function listSessionDates(): Promise<string[]> {
  try {
    const files = await fs.readdir(DATA_DIR);
    return files
      .filter((f) => f.startsWith('pinax-forge-session-') && f.endsWith('.json'))
      .map((f) => f.replace('pinax-forge-session-', '').replace('.json', ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  } catch {
    return [];
  }
}

function kindFromTrade(t: PinaxPaperTrade): PinaxSetupKind {
  return t.setupKind;
}

export async function buildPinaxTuningProfile(
  throughDate = istDate()
): Promise<PinaxTuningProfile> {
  const fromDate = dayAdd(throughDate, -LOOKBACK_DAYS);
  const dates = (await listSessionDates()).filter((d) => d >= fromDate && d <= throughDate);

  const stats: Record<
    PinaxSetupKind,
    { wins: number; losses: number }
  > = {
    BREAK_RETEST: { wins: 0, losses: 0 },
    REJECTION_WICK: { wins: 0, losses: 0 },
    STRUCTURE_HL_LH_PLUS_LEVEL: { wins: 0, losses: 0 },
  };

  let totalClosed = 0;
  for (const d of dates) {
    const session = await loadPinaxSession(d);
    if (!session) continue;
    for (const t of session.closedTrades) {
      totalClosed += 1;
      const k = kindFromTrade(t);
      if ((t.netPnl ?? 0) > 0) stats[k].wins += 1;
      else stats[k].losses += 1;
    }
  }

  if (totalClosed < 3) {
    return defaultTuningProfile();
  }

  const kindStats = {} as PinaxTuningProfile['kindStats'];
  const kindBonus = {} as PinaxTuningProfile['kindBonus'];
  const notes: string[] = [];
  let minConfidence = BASE_CONFIDENCE;

  for (const kind of Object.keys(stats) as PinaxSetupKind[]) {
    const { wins, losses } = stats[kind];
    const n = wins + losses;
    const winRate = n > 0 ? Math.round((wins / n) * 1000) / 10 : 0;
    kindStats[kind] = { wins, losses, winRate };

    if (n >= 2) {
      if (winRate >= 60) {
        kindBonus[kind] = -4;
        notes.push(`${kind}: ${winRate}% win (${n} trades) — slightly easier to TAKE`);
      } else if (winRate <= 35) {
        kindBonus[kind] = 8;
        notes.push(`${kind}: ${winRate}% win (${n} trades) — raised bar`);
      }
    }
  }

  const overallWins = Object.values(stats).reduce((s, x) => s + x.wins, 0);
  const overallRate = Math.round((overallWins / totalClosed) * 1000) / 10;
  if (overallRate < 45) {
    minConfidence = BASE_CONFIDENCE + 6;
    notes.push(`Overall win rate ${overallRate}% — min confidence raised to ${minConfidence}`);
  } else if (overallRate > 55) {
    minConfidence = Math.max(65, BASE_CONFIDENCE - 2);
    notes.push(`Overall win rate ${overallRate}% — min confidence ${minConfidence}`);
  }

  if (!notes.length) notes.push(`Based on ${totalClosed} closed trades across ${dates.length} days.`);

  return {
    updatedAt: new Date().toISOString(),
    sampleTrades: totalClosed,
    minConfidence,
    kindBonus,
    kindStats,
    notes,
  };
}

export function applyTuningToConfidence(
  kind: PinaxSetupKind,
  rawConfidence: number,
  tuning: PinaxTuningProfile
): number {
  return Math.min(95, Math.max(40, rawConfidence + (tuning.kindBonus[kind] ?? 0)));
}

export function tuningTakeDecision(
  kind: PinaxSetupKind,
  adjustedConfidence: number,
  aligned: boolean,
  tuning: PinaxTuningProfile
): { decision: 'TAKE' | 'SKIP'; skipReason?: string } {
  if (!aligned) {
    return { decision: 'SKIP', skipReason: 'Against desk bias' };
  }
  if (adjustedConfidence >= tuning.minConfidence) {
    return { decision: 'TAKE' };
  }
  return {
    decision: 'SKIP',
    skipReason: `Confidence ${adjustedConfidence}% below tuned minimum ${tuning.minConfidence}%`,
  };
}

export function setupBlockKey(kind: PinaxSetupKind, side: 'CE' | 'PE', level: number): string {
  return `${kind}:${side}:${Math.round(level)}`;
}

export function isSetupBlocked(
  kind: PinaxSetupKind,
  side: 'CE' | 'PE',
  level: number,
  blocked: string[]
): boolean {
  return blocked.includes(setupBlockKey(kind, side, level));
}
