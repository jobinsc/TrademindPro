import type { Candle } from '@/lib/nejoic';
import type { MarketScenario } from '@/lib/blink-nifty-pa-profile';
import { runPriceAction, type StructureLabel } from '@/lib/price-action';

export type NarrativeSide = 'CE' | 'PE' | 'FLAT';
export type NarrativeStage = 'OBSERVE' | 'IDEA' | 'CONFIRMED';

export type PriorAuctionLevels = {
  previousHigh: number;
  previousLow: number;
  previousClose: number;
  weekHigh: number;
  weekLow: number;
};

export type CandleNarrative = {
  index: number;
  at: string;
  price: number;
  scenario: MarketScenario;
  stage: NarrativeStage;
  side: NarrativeSide;
  confidence: number;
  candleShape: string;
  structure: string;
  location: string;
  behavior: string[];
  story: string;
  confirmation: string;
  invalidation: number | null;
  roomPts: number;
  levels: Array<{ label: string; price: number }>;
};

export type NarrativeGrade = {
  at: string;
  index: number;
  side: Exclude<NarrativeSide, 'FLAT'>;
  entry: number;
  confidence: number;
  mfeNifty: number;
  maeNifty: number;
  simulatedOptionMfe: number;
  hit5: boolean;
  hit7: boolean;
  timeTo5Sec: number | null;
  timeTo7Sec: number | null;
};

export type ProReplaySession = {
  date: string;
  bars: Candle[];
  priorLevels: PriorAuctionLevels | null;
  narratives: CandleNarrative[];
  grades: NarrativeGrade[];
  summary: {
    open: number;
    high: number;
    low: number;
    close: number;
    rangePts: number;
    confirmedIdeas: number;
    hit5: number;
    hit7: number;
  };
};

export type ProReplayIndexSession = {
  date: string;
  bars: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rangePts: number;
  confirmedIdeas: number;
  hit5: number;
  hit7: number;
};

function round(value: number, digits = 1): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

export function istDayKey(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function istMinute(iso: string): number {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() + 330 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function groupNiftyOneMinuteSessions(
  candles: Candle[]
): Map<string, Candle[]> {
  const sessions = new Map<string, Candle[]>();
  for (const candle of candles) {
    const minute = istMinute(candle.t);
    if (minute < 9 * 60 + 15 || minute > 15 * 60 + 30) continue;
    const date = istDayKey(candle.t);
    const bars = sessions.get(date) ?? [];
    bars.push(candle);
    sessions.set(date, bars);
  }
  for (const bars of sessions.values()) {
    bars.sort((a, b) => a.t.localeCompare(b.t));
  }
  return sessions;
}

function trueRangeAverage(candles: Candle[], period = 14): number {
  if (candles.length < 2) return Math.max(1, candles[0]?.high - candles[0]?.low || 1);
  const start = Math.max(1, candles.length - period);
  let total = 0;
  let count = 0;
  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    const previous = candles[i - 1];
    total += Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close)
    );
    count += 1;
  }
  return count ? total / count : 1;
}

/**
 * runPriceAction confirms pivots correctly, but its aggregate trend walk places
 * each label at the original pivot bar. Replay must activate that level only
 * after the required right bars have closed.
 */
function causalPriceAction(candles: Candle[]) {
  const rightBars = 3;
  const base = runPriceAction(candles, { leftBars: 3, rightBars });
  const events = base.points
    .filter(
      (point): point is typeof point & { label: StructureLabel } =>
        point.label != null
    )
    .map((point) => ({
      ...point,
      confirmedIndex: point.index + rightBars,
    }));
  let support: number | null = null;
  let resistance: number | null = null;
  let trend: 1 | -1 | 0 = 0;
  let lastLabel: StructureLabel | null = null;
  const confirmed: Array<{ label: StructureLabel; price: number }> = [];

  for (let index = 0; index < candles.length; index++) {
    for (const event of events) {
      if (event.confirmedIndex !== index) continue;
      lastLabel = event.label;
      confirmed.push({ label: event.label, price: event.price });
      if (event.label === 'HL' || event.label === 'LL') support = event.price;
      if (event.label === 'LH' || event.label === 'HH') resistance = event.price;
    }
    const close = candles[index].close;
    if (resistance != null && close > resistance) trend = 1;
    else if (support != null && close < support) trend = -1;
  }

  const sequence = confirmed.slice(-4).map((event) => event.label);
  return {
    support,
    resistance,
    trend,
    lastLabel,
    structureText: sequence.length
      ? `Confirmed structure: ${sequence.join(' → ')} · ${trend === 1 ? 'BULLISH' : trend === -1 ? 'BEARISH' : 'NEUTRAL'} · Sup ${support?.toFixed(1) ?? '—'} / Res ${resistance?.toFixed(1) ?? '—'}`
      : 'No confirmed HH/HL/LH/LL structure yet.',
  };
}

