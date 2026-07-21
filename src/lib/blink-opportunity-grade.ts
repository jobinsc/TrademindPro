/**
 * Grade trade opportunities by walking forward on the same 3m bars.
 * Win = target hit before stop. Loss = stop hit first.
 * Flat = force-squared before session close (intraday only — no overnight).
 */

import type { Candle } from '@/lib/nejoic';
import type { SessionOpportunity } from '@/lib/blink-session-opportunities';
import { intradayGradeWalkEnd, isIntradayEntryAllowed } from '@/lib/blink-intraday';
import { buildAtmOptionMovePlan } from '@/lib/blink-option-target';

export type GradeResult = 'WIN' | 'LOSS' | 'FLAT';

export type GradedOpportunity = SessionOpportunity & {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskPts: number;
  rewardPts: number;
  grade: GradeResult;
  exitPrice: number;
  exitBar: number;
  exitTime: string;
  /** Spot points captured (signed for bias) */
  pnlPts: number;
  /** R-multiple */
  rMultiple: number;
  barsHeld: number;
};

export type GradeReportSummary = {
  graded: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  avgR: number;
  expectancyR: number;
  totalPnlPts: number;
  bySetup: Record<string, { n: number; wins: number; winRate: number; avgR: number }>;
  byPhase: Record<string, { n: number; wins: number; winRate: number; avgR: number }>;
  byScenario: Record<string, { n: number; wins: number; winRate: number; avgR: number }>;
  lessons: string[];
};

function atr(candles: Candle[], endIdx: number, period = 14): number {
  const start = Math.max(1, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
    n += 1;
  }
  return n ? sum / n : (candles[endIdx].high - candles[endIdx].low) || 20;
}

/** Infer numeric entry / stop / target from plan text + structure */
export function resolveTradeLevels(
  candles: Candle[],
  atBar: number,
  bias: 'CE' | 'PE',
  invalidation: string,
  entryZone: string
): { entry: number; stop: number; target: number } {
  const entry = candles[atBar].close;
  const a = atr(candles, atBar);
  const daySlice = candles.slice(0, atBar + 1);
  const dayHigh = Math.max(...daySlice.map((c) => c.high));
  const dayLow = Math.min(...daySlice.map((c) => c.low));
  const orSlice = candles.slice(0, Math.min(5, atBar + 1));
  const orHigh = Math.max(...orSlice.map((c) => c.high));
  const orLow = Math.min(...orSlice.map((c) => c.low));
  const optionMove = buildAtmOptionMovePlan(entry, bias);
  const targetMove = optionMove.requiredNiftyMove.min;
  const stopMove = optionMove.requiredNiftyStop;

  const numFromText = (text: string): number | null => {
    const m = text.match(/(\d{4,5}(?:\.\d+)?)/);
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 1000 ? v : null;
  };

  let stop: number;
  if (bias === 'CE') {
    const fromInv = numFromText(invalidation);
    const fromZone = numFromText(entryZone);
    const structureStop = fromInv ?? fromZone ?? Math.min(entry - a, orLow, dayLow);
    // Respect a closer structural invalidation, but cap the option scalp loss.
    stop = Math.max(structureStop, entry - stopMove);
    if (stop >= entry) stop = entry - stopMove;
    const target = entry + targetMove;
    return {
      entry: Math.round(entry * 10) / 10,
      stop: Math.round(stop * 10) / 10,
      target: Math.round(target * 10) / 10,
    };
  }

  const fromInv = numFromText(invalidation);
  const fromZone = numFromText(entryZone);
  const structureStop = fromInv ?? fromZone ?? Math.max(entry + a, orHigh, dayHigh);
  stop = Math.min(structureStop, entry + stopMove);
  if (stop <= entry) stop = entry + stopMove;
  const target = entry - targetMove;
  return {
    entry: Math.round(entry * 10) / 10,
    stop: Math.round(stop * 10) / 10,
    target: Math.round(target * 10) / 10,
  };
}

/**
 * Forward-walk one opportunity to WIN / LOSS / FLAT.
 */
