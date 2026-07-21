/**
 * Blink Profile — Nifty Index · 3m · Full Price Action
 *
 * Trader mindset: every session → find 2–3 opportunities → execute → exit → profit.
 * Scenarios (UP / DOWN / SIDEWAYS) only choose WHICH playbook — never "skip the day".
 */

import type { Candle } from '@/lib/nejoic';
import { runPriceAction } from '@/lib/price-action';
import { pickOptionStrike } from '@/lib/option-sim';
import type { BlinkSignal, BlinkSettings } from '@/lib/blink';
import { buildProTradePlan, planToLiveBias } from '@/lib/blink-pro-playbooks';
import { latestIstSessionCandles } from '@/lib/blink-intraday';

export const BLINK_NIFTY_PA_PROFILE_ID = 'nifty_pa_3m' as const;

export type MarketScenario = 'UP' | 'DOWN' | 'SIDEWAYS';

/** Which scenario the agent is currently studying / allowed to trade */
export type PaLessonFocus = 'up' | 'down' | 'sideways' | 'all';

export type AnalysisStep = {
  step: number;
  title: string;
  detail: string;
  status: 'ok' | 'wait' | 'warn' | 'action';
};

export type BlinkNiftyPaProfileResult = {
  profileId: typeof BLINK_NIFTY_PA_PROFILE_ID;
  profileName: string;
  symbol: 'NIFTY';
  timeframe: '3m';
  scenario: MarketScenario;
  scenarioPlain: string;
  lessonFocus: PaLessonFocus;
  steps: AnalysisStep[];
  signal: BlinkSignal;
  learningNote: string;
};

const PROFILE_NAME = 'Nifty Index · 3m Price Action';

function atrPct(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 0;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
  }
  const atr = sum / period;
  const spot = candles[candles.length - 1]?.close || 1;
  return (atr / spot) * 100;
}

/**
 * Classify market into UP / DOWN / SIDEWAYS.
 * Uses directional efficiency so a wide but two-sided auction is not
 * incorrectly labelled trending. SIDEWAYS is a tradable regime, not "dead".
 */
export function detectMarketScenario(candles: Candle[]): {
  scenario: MarketScenario;
  plain: string;
  trend: 1 | -1 | 0;
  support: number | null;
  resistance: number | null;
  lastLabel: string | null;
  structureText: string;
} {
  const pa = runPriceAction(candles, { leftBars: 5, rightBars: 5 });
  const closes = candles.map((c) => c.close);
  const n = Math.min(30, closes.length);
  const recent = closes.slice(-n);
  const hi = Math.max(...recent);
  const lo = Math.min(...recent);
  const mid = (hi + lo) / 2 || 1;
  const rangePct = ((hi - lo) / mid) * 100;
  const atrp = atrPct(candles);
  const spot = closes[closes.length - 1] ?? 0;
  const open = candles[0]?.open ?? spot;
  const dayBiasPct = open ? ((spot - open) / open) * 100 : 0;
  const recentStart = recent[0] ?? spot;
  const recentMovePct = recentStart
    ? ((spot - recentStart) / recentStart) * 100
    : 0;
  let path = 0;
  for (let i = 1; i < recent.length; i++) {
    path += Math.abs(recent[i] - recent[i - 1]);
  }
  const efficiency = path > 0 ? Math.abs(spot - recentStart) / path : 0;

  // A range may be wide and volatile. Low path efficiency means price keeps
  // reversing instead of progressing directionally.
  const twoSidedAuction =
    recent.length >= 12 &&
    efficiency < 0.3 &&
    Math.abs(recentMovePct) < 0.18 &&
    rangePct < 0.75;
  const tightCompression = rangePct < 0.22 && atrp > 0 && atrp < 0.07;

  let scenario: MarketScenario = 'SIDEWAYS';

  if (twoSidedAuction || tightCompression) scenario = 'SIDEWAYS';
  else if (recentMovePct > 0.08 && pa.trend !== -1) scenario = 'UP';
  else if (recentMovePct < -0.08 && pa.trend !== 1) scenario = 'DOWN';
  else if (pa.trend === 1 && dayBiasPct > 0.04) scenario = 'UP';
  else if (pa.trend === -1 && dayBiasPct < -0.04) scenario = 'DOWN';
  else if (dayBiasPct > 0.12) scenario = 'UP';
  else if (dayBiasPct < -0.12) scenario = 'DOWN';
  else if (efficiency >= 0.35) scenario = spot >= mid ? 'UP' : 'DOWN';

  const plain =
    scenario === 'UP'
      ? 'Market progressing UP — stalk support pullback + bullish reclaim for ATM CE'
      : scenario === 'DOWN'
        ? 'Market progressing DOWN — stalk LH_BREAK for ATM PE'
        : 'Two-sided auction — stalk wick rejection at range edges; never enter mid-range';

  return {
    scenario,
    plain,
    trend: pa.trend,
    support: pa.support,
    resistance: pa.resistance,
    lastLabel: pa.lastLabel,
    structureText: pa.structureText,
  };
}