function causalMarketScenario(
  candles: Candle[],
  pa: ReturnType<typeof causalPriceAction>
): MarketScenario {
  const recent = candles.slice(-30);
  const first = recent[0]?.close ?? 0;
  const last = recent[recent.length - 1]?.close ?? first;
  let path = 0;
  for (let index = 1; index < recent.length; index++) {
    path += Math.abs(recent[index].close - recent[index - 1].close);
  }
  const progress = last - first;
  const efficiency = path > 0 ? Math.abs(progress) / path : 0;
  const dayOpen = candles[0]?.open ?? last;
  const dayMovePct = dayOpen ? ((last - dayOpen) / dayOpen) * 100 : 0;
  const recentMovePct = first ? (progress / first) * 100 : 0;
  if (
    recent.length >= 12 &&
    efficiency < 0.3 &&
    Math.abs(recentMovePct) < 0.18
  ) {
    return 'SIDEWAYS';
  }
  if (recentMovePct > 0.08 && pa.trend !== -1) return 'UP';
  if (recentMovePct < -0.08 && pa.trend !== 1) return 'DOWN';
  if (pa.trend === 1 && dayMovePct > 0.04) return 'UP';
  if (pa.trend === -1 && dayMovePct < -0.04) return 'DOWN';
  if (efficiency >= 0.35 && progress !== 0) return progress > 0 ? 'UP' : 'DOWN';
  return 'SIDEWAYS';
}

function candleShape(candle: Candle, atr: number): {
  text: string;
  bull: boolean;
  bear: boolean;
  bullReject: boolean;
  bearReject: boolean;
  expansion: boolean;
} {
  const range = Math.max(0.05, candle.high - candle.low);
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const bull = candle.close > candle.open;
  const bear = candle.close < candle.open;
  const expansion = range >= atr * 1.35 && body / range >= 0.55;
  const bullReject = lowerWick >= body * 1.25 && candle.close >= candle.low + range * 0.6;
  const bearReject = upperWick >= body * 1.25 && candle.close <= candle.low + range * 0.4;
  const direction = bull ? 'bullish' : bear ? 'bearish' : 'neutral';
  const text = `${expansion ? 'expansion ' : ''}${direction} candle · body ${round(body)} · upper wick ${round(upperWick)} · lower wick ${round(lowerWick)}`;
  return { text, bull, bear, bullReject, bearReject, expansion };
}

function nearestLevel(
  price: number,
  levels: Array<{ label: string; price: number }>,
  direction: 'above' | 'below'
) {
  const filtered = levels.filter((level) =>
    direction === 'above' ? level.price > price : level.price < price
  );
  filtered.sort((a, b) =>
    direction === 'above' ? a.price - b.price : b.price - a.price
  );
  return filtered[0] ?? null;
}