export function gradeOpportunity(
  candles: Candle[],
  opp: SessionOpportunity
): GradedOpportunity | null {
  if (opp.bias !== 'CE' && opp.bias !== 'PE') return null;
  const atBar = Math.min(opp.atBar, candles.length - 1);
  if (atBar >= candles.length - 1) return null;
  // Never grade late entries as valid overnight holds — skip
  if (!isIntradayEntryAllowed(atBar, candles)) return null;

  const levels = resolveTradeLevels(
    candles,
    atBar,
    opp.bias,
    opp.invalidation,
    opp.entryZone
  );
  const { entry, stop, target } = levels;
  const risk = Math.abs(entry - stop) || 1;

  // Square off before close — do not walk into overnight
  const walkEnd = Math.max(atBar + 1, intradayGradeWalkEnd(candles.length));
  let grade: GradeResult = 'FLAT';
  let exitPrice = candles[walkEnd].close;
  let exitBar = walkEnd;

  for (let i = atBar + 1; i <= walkEnd; i++) {
    const c = candles[i];
    if (opp.bias === 'CE') {
      const stopHit = c.low <= stop;
      const tgtHit = c.high >= target;
      if (stopHit && tgtHit) {
        // Conservative: assume stop if both in same bar
        grade = 'LOSS';
        exitPrice = stop;
        exitBar = i;
        break;
      }
      if (stopHit) {
        grade = 'LOSS';
        exitPrice = stop;
        exitBar = i;
        break;
      }
      if (tgtHit) {
        grade = 'WIN';
        exitPrice = target;
        exitBar = i;
        break;
      }
    } else {
      const stopHit = c.high >= stop;
      const tgtHit = c.low <= target;
      if (stopHit && tgtHit) {
        grade = 'LOSS';
        exitPrice = stop;
        exitBar = i;
        break;
      }
      if (stopHit) {
        grade = 'LOSS';
        exitPrice = stop;
        exitBar = i;
        break;
      }
      if (tgtHit) {
        grade = 'WIN';
        exitPrice = target;
        exitBar = i;
        break;
      }
    }
  }

  const pnlPts =
    opp.bias === 'CE' ? exitPrice - entry : entry - exitPrice;
  const rMultiple = Math.round((pnlPts / risk) * 100) / 100;

  return {
    ...opp,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
    riskPts: Math.round(risk * 10) / 10,
    rewardPts: Math.round(Math.abs(target - entry) * 10) / 10,
    grade,
    exitPrice: Math.round(exitPrice * 10) / 10,
    exitBar,
    exitTime: candles[exitBar].t,
    pnlPts: Math.round(pnlPts * 10) / 10,
    rMultiple,
    barsHeld: exitBar - atBar,
  };
}

export function gradeSessionOpportunities(
  candles: Candle[],
  opps: SessionOpportunity[]
): GradedOpportunity[] {
  const out: GradedOpportunity[] = [];
  for (const o of opps) {
    const g = gradeOpportunity(candles, o);
    if (g) out.push(g);
  }
  return out;
}

function bucketStats(
  items: GradedOpportunity[],
  keyFn: (g: GradedOpportunity) => string
): Record<string, { n: number; wins: number; winRate: number; avgR: number }> {
  const map: Record<string, GradedOpportunity[]> = {};
  for (const g of items) {
    const k = keyFn(g);
    (map[k] ||= []).push(g);
  }
  const out: Record<string, { n: number; wins: number; winRate: number; avgR: number }> = {};
  for (const [k, arr] of Object.entries(map)) {
    const decided = arr.filter((x) => x.grade !== 'FLAT');
    const wins = decided.filter((x) => x.grade === 'WIN').length;
    const avgR =
      arr.length > 0
        ? Math.round((arr.reduce((s, x) => s + x.rMultiple, 0) / arr.length) * 100) / 100
        : 0;
    out[k] = {
      n: arr.length,
      wins,
      winRate:
        decided.length > 0
          ? Math.round((wins / decided.length) * 1000) / 10
          : 0,
      avgR,
    };
  }
  return out;
}

export function summarizeGrades(graded: GradedOpportunity[]): GradeReportSummary {
  const wins = graded.filter((g) => g.grade === 'WIN').length;
  const losses = graded.filter((g) => g.grade === 'LOSS').length;
  const flats = graded.filter((g) => g.grade === 'FLAT').length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;
  const avgR =
    graded.length > 0
      ? Math.round(
          (graded.reduce((s, g) => s + g.rMultiple, 0) / graded.length) * 100
        ) / 100
      : 0;
  // Expectancy is the observed mean R, including partial EOD square-offs.
  // A fixed WR formula was misleading once targets/stops became delta-based.
  const expectancyR = avgR;
  const totalPnlPts =
    Math.round(graded.reduce((s, g) => s + g.pnlPts, 0) * 10) / 10;

  const bySetup = bucketStats(graded, (g) => g.setup);
  const byPhase = bucketStats(graded, (g) => g.sessionPhase);
  const byScenario = bucketStats(graded, (g) => g.scenario);

  const lessons: string[] = [];
  const setupRank = Object.entries(bySetup)
    .filter(([, v]) => v.n >= 8)
    .sort((a, b) => b[1].avgR - a[1].avgR);
  if (setupRank[0]) {
    lessons.push(
      `Best setup by expectancy: ${setupRank[0][0]} · ${setupRank[0][1].avgR}R avg · ${setupRank[0][1].winRate}% WR over ${setupRank[0][1].n} trades.`
    );
  }
  if (setupRank.length > 1) {
    const worst = setupRank[setupRank.length - 1];
    lessons.push(
      worst[1].avgR <= 0
        ? `Weakest setup: ${worst[0]} · ${worst[1].avgR}R avg — size down or skip.`
        : `All sampled setups positive; lowest expectancy: ${worst[0]} · +${worst[1].avgR}R avg.`
    );
  }
  const phaseRank = Object.entries(byPhase).sort((a, b) => b[1].winRate - a[1].winRate);
  if (phaseRank[0]) {
    lessons.push(
      `Best session phase: ${phaseRank[0][0]} (${phaseRank[0][1].winRate}% WR). Prefer entries here.`
    );
  }
  lessons.push(
    expectancyR > 0
      ? `Observed edge: +${expectancyR}R per trade. Keep paper-testing with hard intraday stops.`
      : `Expectancy ${expectancyR}R — tighten triggers before live size.`
  );

  return {
    graded: graded.length,
    wins,
    losses,
    flats,
    winRate,
    avgR,
    expectancyR,
    totalPnlPts,
    bySetup,
    byPhase,
    byScenario,
    lessons,
  };
}
