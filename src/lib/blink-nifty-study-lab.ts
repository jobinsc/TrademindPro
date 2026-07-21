/**
 * Blink Nifty Study Lab — agent thinks like a money-making day trader.
 *
 * Every session: analyse chart → find 2–3 opportunities → CE/PE plan → exit rules.
 * Scenario (UP/DOWN/SIDEWAYS) only picks the playbook — never "skip the whole day".
 */

import type { Candle } from '@/lib/nejoic';
import { detectMarketScenario, type MarketScenario } from '@/lib/blink-nifty-pa-profile';
import { runPriceAction } from '@/lib/price-action';
import {
  findSessionTradeOpportunities,
  type SessionOpportunity,
} from '@/lib/blink-session-opportunities';
import {
  buildDeepChartStudy,
  type DeepChartStudy,
} from '@/lib/blink-deep-chart-study';
import {
  gradeSessionOpportunities,
  summarizeGrades,
  type GradedOpportunity,
  type GradeReportSummary,
} from '@/lib/blink-opportunity-grade';

export type StudyStepId =
  | 'collect'
  | 'read_day'
  | 'structure'
  | 'decision'
  | 'options';

export type StudyStep = {
  id: StudyStepId;
  title: string;
  detail: string;
  status: 'ok' | 'wait' | 'warn' | 'action';
};

export type OptionsPlan = {
  bias: 'CE' | 'PE' | 'FLAT';
  strike: number | null;
  setup: string;
  reason: string;
  confidence: number;
  invalidation: string;
  howToTrade: string;
};

export type SessionStudy = {
  date: string;
  bars: number;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  scenario: MarketScenario;
  scenarioPlain: string;
  structureText: string;
  support: number | null;
  resistance: number | null;
  behaviorSummary: string;
  steps: StudyStep[];
  /** Primary / best opportunity (compat with older UI) */
  options: OptionsPlan;
  /** 2–3 trade opportunities (graded when candles available) */
  opportunities: SessionOpportunity[];
  opportunityCount: number;
  /** Forward-tested grades for this day's slots */
  gradedOpportunities?: GradedOpportunity[];
  dayGrade?: {
    wins: number;
    losses: number;
    flats: number;
    pnlPts: number;
  };
  /** Full PA + S/R + phase map for a serious trader */
  deepStudy: DeepChartStudy;
  learningNote: string;
};

export type StudyLabReport = {
  fromDate: string;
  toDate: string;
  source: string;
  totalBars: number;
  sessions: SessionStudy[];
  summary: {
    upDays: number;
    downDays: number;
    sidewaysDays: number;
    tradeableDays: number;
    flatDays: number;
    totalOpportunities: number;
    daysWith2PlusOps: number;
    avgOpsPerDay: number;
  };
  gradeSummary: GradeReportSummary | null;
  curriculum: string[];
};