export function analyzeNarrativeCandle(
  visibleBars: Candle[],
  priorLevels: PriorAuctionLevels | null
): CandleNarrative {
  const index = visibleBars.length - 1;
  const last = visibleBars[index];
  const previous = visibleBars[index - 1] ?? last;
  const historyBefore = visibleBars.slice(0, -1);
  const recentBefore = historyBefore.slice(-20);
  const acceptanceHistory = visibleBars.slice(0, -2).slice(-20);
  const atr = trueRangeAverage(visibleBars);
  const shape = candleShape(last, atr);
  const pa = causalPriceAction(visibleBars);
  const scenario = causalMarketScenario(visibleBars, pa);
  const openingBars = visibleBars.filter((bar) => {
    const minute = istMinute(bar.t);
    return minute >= 9 * 60 + 15 && minute < 9 * 60 + 30;
  });
  const openingReady = istMinute(last.t) >= 9 * 60 + 29;
  const orHigh = Math.max(...openingBars.map((bar) => bar.high));
  const orLow = Math.min(...openingBars.map((bar) => bar.low));
  const recentHigh = recentBefore.length
    ? Math.max(...recentBefore.map((bar) => bar.high))
    : last.high;
  const recentLow = recentBefore.length
    ? Math.min(...recentBefore.map((bar) => bar.low))
    : last.low;
  const acceptanceHigh = acceptanceHistory.length
    ? Math.max(...acceptanceHistory.map((bar) => bar.high))
    : recentHigh;
  const acceptanceLow = acceptanceHistory.length
    ? Math.min(...acceptanceHistory.map((bar) => bar.low))
    : recentLow;

  const levels: Array<{ label: string; price: number }> = [
    ...(priorLevels
      ? [
          { label: 'PDH', price: priorLevels.previousHigh },
          { label: 'PDL', price: priorLevels.previousLow },
          { label: 'PDC', price: priorLevels.previousClose },
          { label: 'PWH', price: priorLevels.weekHigh },
          { label: 'PWL', price: priorLevels.weekLow },
        ]
      : []),
    ...(openingReady
      ? [
          { label: 'OR HIGH', price: orHigh },
          { label: 'OR LOW', price: orLow },
        ]
      : []),
    { label: 'RECENT HIGH', price: recentHigh },
    { label: 'RECENT LOW', price: recentLow },
    ...(pa.resistance != null ? [{ label: 'STRUCTURE RES', price: pa.resistance }] : []),
    ...(pa.support != null ? [{ label: 'STRUCTURE SUP', price: pa.support }] : []),
  ].filter(
    (level, levelIndex, all) =>
      all.findIndex((candidate) => Math.abs(candidate.price - level.price) < 0.5) === levelIndex
  );

  const nearestAbove = nearestLevel(last.close, levels, 'above');
  const nearestBelow = nearestLevel(last.close, levels, 'below');
  const roomUp = nearestAbove ? nearestAbove.price - last.close : Math.max(25, atr * 4);
  const roomDown = nearestBelow ? last.close - nearestBelow.price : Math.max(25, atr * 4);
  const nearTolerance = Math.max(2, atr * 0.65);
  const nearSupport =
    nearestBelow && Math.abs(last.low - nearestBelow.price) <= nearTolerance
      ? nearestBelow
      : null;
  const nearResistance =
    nearestAbove && Math.abs(last.high - nearestAbove.price) <= nearTolerance
      ? nearestAbove
      : null;
  const momentum5 =
    visibleBars.length >= 6
      ? last.close - visibleBars[visibleBars.length - 6].close
      : last.close - visibleBars[0].open;
  const acceptedUp =
    acceptanceHistory.length >= 5 &&
    last.close > acceptanceHigh &&
    previous.close > acceptanceHigh &&
    shape.bull;
  const acceptedDown =
    acceptanceHistory.length >= 5 &&
    last.close < acceptanceLow &&
    previous.close < acceptanceLow &&
    shape.bear;
  const sweptHigh = last.high > recentHigh && last.close < recentHigh && shape.bearReject;
  const sweptLow = last.low < recentLow && last.close > recentLow && shape.bullReject;

  const behavior: string[] = [];
  if (acceptedUp) behavior.push(`Acceptance above ${round(acceptanceHigh)}`);
  if (acceptedDown) behavior.push(`Acceptance below ${round(acceptanceLow)}`);
  if (sweptHigh) behavior.push(`Swept ${round(recentHigh)} and rejected back below`);
  if (sweptLow) behavior.push(`Swept ${round(recentLow)} and reclaimed above`);
  if (shape.bullReject && nearSupport) behavior.push(`Bullish rejection at ${nearSupport.label}`);
  if (shape.bearReject && nearResistance) behavior.push(`Bearish rejection at ${nearResistance.label}`);
  if (shape.expansion) behavior.push(`${shape.bull ? 'Bullish' : shape.bear ? 'Bearish' : 'Neutral'} range expansion`);
  if (Math.abs(momentum5) >= atr * 1.5) {
    behavior.push(`Five-minute momentum ${momentum5 >= 0 ? '+' : ''}${round(momentum5)} points`);
  }
  if (!behavior.length) behavior.push('Balanced rotation; no decisive acceptance or rejection');

  let ceScore = 25;
  let peScore = 25;
  if (scenario === 'UP') ceScore += 12;
  if (scenario === 'DOWN') peScore += 12;
  if (pa.trend === 1) ceScore += 12;
  if (pa.trend === -1) peScore += 12;
  if (pa.lastLabel === 'HL') ceScore += 8;
  if (pa.lastLabel === 'LH') peScore += 8;
  if (shape.bullReject && nearSupport) ceScore += 18;
  if (shape.bearReject && nearResistance) peScore += 18;
  if (acceptedUp) ceScore += 24;
  if (acceptedDown) peScore += 24;
  if (sweptLow) ceScore += 22;
  if (sweptHigh) peScore += 22;
  if (shape.expansion && shape.bull) ceScore += 10;
  if (shape.expansion && shape.bear) peScore += 10;
  if (momentum5 >= atr * 1.5) ceScore += 10;
  if (momentum5 <= -atr * 1.5) peScore += 10;
  if (roomUp >= 20) ceScore += 8;
  else if (roomUp < 12) ceScore -= 20;
  if (roomDown >= 20) peScore += 8;
  else if (roomDown < 12) peScore -= 20;

  const ceTrigger = acceptedUp || sweptLow || (shape.bullReject && !!nearSupport);
  const peTrigger = acceptedDown || sweptHigh || (shape.bearReject && !!nearResistance);
  const bestSide: NarrativeSide =
    Math.max(ceScore, peScore) < 50
      ? 'FLAT'
      : ceScore > peScore
        ? 'CE'
        : peScore > ceScore
          ? 'PE'
          : 'FLAT';
  const confidence = Math.min(95, Math.max(25, bestSide === 'CE' ? ceScore : bestSide === 'PE' ? peScore : 40));
  const insideEntryWindow = openingReady && istMinute(last.t) < 14 * 60 + 30;
  const confirmed = insideEntryWindow && (
    bestSide === 'CE'
      ? ceTrigger && ceScore >= 65
      : bestSide === 'PE'
        ? peTrigger && peScore >= 65
        : false
  );
  const stage: NarrativeStage =
    bestSide === 'FLAT' ? 'OBSERVE' : confirmed ? 'CONFIRMED' : 'IDEA';
  const roomPts = bestSide === 'CE' ? roomUp : bestSide === 'PE' ? roomDown : Math.min(roomUp, roomDown);
  const invalidation =
    bestSide === 'CE'
      ? nearSupport?.price ?? pa.support ?? recentLow
      : bestSide === 'PE'
        ? nearResistance?.price ?? pa.resistance ?? recentHigh
        : null;
  const location =
    nearSupport
      ? `Testing ${nearSupport.label} ${round(nearSupport.price)} from above`
      : nearResistance
        ? `Testing ${nearResistance.label} ${round(nearResistance.price)} from below`
        : `Between ${nearestBelow?.label ?? 'open support'} ${nearestBelow ? round(nearestBelow.price) : '—'} and ${nearestAbove?.label ?? 'open resistance'} ${nearestAbove ? round(nearestAbove.price) : '—'}`;
  const confirmation =
    bestSide === 'CE'
      ? `CE only while price holds above ${round(invalidation ?? recentLow)} and bullish acceptance/reclaim continues`
      : bestSide === 'PE'
        ? `PE only while price holds below ${round(invalidation ?? recentHigh)} and bearish acceptance/rejection continues`
        : 'No confirmation. Wait for acceptance or rejection at a mapped level.';
  const story =
    stage === 'OBSERVE'
      ? `${scenario} auction at ${location.toLowerCase()}. Current candle does not prove control; remain flat.`
      : `${scenario} auction at ${location.toLowerCase()}. ${behavior.join('. ')}. ${bestSide} ${stage === 'CONFIRMED' ? 'is confirmed for paper observation' : 'idea is forming but needs confirmation'}.`;

  return {
    index,
    at: last.t,
    price: last.close,
    scenario,
    stage,
    side: bestSide,
    confidence,
    candleShape: shape.text,
    structure: pa.structureText,
    location,
    behavior,
    story,
    confirmation,
    invalidation: invalidation == null ? null : round(invalidation),
    roomPts: round(roomPts),
    levels,
  };
}

