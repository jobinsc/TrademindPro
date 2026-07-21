import type { Candle } from '@/lib/nejoic';
import { istMinutesOfDay } from '@/lib/option-sim';
import type { UpstoxOptionGreeks } from '@/lib/upstox-options';

export type AtmMovementSample = {
  at: string;
  nifty: number;
  ce: number;
  pe: number;
  ceSpread?: number;
  peSpread?: number;
  ceGreeks?: UpstoxOptionGreeks | null;
  peGreeks?: UpstoxOptionGreeks | null;
  latencyMs?: number;
  runId?: string;
  ceKey?: string;
  peKey?: string;
  strike?: number;
};

export type AtmLockedContract = {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  option: 'CE' | 'PE';
  expiry: string;
  lotSize: number;
};

export type AtmMovementInit = {
  ok: boolean;
  observationOnly: true;
  date: string;
  expiryMode: 'current_week' | 'next_week';
  rolledFromExpiryDay: boolean;
  keys: { nifty: string; ce: string; pe: string };
  contracts: { ce: AtmLockedContract; pe: AtmLockedContract };
  sample: AtmMovementSample;
  candles: Candle[];
  savedSamples?: AtmMovementSample[];
  latencyMs: number;
  candleWarning?: string | null;
  error?: string;
};

export type CriticalLevelKind =
  | 'OR_HIGH'
  | 'OR_LOW'
  | 'SESSION_HIGH'
  | 'SESSION_LOW'
  | 'SWING_HIGH'
  | 'SWING_LOW';

export type CriticalLevel = {
  kind: CriticalLevelKind;
  price: number;
  direction: 'UP' | 'DOWN';
};

export type BreakHorizon = 5 | 15 | 30 | 60;
export type AtmScalpScenario =
  | 'LEVEL_BREAK'
  | 'FAILED_BREAK_REVERSAL'
  | 'MOMENTUM_BURST'
  | 'OPTION_LEADS';

export type AtmBreakEvent = {
  id: string;
  at: string;
  kind: CriticalLevelKind | 'FAST_MOVE';
  scenario: AtmScalpScenario;
  level: number;
  direction: 'UP' | 'DOWN';
  option: 'CE' | 'PE';
  niftyEntry: number;
  optionEntry: number;
  lastOption: number;
  lastNifty: number;
  maxFavorableOptionPts: number;
  maxAdverseOptionPts: number;
  maxFavorableNiftyPts: number;
  realizedDelta: number | null;
  hit5AtMs: number | null;
  hit7AtMs: number | null;
  hit8AtMs: number | null;
  horizonMoves: Partial<Record<BreakHorizon, number>>;
};

export type MovementSummary = {
  events: number;
  hit5: number;
  hit7: number;
  hit8: number;
  hit5Rate: number;
  hit7Rate: number;
  hit8Rate: number;
  avgMfe: number;
  avgMae: number;
};

export type FastScalpReadiness = {
  option: 'CE' | 'PE';
  score: number;
  label: 'GOOD WATCH' | 'CAUTION' | 'POOR';
  requiredNiftyFor5: number;
  requiredNiftyFor7: number;
  thetaPerTradingMinute: number;
  reasons: string[];
};