function dayKeyIST(iso: string): string {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function groupBySession(candles: Candle[]): Map<string, Candle[]> {
  const map = new Map<string, Candle[]>();
  for (const c of candles) {
    const key = dayKeyIST(c.t);
    const arr = map.get(key) || [];
    arr.push(c);
    map.set(key, arr);
  }
  for (const [, bars] of map) {
    bars.sort((a, b) => a.t.localeCompare(b.t));
  }
  return map;
}

function oppToOptionsPlan(o: SessionOpportunity): OptionsPlan {
  return {
    bias: o.bias === 'FLAT' ? 'FLAT' : o.bias,
    strike: o.strike,
    setup: o.setup,
    reason: o.reason,
    confidence: o.confidence,
    invalidation: o.invalidation,
    howToTrade: o.howProTradesIt,
  };
}

/**
 * Study one NSE session — hunt 2–3 money opportunities like a pro.
 */
export function studyNiftySession(date: string, bars: Candle[]): SessionStudy {
  const open = bars[0].open;
  const close = bars[bars.length - 1].close;
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const changePct = open ? ((close - open) / open) * 100 : 0;

  const mkt = detectMarketScenario(bars);
  const pa = runPriceAction(bars, { leftBars: 5, rightBars: 5 });
  const deepStudy = buildDeepChartStudy(bars);
  const opportunities = findSessionTradeOpportunities(bars, {
    maxOps: 2,
    minConfidence: 62,
    stepBars: 4,
  });
  const gradedOpportunities = gradeSessionOpportunities(bars, opportunities);
  const dayGrade = {
    wins: gradedOpportunities.filter((g) => g.grade === 'WIN').length,
    losses: gradedOpportunities.filter((g) => g.grade === 'LOSS').length,
    flats: gradedOpportunities.filter((g) => g.grade === 'FLAT').length,
    pnlPts:
      Math.round(gradedOpportunities.reduce((s, g) => s + g.pnlPts, 0) * 10) / 10,
  };

  const steps: StudyStep[] = [
    {
      id: 'collect',
      title: '1 · Collect the chart',
      detail: `${bars.length} × 3m bars · O ${open.toFixed(1)} H ${high.toFixed(1)} L ${low.toFixed(1)} C ${close.toFixed(1)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%). Day range ${deepStudy.dayRange.widthPts} pts (${deepStudy.dayRange.widthPct}%).`,
      status: 'ok',
    },
    {
      id: 'read_day',
      title: `2 · Day playbook → ${mkt.scenario}`,
      detail: `${mkt.plain} Close in ${deepStudy.closeContext.inPremiumOrDiscount}. ${deepStudy.closeContext.vsOr}.`,
      status: 'ok',
    },
    {
      id: 'structure',
      title: '3 · Full PA + support / resistance',
      detail: [
        `Swings: ${deepStudy.swingSequence}.`,
        `OR: ${deepStudy.openingRange.low}–${deepStudy.openingRange.high} (mid ${deepStudy.openingRange.mid}).`,
        deepStudy.supports.length
          ? `Supports: ${deepStudy.supports.map((s) => `${s.price}(${s.strength},${s.touches}×)`).join(', ')}.`
          : null,
        deepStudy.resistances.length
          ? `Resistances: ${deepStudy.resistances.map((r) => `${r.price}(${r.strength},${r.touches}×)`).join(', ')}.`
          : null,
        deepStudy.phases.map((p) => p.note).join(' · '),
      ]
        .filter(Boolean)
        .join(' '),
      status: 'ok',
    },
  ];

  if (opportunities.length) {
    steps.push({
      id: 'decision',
      title: `4 · Found ${opportunities.length} trade opportunit${opportunities.length === 1 ? 'y' : 'ies'}`,
      detail: opportunities
        .map(
          (o) =>
            `#${o.slot} ${o.sessionPhase}: ${o.bias} ${o.setup} (${o.confidence}%)`
        )
        .join(' · '),
      status: 'action',
    });
    steps.push({
      id: 'options',
      title: '5 · Execute & exit plan (aligned to S/R)',
      detail: opportunities
        .map(
          (o) =>
            `${o.bias}~${o.strike}: enter ${o.entryZone}; stop ${o.invalidation}; tgt ${o.targetHint}`
        )
        .join(' | '),
      status: 'action',
    });
  } else {
    steps.push({
      id: 'decision',
      title: '4 · Rare: no clean trigger printed',
      detail: `Stalk S/R: buy defense ~${deepStudy.supports[0]?.price ?? low}, sell ceiling ~${deepStudy.resistances[0]?.price ?? high}.`,
      status: 'warn',
    });
    steps.push({
      id: 'options',
      title: '5 · Standby levels',
      detail: `Watch break of OR ${deepStudy.openingRange.low}/${deepStudy.openingRange.high} or day extremes.`,
      status: 'wait',
    });
  }

  const best = opportunities[0];
  const options: OptionsPlan = best
    ? oppToOptionsPlan(best)
    : {
        bias: 'FLAT',
        strike: null,
        setup: 'NO_PRINT',
        reason: 'No opportunity printed yet — stalking levels.',
        confidence: 40,
        invalidation: 'N/A',
        howToTrade: 'Keep hunting OR and day extremes.',
      };

  const behaviorSummary = [
    deepStudy.traderBrief,
    `Ops: ${opportunities.map((o) => `${o.bias}/${o.setup}`).join(', ') || 'none'}.`,
  ].join(' ');

  const learningNote = gradedOpportunities.length
    ? `Graded ${gradedOpportunities.length} slot(s): ${dayGrade.wins}W / ${dayGrade.losses}L / ${dayGrade.flats}F · day PnL ${dayGrade.pnlPts >= 0 ? '+' : ''}${dayGrade.pnlPts} pts. Keep winners' setups; cut losers.`
    : opportunities.length
      ? `Trade only against mapped S/R. ${opportunities.length} slot(s) max 3.`
      : 'Levels mapped — wait for reaction at support/resistance or OR break before risking premium.';

  return {
    date,
    bars: bars.length,
    open,
    high,
    low,
    close,
    changePct,
    scenario: mkt.scenario,
    scenarioPlain: mkt.plain,
    structureText: deepStudy.swingSequence || pa.structureText,
    support: deepStudy.supports[0]?.price ?? pa.support,
    resistance: deepStudy.resistances[0]?.price ?? pa.resistance,
    behaviorSummary,
    steps,
    options,
    opportunities: gradedOpportunities.length ? gradedOpportunities : opportunities,
    opportunityCount: opportunities.length,
    gradedOpportunities,
    dayGrade,
    deepStudy,
    learningNote,
  };
}

export function buildNiftyStudyLabReport(
  candles: Candle[],
  fromDate: string,
  toDate: string,
  source = 'upstox_v3'
): StudyLabReport {
  const byDay = groupBySession(candles);
  const sessions: SessionStudy[] = [];

  const dates = [...byDay.keys()].sort();
  for (const date of dates) {
    if (date < fromDate || date > toDate) continue;
    const dayBars = byDay.get(date)!;
    if (dayBars.length < 15) continue;
    sessions.push(studyNiftySession(date, dayBars));
  }

  const totalOpportunities = sessions.reduce((s, d) => s + d.opportunityCount, 0);
  const daysWith2PlusOps = sessions.filter((d) => d.opportunityCount >= 2).length;

  const summary = {
    upDays: sessions.filter((s) => s.scenario === 'UP').length,
    downDays: sessions.filter((s) => s.scenario === 'DOWN').length,
    sidewaysDays: sessions.filter((s) => s.scenario === 'SIDEWAYS').length,
    tradeableDays: sessions.filter((s) => s.opportunityCount > 0).length,
    flatDays: sessions.filter((s) => s.opportunityCount === 0).length,
    totalOpportunities,
    daysWith2PlusOps,
    avgOpsPerDay:
      sessions.length > 0
        ? Math.round((totalOpportunities / sessions.length) * 100) / 100
        : 0,
  };

  const allGraded = sessions.flatMap((s) => s.gradedOpportunities || []);
  const gradeSummary = allGraded.length ? summarizeGrades(allGraded) : null;

  const curriculum = [
    'Agent collects Nifty 3m from Upstox.',
    'Agent maps PA + S/R + phases, then hunts 2–3 slots.',
    'Agent grades each slot: target before stop = WIN.',
    'Learn which setups/phases print money — size those up.',
    'Skip weak setups in live until win rate improves.',
  ];

  return {
    fromDate,
    toDate,
    source,
    totalBars: candles.length,
    sessions,
    summary,
    gradeSummary,
    curriculum,
  };
}