function simulatedAtmMove(niftyMove: number): number {
  const move = Math.max(0, niftyMove);
  return 0.5 * move + 0.5 * 0.001 * move * move;
}

function gradeNarrative(
  bars: Candle[],
  narrative: CandleNarrative
): NarrativeGrade | null {
  if (narrative.stage !== 'CONFIRMED' || narrative.side === 'FLAT') return null;
  const end = Math.min(bars.length - 1, narrative.index + 5);
  if (end <= narrative.index) return null;
  const entry = bars[narrative.index].close;
  let mfe = 0;
  let mae = 0;
  let timeTo5Sec: number | null = null;
  let timeTo7Sec: number | null = null;
  for (let index = narrative.index + 1; index <= end; index++) {
    const candle = bars[index];
    const favorable =
      narrative.side === 'CE' ? candle.high - entry : entry - candle.low;
    const adverse =
      narrative.side === 'CE' ? candle.low - entry : entry - candle.high;
    mfe = Math.max(mfe, favorable);
    mae = Math.min(mae, adverse);
    const simulated = simulatedAtmMove(mfe);
    const elapsed = (index - narrative.index) * 60;
    if (timeTo5Sec == null && simulated >= 5) timeTo5Sec = elapsed;
    if (timeTo7Sec == null && simulated >= 7) timeTo7Sec = elapsed;
  }
  const simulatedOptionMfe = simulatedAtmMove(mfe);
  return {
    at: narrative.at,
    index: narrative.index,
    side: narrative.side,
    entry: round(entry),
    confidence: narrative.confidence,
    mfeNifty: round(mfe),
    maeNifty: round(mae),
    simulatedOptionMfe: round(simulatedOptionMfe, 2),
    hit5: simulatedOptionMfe >= 5,
    hit7: simulatedOptionMfe >= 7,
    timeTo5Sec,
    timeTo7Sec,
  };
}

