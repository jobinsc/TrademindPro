/**
 * PinaxForge 1m setup engine — break+retest, rejection wick, structure+level.
 */

import type { Candle } from '@/lib/nejoic';
import { runPriceAction } from '@/lib/price-action';
import type { DeskBias, TradingZone } from '@/lib/pinax-forge/morning-desk';
import { istCalendarDate, istDate } from '@/lib/pinax-forge/ist';
import {
  applyTuningToConfidence,
  isSetupBlocked,
  tuningTakeDecision,
} from '@/lib/pinax-forge/tuning';
import type { PinaxSetupKind, PinaxSetupSignal, PinaxTuningProfile } from '@/lib/pinax-forge/types';

const LEVEL_TOLERANCE = 12;
const RETEST_BARS = 8;
/** Min today's bars — allow open-window setups (never use prior-day candles). */
const MIN_SESSION_BARS = 8;

function nearLevel(price: number, level: number, tol = LEVEL_TOLERANCE): boolean {
  return Math.abs(price - level) <= tol;
}

function inZone(price: number, zone: TradingZone): boolean {
  return price >= zone.low && price <= zone.high;
}

function detectBreakRetest(
  bars: Candle[],
  level: number,
  side: 'CE' | 'PE'
): { hit: boolean; confidence: number; reasons: string[] } {
  if (bars.length < RETEST_BARS + 2) {
    return { hit: false, confidence: 0, reasons: [] };
  }
  const recent = bars.slice(-RETEST_BARS);
  const last = recent[recent.length - 1];
  const reasons: string[] = [];

  if (side === 'CE') {
    const broke = recent.some((b) => b.close > level + 3);
    const retested = recent.some(
      (b, i) => i < recent.length - 1 && b.low <= level + LEVEL_TOLERANCE && b.close > level
    );
    const holding = last.close > level;
    if (broke && retested && holding) {
      reasons.push(`Break above ${level.toFixed(0)} with retest hold`);
      return { hit: true, confidence: 78, reasons };
    }
  } else {
    const broke = recent.some((b) => b.close < level - 3);
    const retested = recent.some(
      (b, i) => i < recent.length - 1 && b.high >= level - LEVEL_TOLERANCE && b.close < level
    );
    const holding = last.close < level;
    if (broke && retested && holding) {
      reasons.push(`Break below ${level.toFixed(0)} with retest rejection`);
      return { hit: true, confidence: 78, reasons };
    }
  }
  return { hit: false, confidence: 0, reasons: [] };
}

function detectRejectionWick(
  bar: Candle,
  level: number,
  side: 'CE' | 'PE'
): { hit: boolean; confidence: number; reasons: string[] } {
  const body = Math.abs(bar.close - bar.open);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const reasons: string[] = [];

  if (side === 'CE' && nearLevel(bar.low, level) && lowerWick > body * 1.4 && bar.close > bar.open) {
    reasons.push(`Bullish rejection wick at ${level.toFixed(0)}`);
    return { hit: true, confidence: 74, reasons };
  }
  if (side === 'PE' && nearLevel(bar.high, level) && upperWick > body * 1.4 && bar.close < bar.open) {
    reasons.push(`Bearish rejection wick at ${level.toFixed(0)}`);
    return { hit: true, confidence: 74, reasons };
  }
  return { hit: false, confidence: 0, reasons: [] };
}

function biasAligned(side: 'CE' | 'PE', bias: DeskBias): boolean {
  if (bias === 'SIDEWAYS') return true;
  if (bias === 'UP' && side === 'CE') return true;
  if (bias === 'DOWN' && side === 'PE') return true;
  return false;
}

function setupId(kind: PinaxSetupKind, side: 'CE' | 'PE', level: number, at: string): string {
  return `${kind}:${side}:${Math.round(level)}:${at.slice(0, 16)}`;
}