function lessonAllowsTrade(focus: PaLessonFocus, scenario: MarketScenario): boolean {
  if (focus === 'all') return true;
  if (focus === 'up') return scenario === 'UP';
  if (focus === 'down') return scenario === 'DOWN';
  if (focus === 'sideways') return scenario === 'SIDEWAYS';
  return true;
}

/**
 * Full step-by-step Nifty 3m PA analysis → option signal
 */
export function analyzeNiftyPaProfile(
  candles: Candle[],
  settings: Pick<
    BlinkSettings,
    | 'minConfidence'
    | 'strikeMoneyness'
    | 'paLeftBars'
    | 'paRightBars'
    | 'paLessonFocus'
  >,
  liveSpot?: number,
  livePremium?: number | null
): BlinkNiftyPaProfileResult {
  // Live candle APIs return a rolling window that may include yesterday.
  // Price action, OR and session range must use today in IST only.
  candles = latestIstSessionCandles(candles);
  const spot = liveSpot ?? candles[candles.length - 1]?.close ?? 24850;
  const premium = livePremium != null && livePremium > 0 ? livePremium : 0;
  const lessonFocus: PaLessonFocus = settings.paLessonFocus ?? 'all';
  const lb = settings.paLeftBars ?? 5;
  const rb = settings.paRightBars ?? 5;

  const steps: AnalysisStep[] = [];

  // Step 1 — Chart
  steps.push({
    step: 1,
    title: 'Chart locked',
    detail: 'Nifty 50 Index · 3-minute candles · price action only (no lagging indicators).',
    status: 'ok',
  });

  // Step 2 — Market scenario (one of three)
  const mkt = detectMarketScenario(candles);
  steps.push({
    step: 2,
    title: `Market scenario: ${mkt.scenario}`,
    detail: mkt.plain,
    status: mkt.scenario === 'SIDEWAYS' ? 'wait' : 'ok',
  });

  // Step 3 — Structure map
  const pa = runPriceAction(candles, { leftBars: lb, rightBars: rb });
  steps.push({
    step: 3,
    title: 'Map structure (HH / HL / LH / LL)',
    detail: mkt.structureText,
    status: pa.lastLabel ? 'ok' : 'wait',
  });

  // Step 4 — Lesson focus (train one by one)
  const lessonLine =
    lessonFocus === 'all'
      ? 'Training mode: ALL scenarios (UP + DOWN + SIDEWAYS).'
      : lessonFocus === 'up'
        ? 'Training mode: studying UP market only — CE setups.'
        : lessonFocus === 'down'
          ? 'Training mode: studying DOWN market only — PE setups.'
          : 'Training mode: studying SIDEWAYS only — learn to stay flat.';
  steps.push({
    step: 4,
    title: 'Lesson focus (train one by one)',
    detail: lessonLine,
    status: 'ok',
  });

  const strike = Math.round(spot / 50) * 50;
  const flatSignal = (
    setup: string,
    reason: string,
    confidence = 40
  ): BlinkSignal => ({
    bias: 'FLAT',
    niftySpot: spot,
    strike,
    premium,
    confidence,
    setup,
    reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
    support: pa.support,
    resistance: pa.resistance,
    paLabel: pa.lastLabel,
    paTrend: pa.trend === 1 ? 'BULL' : pa.trend === -1 ? 'BEAR' : 'NEUTRAL',
  });

  // Step 5 — Scenario playbook
  if (!lessonAllowsTrade(lessonFocus, mkt.scenario)) {
    steps.push({
      step: 5,
      title: 'Skip trade (outside current lesson)',
      detail: `Now studying “${lessonFocus.toUpperCase()}” only. Current market is ${mkt.scenario} — observe, do not trade.`,
      status: 'wait',
    });
    steps.push({
      step: 6,
      title: 'Option decision',
      detail: 'FLAT — wait until market matches the lesson you are training.',
      status: 'wait',
    });
    return {
      profileId: BLINK_NIFTY_PA_PROFILE_ID,
      profileName: PROFILE_NAME,
      symbol: 'NIFTY',
      timeframe: '3m',
      scenario: mkt.scenario,
      scenarioPlain: mkt.plain,
      lessonFocus,
      steps,
      signal: flatSignal('PA_LESSON_SKIP', steps[4].detail),
      learningNote: `Focus on ${lessonFocus.toUpperCase()} days. Watch how structure prints when market is ${mkt.scenario}.`,
    };
  }

  // SIDEWAYS / UP / DOWN — professional playbook finds a path in EVERY scenario
  const plan = buildProTradePlan(candles, mkt.scenario, spot, settings.minConfidence ?? 68);
  const live = planToLiveBias(plan, settings.minConfidence ?? 68);

  steps.push({
    step: 5,
    title: `${mkt.scenario} playbook · ${plan.mode}`,
    detail: plan.howProTradesIt,
    status: plan.mode === 'ENTER' ? 'action' : plan.mode === 'STALK' ? 'wait' : 'ok',
  });

  if (live.bias === 'FLAT') {
    steps.push({
      step: 6,
      title: 'Option decision · STALK',
      detail: `${plan.reason} Entry zone: ${plan.entryZone}. Invalidation ready: ${plan.invalidation}.`,
      status: 'wait',
    });
    return {
      profileId: BLINK_NIFTY_PA_PROFILE_ID,
      profileName: PROFILE_NAME,
      symbol: 'NIFTY',
      timeframe: '3m',
      scenario: mkt.scenario,
      scenarioPlain: mkt.plain,
      lessonFocus,
      steps,
      signal: flatSignal(live.setup, live.reason, live.confidence),
      learningNote: plan.howProTradesIt,
    };
  }

  const optStrike =
    plan.strike ?? pickOptionStrike(spot, live.bias as 'CE' | 'PE', settings.strikeMoneyness ?? 'atm', 50);
  steps.push({
    step: 6,
    title: `Option decision · ${live.bias}`,
    detail: `Buy ${live.bias} · strike ~${optStrike} · ${plan.reason} · stop: ${plan.invalidation}`,
    status: 'action',
  });

  return {
    profileId: BLINK_NIFTY_PA_PROFILE_ID,
    profileName: PROFILE_NAME,
    symbol: 'NIFTY',
    timeframe: '3m',
    scenario: mkt.scenario,
    scenarioPlain: mkt.plain,
    lessonFocus,
    steps,
    signal: {
      bias: live.bias,
      niftySpot: spot,
      strike: optStrike,
      premium,
      confidence: live.confidence,
      setup: `NIFTY_PA_${live.setup}`,
      reason: live.reason,
      emaFast: 0,
      emaSlow: 0,
      rsi: 50,
      support: pa.support,
      resistance: pa.resistance,
      paLabel: pa.lastLabel,
      paTrend: pa.trend === 1 ? 'BULL' : pa.trend === -1 ? 'BEAR' : 'NEUTRAL',
    },
    learningNote: plan.howProTradesIt,
  };
}

export const PA_LESSON_OPTIONS: { id: PaLessonFocus; label: string; desc: string }[] = [
  {
    id: 'all',
    label: 'All 3 scenarios',
    desc: 'UP + DOWN + SIDEWAYS — pro path in every day type',
  },
  {
    id: 'up',
    label: 'Train UP only',
    desc: 'Going-up days · CE on Higher Lows / OR break',
  },
  {
    id: 'down',
    label: 'Train DOWN only',
    desc: 'Going-down days · PE on Lower Highs / OR break',
  },
  {
    id: 'sideways',
    label: 'Train SIDEWAYS only',
    desc: 'Range days · fade extremes or trade confirmed break',
  },
];
