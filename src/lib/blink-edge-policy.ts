/**
 * Edge policy — learn from graded opportunities (browser-safe, no Node fs).
 *
 * Grade path: 722 → 38% → v2 → 303 trades @ 43.2% WR · +0.08R expectancy.
 * Best: LH_BREAK ~54%. Weak: DOWN_OR_BREAK_PE ~40%. Open ~45%.
 * v8 cross-year test: isolate robust range-high PE and confirmation quality.
 * Every day gets a plan, but ENTER still requires the trigger.
 */

import type { GradeReportSummary } from '@/lib/blink-opportunity-grade';
import type { OptionBias } from '@/lib/nejoic';
import type { MarketScenario } from '@/lib/blink-nifty-pa-profile';

/** Hard lessons from the latest graded book (fallback if memory empty) */
export const DEFAULT_EDGE_POLICY = {
  /** Setups to skip entirely (graded weak / dilutive) */
  skipSetups: [
    'HL_IN_UPTREND',
    'HL_PRINT',
    'HL_BREAK',
    'LH_IN_DOWNTREND',
    'LH_PRINT',
    'DOWN_LH_PE',
    'UP_HL_CE',
    'UP_OR_BREAK_CE',
    'DOWN_OR_BREAK_PE',
    'FORCED_DAY_LOW_CE',
    'FORCED_DAY_HIGH_PE',
    'FORCED_OR_BREAK_CE',
    'RANGE_FADE_LOW_CE',
    'RANGE_FADE_HIGH_PE',
    'RANGE_BREAK_UP_CE',
    'RANGE_REJECT_LOW_CE',
    'LH_BREAK',
    'DOWN_PULLBACK_REJECT_PE',
    'UP_OR_RETEST_CE',
    'UP_PULLBACK_RECLAIM_CE',
    'PDH_BREAK_RETEST_CE',
    'PDL_BREAK_RETEST_PE',
    'PDH_REJECT_PE',
    'PDL_RECLAIM_CE',
    'RANGE_REJECT_HIGH_CONFIRM_PE',
  ],
  /** Allowed ENTER setups: one controlled playbook per regime */
  preferSetups: [
    'RANGE_REJECT_HIGH_PE',
  ],
  /** Reject every ENTER setup outside preferSetups */
  requirePreferredSetup: true,
  /** Open is preferred, but valid regime triggers may occur at midday */
  requirePreferredPhase: false,
  /** Prefer this session phase */
  preferPhase: 'open' as 'open' | 'mid' | 'close',
  /** Phase results conflict across years; do not score one phase higher */
  usePhasePreference: false,
  /**
   * When true: drop mid/close unless setup is in preferSetups.
   * Open ~45% WR on latest book.
   */
  preferPhaseStrict: false,
  /** Never take new entries in close phase (intraday square-off) */
  blockCloseEntries: true,
  /** Cap slots after filter (quality > forced fills) */
  maxKeep: 2,
  /** Legacy display threshold; acceptance is now based on observed avg R */
  minSetupWinRate: 48,
  minSetupTrades: 20,
  /** Require price near S/R or OR edge */
  requireLevelTouch: true,
  levelTolPct: 0.08,
};

export type EdgePolicy = typeof DEFAULT_EDGE_POLICY & {
  fromGrade?: boolean;
  gradedWinRate?: number | null;
  lessons?: string[];
};

/** Minimal plan shape — avoids circular import with blink-pro-playbooks */
export type EdgePlanLike = {
  scenario: MarketScenario;
  bias: OptionBias;
  mode: 'ENTER' | 'STALK';
  setup: string;
  reason: string;
  confidence: number;
  strike: number | null;
  entryZone: string;
  invalidation: string;
  targetHint: string;
  howProTradesIt: string;
};

/** Minimal opp shape — avoids circular import with blink-session-opportunities */
export type EdgeOppLike = {
  slot: number;
  atBar: number;
  atTime: string;
  scenario: MarketScenario;
  bias: OptionBias;
  setup: string;
  reason: string;
  confidence: number;
  strike: number | null;
  entryZone: string;
  invalidation: string;
  targetHint: string;
  howProTradesIt: string;
  sessionPhase: 'open' | 'mid' | 'close';
};