export function replayProSession(
  date: string,
  bars: Candle[],
  priorLevels: PriorAuctionLevels | null
): ProReplaySession {
  const narratives: CandleNarrative[] = [];
  const grades: NarrativeGrade[] = [];
  let lastGradedIndex = -20;
  for (let index = 0; index < bars.length; index++) {
    const narrative = analyzeNarrativeCandle(bars.slice(0, index + 1), priorLevels);
    narratives.push(narrative);
    if (
      narrative.stage === 'CONFIRMED' &&
      index - lastGradedIndex >= 15
    ) {
      const grade = gradeNarrative(bars, narrative);
      if (grade) {
        grades.push(grade);
        lastGradedIndex = index;
      }
    }
  }
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  return {
    date,
    bars,
    priorLevels,
    narratives,
    grades,
    summary: {
      open: bars[0]?.open ?? 0,
      high,
      low,
      close: bars[bars.length - 1]?.close ?? 0,
      rangePts: round(high - low),
      confirmedIdeas: grades.length,
      hit5: grades.filter((grade) => grade.hit5).length,
      hit7: grades.filter((grade) => grade.hit7).length,
    },
  };
}

export function buildPriorAuctionLevels(
  previousSessions: Candle[][]
): PriorAuctionLevels | null {
  const previous = previousSessions[previousSessions.length - 1];
  if (!previous?.length) return null;
  const week = previousSessions.slice(-5).flat();
  return {
    previousHigh: Math.max(...previous.map((bar) => bar.high)),
    previousLow: Math.min(...previous.map((bar) => bar.low)),
    previousClose: previous[previous.length - 1].close,
    weekHigh: Math.max(...week.map((bar) => bar.high)),
    weekLow: Math.min(...week.map((bar) => bar.low)),
  };
}

export function buildProReplayIndex(
  candles: Candle[]
): ProReplayIndexSession[] {
  const grouped = groupNiftyOneMinuteSessions(candles);
  const entries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  const previousSessions: Candle[][] = [];
  const index: ProReplayIndexSession[] = [];
  for (const [date, bars] of entries) {
    if (bars.length < 30) continue;
    const replay = replayProSession(
      date,
      bars,
      buildPriorAuctionLevels(previousSessions)
    );
    index.push({
      date,
      bars: bars.length,
      ...replay.summary,
    });
    previousSessions.push(bars);
  }
  return index;
}