export function scanPinaxSetups(opts: {
  candles: Candle[];
  zones: TradingZone[];
  morningBias: DeskBias;
  support: number | null;
  resistance: number | null;
  spot: number;
  /** Session calendar date (IST YYYY-MM-DD). Prior-day bars never produce TAKE. */
  sessionDate?: string;
  tuning?: PinaxTuningProfile;
  blockedSetupKeys?: string[];
}): PinaxSetupSignal[] {
  const { candles, zones, morningBias, support, resistance, spot } = opts;
  const sessionDate = opts.sessionDate ?? istDate();
  const tuning = opts.tuning;
  const blocked = opts.blockedSetupKeys ?? [];
  const useTuning = tuning != null;

  // Only today's bars — never recycle yesterday setups into today's desk.
  const sessionBars = candles
    .filter((c) => istCalendarDate(c.t) === sessionDate)
    .sort((a, b) => a.t.localeCompare(b.t));
  if (sessionBars.length < MIN_SESSION_BARS) return [];

  const bars = sessionBars;
  const lastBar = bars[bars.length - 1];
  const at = lastBar.t;
  if (istCalendarDate(at) !== sessionDate) return [];

  const pa = runPriceAction(bars, { leftBars: 5, rightBars: 5 });
  const signals: PinaxSetupSignal[] = [];
  const levels = new Set<number>();

  for (const z of zones) {
    levels.add(Math.round((z.low + z.high) / 2));
  }
  if (support != null) levels.add(Math.round(support));
  if (resistance != null) levels.add(Math.round(resistance));

  for (const level of levels) {
    for (const side of ['CE', 'PE'] as const) {
      const zoneMatch = zones.find(
        (z) =>
          (side === 'CE' ? z.kind === 'BUY' : z.kind === 'SELL') &&
          inZone(spot, z)
      );

      const br = detectBreakRetest(bars, level, side);
      if (br.hit && (zoneMatch || nearLevel(spot, level))) {
        const aligned = biasAligned(side, morningBias);
        signals.push({
          id: setupId('BREAK_RETEST', side, level, at),
          at,
          kind: 'BREAK_RETEST',
          side,
          spot,
          level,
          confidence: br.confidence + (aligned ? 6 : 0) + (zoneMatch ? 4 : 0),
          reasons: [...br.reasons, ...(zoneMatch ? [`In ${zoneMatch.anchor} zone`] : [])],
          alignedWithBias: aligned,
          decision: aligned && br.confidence >= 72 ? 'TAKE' : 'SKIP',
          skipReason: aligned ? undefined : `Against desk bias ${morningBias}`,
        });
      }

      const wick = detectRejectionWick(lastBar, level, side);
      if (wick.hit && (zoneMatch || nearLevel(spot, level))) {
        const aligned = biasAligned(side, morningBias);
        signals.push({
          id: setupId('REJECTION_WICK', side, level, at),
          at,
          kind: 'REJECTION_WICK',
          side,
          spot,
          level,
          confidence: wick.confidence + (aligned ? 6 : 0) + (zoneMatch ? 4 : 0),
          reasons: [...wick.reasons, ...(zoneMatch ? [`In ${zoneMatch.anchor} zone`] : [])],
          alignedWithBias: aligned,
          decision: aligned && wick.confidence >= 70 ? 'TAKE' : 'SKIP',
          skipReason: aligned ? undefined : `Against desk bias ${morningBias}`,
        });
      }
    }
  }

  if (pa.lastLabel === 'HL' && support != null && nearLevel(spot, support)) {
    const aligned = biasAligned('CE', morningBias);
    signals.push({
      id: setupId('STRUCTURE_HL_LH_PLUS_LEVEL', 'CE', support, at),
      at,
      kind: 'STRUCTURE_HL_LH_PLUS_LEVEL',
      side: 'CE',
      spot,
      level: support,
      confidence: pa.confidence,
      reasons: [pa.entryHint, 'HL at structure support'],
      alignedWithBias: aligned,
      decision: aligned && pa.confidence >= 70 ? 'TAKE' : 'SKIP',
      skipReason: aligned ? undefined : `Against desk bias ${morningBias}`,
    });
  }

  if (pa.lastLabel === 'LH' && resistance != null && nearLevel(spot, resistance)) {
    const aligned = biasAligned('PE', morningBias);
    signals.push({
      id: setupId('STRUCTURE_HL_LH_PLUS_LEVEL', 'PE', resistance, at),
      at,
      kind: 'STRUCTURE_HL_LH_PLUS_LEVEL',
      side: 'PE',
      spot,
      level: resistance,
      confidence: pa.confidence,
      reasons: [pa.entryHint, 'LH at structure resistance'],
      alignedWithBias: aligned,
      decision: aligned && pa.confidence >= 70 ? 'TAKE' : 'SKIP',
      skipReason: aligned ? undefined : `Against desk bias ${morningBias}`,
    });
  }

  let out = signals.sort((a, b) => b.confidence - a.confidence);

  if (useTuning && tuning) {
    out = out
      .filter((s) => !isSetupBlocked(s.kind, s.side, s.level, blocked))
      .map((s) => {
        const confidence = applyTuningToConfidence(s.kind, s.confidence, tuning);
        const { decision, skipReason } = tuningTakeDecision(
          s.kind,
          confidence,
          s.alignedWithBias,
          tuning
        );
        return { ...s, confidence, decision, skipReason };
      });
  }

  return out.slice(0, 5);
}