export function syncEdgePolicyFromGrade(g: GradeReportSummary | null): EdgePolicy {
  const policy: EdgePolicy = {
    ...DEFAULT_EDGE_POLICY,
    skipSetups: [...DEFAULT_EDGE_POLICY.skipSetups],
    preferSetups: [...DEFAULT_EDGE_POLICY.preferSetups],
    fromGrade: Boolean(g),
    gradedWinRate: g?.winRate ?? null,
    lessons: g?.lessons ?? [],
  };
  if (!g) return policy;

  for (const [setup, stats] of Object.entries(g.bySetup)) {
    if (stats.n < policy.minSetupTrades) continue;
    // LH_BREAK is the locked isolation candidate; evaluate by expectancy after
    // the run rather than auto-removing it for a 0.1% WR threshold miss.
    if (setup.includes('LH_BREAK')) continue;
    if (stats.avgR <= 0) {
      if (!policy.skipSetups.includes(setup)) policy.skipSetups.push(setup);
    }
  }

  // Always keep weak OR continuation skipped until grade flips them
  for (const weak of ['UP_OR_BREAK_CE', 'DOWN_OR_BREAK_PE']) {
    if (!policy.skipSetups.includes(weak)) policy.skipSetups.push(weak);
    policy.preferSetups = policy.preferSetups.filter((s) => !s.includes(weak));
  }

  return policy;
}

function setupBlocked(setup: string, policy: EdgePolicy): boolean {
  const u = setup.toUpperCase();
  return policy.skipSetups.some((s) => u.includes(s.toUpperCase()));
}

function setupPreferred(setup: string, policy: EdgePolicy): boolean {
  const u = setup.toUpperCase();
  return policy.preferSetups.some((s) => u.includes(s.toUpperCase()));
}

/** Near OR or day extreme / plan invalidation price */
export function nearTradeableLevel(
  spot: number,
  plan: EdgePlanLike,
  or: { high: number; low: number; mid?: number } | null,
  dayHigh: number,
  dayLow: number,
  tolPct = 0.12
): boolean {
  const tol = spot * (tolPct / 100);
  const levels: number[] = [dayHigh, dayLow];
  if (or) levels.push(or.high, or.low, or.mid ?? (or.high + or.low) / 2);
  const m = plan.invalidation.match(/(\d{4,5}(?:\.\d+)?)/);
  if (m) levels.push(Number(m[1]));
  const m2 = plan.entryZone.match(/(\d{4,5}(?:\.\d+)?)/);
  if (m2) levels.push(Number(m2[1]));
  return levels.some((lv) => Math.abs(spot - lv) <= tol * 1.5);
}

/**
 * Apply edge policy to a live plan — may demote ENTER → STALK.
 */