function round(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function uniqueLevels(levels: CriticalLevel[]): CriticalLevel[] {
  const seen = new Set<string>();
  return levels.filter((level) => {
    const key = `${level.direction}:${Math.round(level.price * 2) / 2}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Freeze levels at observation start—never recalculate them using future data. */
export function mapCriticalLevels(candles: Candle[]): CriticalLevel[] {
  if (!candles.length) return [];
  const sorted = [...candles].sort((a, b) => a.t.localeCompare(b.t));
  const opening = sorted.slice(0, Math.min(15, sorted.length));
  const completed = sorted.slice(0, Math.max(1, sorted.length - 1));
  const recent = completed.slice(-20);

  const orHigh = Math.max(...opening.map((c) => c.high));
  const orLow = Math.min(...opening.map((c) => c.low));
  const sessionHigh = Math.max(...completed.map((c) => c.high));
  const sessionLow = Math.min(...completed.map((c) => c.low));
  const swingHigh = Math.max(...recent.map((c) => c.high));
  const swingLow = Math.min(...recent.map((c) => c.low));

  return uniqueLevels([
    { kind: 'OR_HIGH', price: orHigh, direction: 'UP' },
    { kind: 'OR_LOW', price: orLow, direction: 'DOWN' },
    { kind: 'SESSION_HIGH', price: sessionHigh, direction: 'UP' },
    { kind: 'SESSION_LOW', price: sessionLow, direction: 'DOWN' },
    { kind: 'SWING_HIGH', price: swingHigh, direction: 'UP' },
    { kind: 'SWING_LOW', price: swingLow, direction: 'DOWN' },
  ]).filter((level) => Number.isFinite(level.price) && level.price > 0);
}

/** Build real 1-minute Nifty OHLC from the synchronized one-second samples. */
export function buildOneMinuteCandles(
  samples: AtmMovementSample[]
): Candle[] {
  const buckets = new Map<string, AtmMovementSample[]>();
  for (const sample of samples) {
    const d = new Date(sample.at);
    if (Number.isNaN(d.getTime())) continue;
    d.setUTCSeconds(0, 0);
    const key = d.toISOString();
    const bucket = buckets.get(key) ?? [];
    bucket.push(sample);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, bucket]) => ({
      t,
      open: bucket[0].nifty,
      high: Math.max(...bucket.map((s) => s.nifty)),
      low: Math.min(...bucket.map((s) => s.nifty)),
      close: bucket[bucket.length - 1].nifty,
    }));
}

/** Detect newly crossed frozen levels. A one-point buffer avoids equality noise. */
export function detectCriticalBreaks(
  previous: AtmMovementSample,
  current: AtmMovementSample,
  levels: CriticalLevel[],
  existing: AtmBreakEvent[]
): AtmBreakEvent[] {
  const elapsed =
    new Date(current.at).getTime() - new Date(previous.at).getTime();
  // A large quote gap cannot prove when the level crossed.
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 10000) return [];
  const created: AtmBreakEvent[] = [];
  for (const level of levels) {
    const crossed =
      level.direction === 'UP'
        ? previous.nifty <= level.price && current.nifty >= level.price + 1
        : previous.nifty >= level.price && current.nifty <= level.price - 1;
    if (!crossed) continue;

    // One event per level/direction per minute prevents repeated whipsaw spam.
    const minute = current.at.slice(0, 16);
    if (
      existing.some(
        (event) =>
          event.kind === level.kind &&
          event.direction === level.direction &&
          event.at.slice(0, 16) === minute
      )
    ) {
      continue;
    }

    const option = level.direction === 'UP' ? 'CE' : 'PE';
    const optionEntry = option === 'CE' ? current.ce : current.pe;
    created.push({
      id: `${level.kind}-${current.at}-${created.length}`,
      at: current.at,
      kind: level.kind,
      scenario: 'LEVEL_BREAK',
      level: round(level.price, 1),
      direction: level.direction,
      option,
      niftyEntry: current.nifty,
      optionEntry,
      lastOption: optionEntry,
      lastNifty: current.nifty,
      maxFavorableOptionPts: 0,
      maxAdverseOptionPts: 0,
      maxFavorableNiftyPts: 0,
      realizedDelta: null,
      hit5AtMs: null,
      hit7AtMs: null,
      hit8AtMs: null,
      horizonMoves: {},
    });
  }
  return created;
}

/**
 * Observe several day-trader trigger families instead of assuming one setup.
 * These are candidates for measurement, never trade instructions.
 */
export function detectFastScalpScenarios(
  previous: AtmMovementSample,
  current: AtmMovementSample,
  levels: CriticalLevel[],
  existing: AtmBreakEvent[]
): AtmBreakEvent[] {
  const elapsed = new Date(current.at).getTime() - new Date(previous.at).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 5000) return [];

  const candidates: Array<{
    scenario: Exclude<AtmScalpScenario, 'LEVEL_BREAK'>;
    direction: 'UP' | 'DOWN';
    option: 'CE' | 'PE';
    kind: CriticalLevelKind | 'FAST_MOVE';
    level: number;
  }> = [];

  // Failed upside auction -> PE; reclaimed support -> CE.
  for (const level of levels) {
    if (
      level.direction === 'UP' &&
      previous.nifty >= level.price + 1 &&
      current.nifty <= level.price - 1
    ) {
      candidates.push({
        scenario: 'FAILED_BREAK_REVERSAL',
        direction: 'DOWN',
        option: 'PE',
        kind: level.kind,
        level: level.price,
      });
    } else if (
      level.direction === 'DOWN' &&
      previous.nifty <= level.price - 1 &&
      current.nifty >= level.price + 1
    ) {
      candidates.push({
        scenario: 'FAILED_BREAK_REVERSAL',
        direction: 'UP',
        option: 'CE',
        kind: level.kind,
        level: level.price,
      });
    }
  }

  const niftyMove = current.nifty - previous.nifty;
  const ceMove = current.ce - previous.ce;
  const peMove = current.pe - previous.pe;
  if (niftyMove >= 4) {
    candidates.push({
      scenario: 'MOMENTUM_BURST',
      direction: 'UP',
      option: 'CE',
      kind: 'FAST_MOVE',
      level: current.nifty,
    });
  } else if (niftyMove <= -4) {
    candidates.push({
      scenario: 'MOMENTUM_BURST',
      direction: 'DOWN',
      option: 'PE',
      kind: 'FAST_MOVE',
      level: current.nifty,
    });
  }
  if (ceMove >= 2 && niftyMove > 0) {
    candidates.push({
      scenario: 'OPTION_LEADS',
      direction: 'UP',
      option: 'CE',
      kind: 'FAST_MOVE',
      level: current.nifty,
    });
  }
  if (peMove >= 2 && niftyMove < 0) {
    candidates.push({
      scenario: 'OPTION_LEADS',
      direction: 'DOWN',
      option: 'PE',
      kind: 'FAST_MOVE',
      level: current.nifty,
    });
  }

  const now = new Date(current.at).getTime();
  const created: AtmBreakEvent[] = [];
  for (const candidate of candidates) {
    // Avoid counting the same family repeatedly during one burst.
    if (
      [...existing, ...created].some(
        (event) =>
          event.scenario === candidate.scenario &&
          event.option === candidate.option &&
          now - new Date(event.at).getTime() < 15000
      )
    ) {
      continue;
    }
    const optionEntry = candidate.option === 'CE' ? current.ce : current.pe;
    created.push({
      id: `${candidate.scenario}-${candidate.option}-${candidate.kind}-${current.at}`,
      at: current.at,
      kind: candidate.kind,
      scenario: candidate.scenario,
      level: round(candidate.level, 1),
      direction: candidate.direction,
      option: candidate.option,
      niftyEntry: current.nifty,
      optionEntry,
      lastOption: optionEntry,
      lastNifty: current.nifty,
      maxFavorableOptionPts: 0,
      maxAdverseOptionPts: 0,
      maxFavorableNiftyPts: 0,
      realizedDelta: null,
      hit5AtMs: null,
      hit7AtMs: null,
      hit8AtMs: null,
      horizonMoves: {},
    });
  }
  return created;
}

export function updateBreakEvents(
  events: AtmBreakEvent[],
  sample: AtmMovementSample
): AtmBreakEvent[] {
  const now = new Date(sample.at).getTime();
  return events.map((event) => {
    const started = new Date(event.at).getTime();
    if (!Number.isFinite(started) || now < started) return event;
    const elapsedMs = now - started;
    if (elapsedMs > 60000 && event.horizonMoves[60] != null) return event;
    const optionNow = event.option === 'CE' ? sample.ce : sample.pe;
    const optionMove = optionNow - event.optionEntry;
    const signedNiftyMove =
      event.direction === 'UP'
        ? sample.nifty - event.niftyEntry
        : event.niftyEntry - sample.nifty;
    const horizonMoves = { ...event.horizonMoves };
    for (const seconds of [5, 15, 30, 60] as BreakHorizon[]) {
      if (elapsedMs >= seconds * 1000 && horizonMoves[seconds] == null) {
        horizonMoves[seconds] = round(optionMove);
      }
    }

    return {
      ...event,
      lastOption: optionNow,
      lastNifty: sample.nifty,
      maxFavorableOptionPts: round(
        Math.max(event.maxFavorableOptionPts, optionMove)
      ),
      maxAdverseOptionPts: round(
        Math.min(event.maxAdverseOptionPts, optionMove)
      ),
      maxFavorableNiftyPts: round(
        Math.max(event.maxFavorableNiftyPts, signedNiftyMove),
        1
      ),
      realizedDelta:
        Math.abs(signedNiftyMove) >= 0.5
          ? round(optionMove / signedNiftyMove, 3)
          : event.realizedDelta,
      hit5AtMs:
        event.hit5AtMs ?? (optionMove >= 5 ? elapsedMs : null),
      hit7AtMs:
        event.hit7AtMs ?? (optionMove >= 7 ? elapsedMs : null),
      hit8AtMs:
        event.hit8AtMs ?? (optionMove >= 8 ? elapsedMs : null),
      horizonMoves,
    };
  });
}

export function replayBreakEvents(
  samples: AtmMovementSample[],
  levels: CriticalLevel[]
): AtmBreakEvent[] {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  let events: AtmBreakEvent[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const sample = sorted[i];
    events = updateBreakEvents(events, sample);
    if (i > 0) {
      events.push(
        ...detectCriticalBreaks(sorted[i - 1], sample, levels, events),
        ...detectFastScalpScenarios(sorted[i - 1], sample, levels, events)
      );
    }
  }
  return events;
}

export function summarizeMovement(
  events: AtmBreakEvent[]
): MovementSummary {
  const n = events.length;
  const hit5 = events.filter((e) => e.hit5AtMs != null).length;
  const hit7 = events.filter((e) => e.hit7AtMs != null).length;
  const hit8 = events.filter((e) => e.hit8AtMs != null).length;
  return {
    events: n,
    hit5,
    hit7,
    hit8,
    hit5Rate: n ? round((hit5 / n) * 100, 1) : 0,
    hit7Rate: n ? round((hit7 / n) * 100, 1) : 0,
    hit8Rate: n ? round((hit8 / n) * 100, 1) : 0,
    avgMfe: n
      ? round(events.reduce((sum, e) => sum + e.maxFavorableOptionPts, 0) / n)
      : 0,
    avgMae: n
      ? round(events.reduce((sum, e) => sum + e.maxAdverseOptionPts, 0) / n)
      : 0,
  };
}

export function estimatedNetOptionPoints(
  grossPoints: number,
  lotSize: number,
  roundTripCost = 175,
  slippagePoints = 0.5
): number {
  const costPoints = roundTripCost / Math.max(1, lotSize);
  return round(grossPoints - costPoints - slippagePoints);
}

/**
 * Approximate spot move needed for a short-lived option target using
 * dPremium ≈ |delta|·dSpot + 0.5·gamma·dSpot².
 */
export function assessFastScalpReadiness(
  sample: AtmMovementSample,
  option: 'CE' | 'PE'
): FastScalpReadiness | null {
  const greek = option === 'CE' ? sample.ceGreeks : sample.peGreeks;
  if (!greek) return null;
  const delta = Math.abs(greek.delta);
  const gamma = Math.max(0, greek.gamma);
  const spread = option === 'CE' ? sample.ceSpread : sample.peSpread;
  const requiredMove = (target: number) => {
    if (gamma > 0.000001) {
      return (-delta + Math.sqrt(delta ** 2 + 2 * gamma * target)) / gamma;
    }
    return target / Math.max(0.05, delta);
  };
  const requiredNiftyFor5 = round(requiredMove(5), 1);
  const requiredNiftyFor7 = round(requiredMove(7), 1);
  const thetaPerTradingMinute = round(Math.abs(greek.theta) / 375, 3);
  const reasons: string[] = [];
  let score = 100;

  if (delta < 0.35) {
    score -= 25;
    reasons.push('low delta');
  }
  if (requiredNiftyFor7 > 20) {
    score -= 20;
    reasons.push('large Nifty move needed');
  }
  if (spread != null && spread > 0.5) {
    score -= 25;
    reasons.push('wide spread');
  }
  if ((sample.latencyMs ?? 0) > 300) {
    score -= 15;
    reasons.push('slow quote');
  }
  if (thetaPerTradingMinute > 0.2) {
    score -= 15;
    reasons.push('high theta drag');
  }
  if (gamma > 0.002) reasons.push('high gamma/reversal risk');
  if (!reasons.length) reasons.push('Greeks, spread and latency aligned');

  score = Math.max(0, Math.min(100, score));
  return {
    option,
    score,
    label: score >= 75 ? 'GOOD WATCH' : score >= 50 ? 'CAUTION' : 'POOR',
    requiredNiftyFor5,
    requiredNiftyFor7,
    thetaPerTradingMinute,
    reasons,
  };
}

export function observationCutoffReached(iso: string): boolean {
  const mins = istMinutesOfDay(iso);
  return mins != null && mins >= 15 * 60 + 15;
}

export function isExpiryObservationDay(
  sessionDate: string,
  expiry: string
): boolean {
  return expiry.slice(0, 10) === sessionDate.slice(0, 10);
}