export function applyEdgeToPlan<T extends EdgePlanLike>(
  plan: T,
  policy: EdgePolicy,
  ctx?: {
    sessionPhase?: 'open' | 'mid' | 'close';
    spot?: number;
    or?: { high: number; low: number; mid?: number } | null;
    dayHigh?: number;
    dayLow?: number;
  }
): T {
  if (plan.mode !== 'ENTER' || plan.bias === 'FLAT') return plan;

  if (ctx?.sessionPhase === 'close') {
    return {
      ...plan,
      mode: 'STALK',
      bias: 'FLAT' as OptionBias,
      setup: plan.setup === 'INTRADAY_FLAT_WINDOW' ? plan.setup : 'INTRADAY_NO_LATE_ENTRY',
      reason: `Intraday only — no new entries in close phase (must flat same day). ${plan.reason}`,
      confidence: Math.min(plan.confidence, 42),
      howProTradesIt:
        'Square off / stay flat near close. Overnight holds are forbidden.',
    };
  }

  if (setupBlocked(plan.setup, policy)) {
    return {
      ...plan,
      mode: 'STALK',
      bias: 'FLAT' as OptionBias,
      reason: `Edge filter: skip ${plan.setup} (graded weak). ${plan.reason}`,
      confidence: Math.min(plan.confidence, 48),
      howProTradesIt: `Graded skip — ${plan.setup} underperforms. Wait for LH_BREAK / OR break / preferred setups.`,
    };
  }

  if (policy.requirePreferredSetup && !setupPreferred(plan.setup, policy)) {
    return {
      ...plan,
      mode: 'STALK',
      bias: 'FLAT' as OptionBias,
      reason: `Daily playbook filter: skip ${plan.setup}. ${plan.reason}`,
      confidence: Math.min(plan.confidence, 48),
      howProTradesIt:
        'Only a validated UP / DOWN / SIDEWAYS trigger may enter.',
    };
  }

  if (
    policy.requirePreferredPhase &&
    ctx?.sessionPhase !== policy.preferPhase
  ) {
    return {
      ...plan,
      mode: 'STALK',
      bias: 'FLAT' as OptionBias,
      reason: `LH-only isolation: ${ctx?.sessionPhase ?? 'unknown'} phase blocked; prefer ${policy.preferPhase}. ${plan.reason}`,
      confidence: Math.min(plan.confidence, 48),
      howProTradesIt:
        'Isolation test: LH_BREAK entries are allowed only in the open phase.',
    };
  }

  if (
    policy.requireLevelTouch &&
    ctx?.spot != null &&
    ctx.dayHigh != null &&
    ctx.dayLow != null &&
    !nearTradeableLevel(
      ctx.spot,
      plan,
      ctx.or ?? null,
      ctx.dayHigh,
      ctx.dayLow,
      policy.levelTolPct
    )
  ) {
    return {
      ...plan,
      mode: 'STALK',
      bias: 'FLAT' as OptionBias,
      reason: `Edge filter: not at S/R or OR — no mid-range lottery. ${plan.reason}`,
      confidence: Math.min(plan.confidence, 50),
      howProTradesIt: 'Tightened rule: only trade at OR / support / resistance.',
    };
  }

  let confidence = plan.confidence;
  if (setupPreferred(plan.setup, policy)) confidence = Math.min(92, confidence + 6);
  if (
    policy.usePhasePreference &&
    ctx?.sessionPhase === policy.preferPhase
  ) {
    confidence = Math.min(92, confidence + 3);
  }
  return {
    ...plan,
    confidence,
    reason: setupPreferred(plan.setup, policy)
      ? `[EDGE+] ${plan.reason}`
      : plan.reason,
  };
}

/**
 * Filter / re-rank session opportunities after hunting.
 * Quality first: skip losers → open / preferred only → top maxKeep by score.
 */
export function filterOpportunitiesByEdge<T extends EdgeOppLike>(
  opps: T[],
  policy: EdgePolicy
): T[] {
  const maxKeep = policy.maxKeep ?? 2;
  let kept = opps.filter((o) => !setupBlocked(o.setup, policy));

  // Intraday desk: never keep close-phase entries
  if (policy.blockCloseEntries !== false) {
    kept = kept.filter((o) => o.sessionPhase !== 'close');
  }

  if (policy.requirePreferredSetup) {
    kept = kept.filter((o) => setupPreferred(o.setup, policy));
  }

  if (policy.requirePreferredPhase) {
    kept = kept.filter((o) => o.sessionPhase === policy.preferPhase);
  }

  if (policy.preferPhaseStrict) {
    kept = kept.filter(
      (o) =>
        o.sessionPhase === policy.preferPhase || setupPreferred(o.setup, policy)
    );
  }

  return kept
    .map((o) => {
      let score = o.confidence;
      if (setupPreferred(o.setup, policy)) score += 28;
      if (policy.usePhasePreference && o.sessionPhase === policy.preferPhase) {
        score += 14;
      }
      if (o.sessionPhase === 'close') score -= 12;
      if (o.sessionPhase === 'mid' && !setupPreferred(o.setup, policy)) score -= 6;
      return { o, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxKeep)
    .map((x, i) => ({ ...x.o, slot: i + 1 }));
}
