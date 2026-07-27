/**
 * Blink anticipatory brief for ATM Movement Lab.
 * Uses prior 3-day context + today's morning structure + MA/RSI + CE/PE tape
 * to decide STALK / PREPARE before the next leg — never places orders.
 */

import type { Candle } from '@/lib/nejoic';
import { detectChartTechniques } from '@/lib/blink-chart-techniques';
import { detectMarketScenario } from '@/lib/blink-nifty-pa-profile';
import { runPriceAction } from '@/lib/price-action';
import {
  assessFastScalpReadiness,
  buildOneMinuteCandles,
  type AtmMovementSample,
  type CriticalLevel,
  type FastScalpReadiness,
} from '@/lib/blink-atm-movement';
import {
  buildAtmTraderContext,
  readMorningDesk,
  splitTodayCandles,
  type AtmTraderContext,
  type MorningDeskRead,
} from '@/lib/blink-atm-trader-context';

export type AtmBlinkMode =
  | 'WARMUP'
  | 'FLAT'
  | 'STALK'
  | 'PREPARE_CE'
  | 'PREPARE_PE'
  | 'WAIT_CONFIRM';

export type AtmBlinkBrief = {
  at: string;
  mode: AtmBlinkMode;
  bias: 'CE' | 'PE' | 'FLAT';
  confidence: number;
  headline: string;
  thesis: string;
  mustHappenFirst: string[];
  invalidation: string;
  indicators: {
    ema9: number | null;
    ema21: number | null;
    rsi: number | null;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    compression: boolean;
    nearestLevel: {
      kind: string;
      price: number;
      distance: number;
      side: 'ABOVE' | 'BELOW' | 'AT';
    } | null;
  };
  tape: {
    niftyDelta1s: number;
    ceDelta1s: number;
    peDelta1s: number;
    optionLeadsSpot: 'CE' | 'PE' | null;
  };
  desk: MorningDeskRead | null;
  context: AtmTraderContext | null;
  patterns: string[];
  readiness: { ce: FastScalpReadiness | null; pe: FastScalpReadiness | null };
  tradingIdeaPossible: boolean;
  ideaVerdict: string;
};

function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsiAt(closes: number[], period: number): number {
  if (closes.length < period + 2) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function mergeCandles(seed: Candle[], live: Candle[]): Candle[] {
  const map = new Map<string, Candle>();
  for (const c of [...seed, ...live]) {
    if (!c?.t || !Number.isFinite(c.close)) continue;
    map.set(c.t, c);
  }
  return [...map.values()].sort((a, b) => a.t.localeCompare(b.t));
}

function nearestLevel(spot: number, levels: CriticalLevel[]) {
  if (!levels.length) return null;
  let best: CriticalLevel | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const level of levels) {
    const d = Math.abs(spot - level.price);
    if (d < bestDist) {
      bestDist = d;
      best = level;
    }
  }
  if (!best) return null;
  const side =
    Math.abs(spot - best.price) <= 1.5
      ? ('AT' as const)
      : spot > best.price
        ? ('ABOVE' as const)
        : ('BELOW' as const);
  return {
    kind: best.kind,
    price: best.price,
    distance: Math.round(bestDist * 10) / 10,
    side,
    direction: best.direction,
  };
}

function recentRange(candles: Candle[], bars = 8): number {
  const slice = candles.slice(-bars);
  if (slice.length < 3) return 999;
  return Math.max(...slice.map((c) => c.high)) - Math.min(...slice.map((c) => c.low));
}

function istSessionDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Thorough Blink read — prior 3 days + morning desk + indicators + tape.
 * Decisions are anticipatory (before the break).
 */
export function buildAtmBlinkBrief(
  samples: AtmMovementSample[],
  levels: CriticalLevel[],
  seedCandles: Candle[] = [],
  traderContext: AtmTraderContext | null = null
): AtmBlinkBrief | null {
  if (!samples.length) return null;
  const latest = samples[samples.length - 1];
  const prev = samples.length > 1 ? samples[samples.length - 2] : latest;
  const sessionDate = istSessionDate(latest.at);
  const liveMinutes = buildOneMinuteCandles(samples);
  const allCandles = mergeCandles(seedCandles, liveMinutes);
  const { today, prior } = splitTodayCandles(allCandles, sessionDate);
  const context =
    traderContext ??
    buildAtmTraderContext([...prior, ...today], sessionDate);
  const desk = readMorningDesk(today.length ? today : liveMinutes, context, latest.nifty);

  const spot = latest.nifty;
  const ceReadiness = assessFastScalpReadiness(latest, 'CE');
  const peReadiness = assessFastScalpReadiness(latest, 'PE');

  const niftyDelta1s = Math.round((latest.nifty - prev.nifty) * 100) / 100;
  const ceDelta1s = Math.round((latest.ce - prev.ce) * 100) / 100;
  const peDelta1s = Math.round((latest.pe - prev.pe) * 100) / 100;

  let optionLeadsSpot: 'CE' | 'PE' | null = null;
  if (ceDelta1s >= 1.2 && Math.abs(niftyDelta1s) < 1.5 && ceDelta1s > peDelta1s) {
    optionLeadsSpot = 'CE';
  } else if (peDelta1s >= 1.2 && Math.abs(niftyDelta1s) < 1.5 && peDelta1s > ceDelta1s) {
    optionLeadsSpot = 'PE';
  }

  const analysisBars = today.length >= 8 ? today : allCandles;

  if (analysisBars.length < 8 && !desk) {
    return {
      at: latest.at,
      mode: 'WARMUP',
      bias: 'FLAT',
      confidence: 25,
      headline: 'Blink warming up — loading morning structure + prior days.',
      thesis:
        'Nifty and ATM CE/PE are watched. Waiting for enough today bars; prior 3-day context loads on init.',
      mustHappenFirst: [
        'Collect early 1-minute bars after 9:15',
        'Confirm PDH/PDL from prior sessions',
        'Lock ATM CE/PE quotes',
      ],
      invalidation: 'N/A until structure is ready',
      indicators: {
        ema9: null,
        ema21: null,
        rsi: null,
        trend: 'SIDEWAYS',
        compression: false,
        nearestLevel: null,
      },
      tape: { niftyDelta1s, ceDelta1s, peDelta1s, optionLeadsSpot },
      desk: null,
      context,
      patterns: context ? [context.threeDayNote] : [],
      readiness: { ce: ceReadiness, pe: peReadiness },
      tradingIdeaPossible: false,
      ideaVerdict:
        'Not yet — Blink needs a few more minutes of today’s auction.',
    };
  }

  const closes = analysisBars.map((c) => c.close);
  const ema9Series = ema(closes, 9);
  const ema21Series = ema(closes, 21);
  const ema9 = ema9Series[ema9Series.length - 1] ?? null;
  const ema21 = ema21Series[ema21Series.length - 1] ?? null;
  const rsi = rsiAt(closes, 14);
  const compression = recentRange(analysisBars, 8) <= 18;
  const near = nearestLevel(spot, levels);

  // Scenario from TODAY only — never mix prior days into day-open bias.
  const mkt = detectMarketScenario(analysisBars);
  const pa = runPriceAction(analysisBars, { leftBars: 5, rightBars: 5 });
  const technique = detectChartTechniques(analysisBars, pa, mkt.scenario);

  // Desk bias overrides weak SIDEWAYS labels when morning dump/rally is clear.
  let trend: 'UP' | 'DOWN' | 'SIDEWAYS' =
    mkt.scenario === 'UP' ? 'UP' : mkt.scenario === 'DOWN' ? 'DOWN' : 'SIDEWAYS';
  if (desk?.bias === 'DOWN' && trend !== 'UP') trend = 'DOWN';
  if (desk?.bias === 'UP' && trend !== 'DOWN') trend = 'UP';
  if (desk && desk.bias !== 'SIDEWAYS' && desk.confidence >= 62) {
    trend = desk.bias;
  }

  const patterns: string[] = [];
  if (context.threeDayNote) patterns.push(context.threeDayNote);
  if (desk?.reasons?.length) patterns.push(...desk.reasons.slice(0, 3));
  if (mkt.structureText) patterns.push(mkt.structureText);
  if (technique) patterns.push(`${technique.id}: ${technique.reason}`);
  if (ema9 != null && ema21 != null) {
    if (ema9 > ema21 + 2) patterns.push('EMA9 above EMA21 — bullish stack');
    else if (ema9 < ema21 - 2) patterns.push('EMA9 below EMA21 — bearish stack');
    else patterns.push('EMA9/21 flat / intertwined');
  }
  if (rsi >= 68) patterns.push(`RSI ${rsi.toFixed(0)} elevated`);
  else if (rsi <= 32) patterns.push(`RSI ${rsi.toFixed(0)} washed`);
  if (compression) patterns.push('Tight range — break energy building');
  if (optionLeadsSpot) {
    patterns.push(`${optionLeadsSpot} premium leading while Nifty quiet`);
  }
  if (context.pdh != null) patterns.push(`PDH ${context.pdh.toFixed(1)}`);
  if (context.pdl != null) patterns.push(`PDL ${context.pdl.toFixed(1)}`);

  const mustHappenFirst: string[] = [];
  let mode: AtmBlinkMode = 'STALK';
  let bias: 'CE' | 'PE' | 'FLAT' = 'FLAT';
  let confidence = Math.max(42, desk?.confidence ?? 42);
  let headline =
    desk?.bias === 'DOWN'
      ? `Blink sees morning DOWN (${desk.fromOpenPts} pts from open) — prepare PE on rallies.`
      : desk?.bias === 'UP'
        ? `Blink sees morning UP (+${desk.fromOpenPts} pts from open) — prepare CE on dips.`
        : 'Blink STALK — watching levels; no forced side yet.';
  let thesis = [
    desk ? `Desk bias ${desk.bias} @ ${desk.confidence}%.` : '',
    context.threeDayNote,
    mkt.plain,
  ]
    .filter(Boolean)
    .join(' ');
  let invalidation = 'Stay flat until location + confirmation agree.';
  let tradingIdeaPossible = false;

  const nearEnough = near != null && near.distance <= 15;
  const veryNear = near != null && near.distance <= 6;
  const bullMa = ema9 != null && ema21 != null && ema9 > ema21;
  const bearMa = ema9 != null && ema21 != null && ema9 < ema21;
  const ceOk = (ceReadiness?.score ?? 0) >= 55;
  const peOk = (peReadiness?.score ?? 0) >= 55;

  // ——— Trader-style anticipatory prepare from morning bias (BEFORE next leg) ———
  if (trend === 'DOWN' || desk?.bias === 'DOWN') {
    bias = 'PE';
    mode = nearEnough || compression || optionLeadsSpot === 'PE' || (desk?.confidence ?? 0) >= 70
      ? 'PREPARE_PE'
      : 'WAIT_CONFIRM';
    confidence = Math.min(
      90,
      Math.max(
        confidence,
        58 +
          (desk?.bias === 'DOWN' ? 10 : 0) +
          (bearMa ? 8 : 0) +
          (veryNear ? 8 : 0) +
          (context.threeDayTrend === 'DOWN' ? 5 : 0) +
          (optionLeadsSpot === 'PE' ? 6 : 0) +
          (peOk ? 4 : 0)
      )
    );
    headline = `Blink PREPARE PE — downtrend context before next sell leg.`;
    thesis = `Sellers control the morning. Do not chase PE mid-drop. Wait for a bounce into resistance/EMA/PDH or OR high, then PE if rejection prints. ${desk?.reasons?.join('; ') || ''}`;
    mustHappenFirst.push(
      near
        ? `Watch rejection at ${near.kind} ${near.price.toFixed(1)} (or EMA21 ${ema21?.toFixed(1) ?? '—'})`
        : `Watch bounce into EMA21 ${ema21?.toFixed(1) ?? '—'} / OR high / PDH`,
      'ATM PE expands ≥1.5–2 pts as Nifty fails the bounce',
      'No CE chase while desk bias is DOWN'
    );
    invalidation = `Nifty reclaims day open ${desk?.dayOpen.toFixed(1) ?? '—'} and holds above with HH/HL.`;
    tradingIdeaPossible = confidence >= 64 && peOk;
  } else if (trend === 'UP' || desk?.bias === 'UP') {
    bias = 'CE';
    mode = nearEnough || compression || optionLeadsSpot === 'CE' || (desk?.confidence ?? 0) >= 70
      ? 'PREPARE_CE'
      : 'WAIT_CONFIRM';
    confidence = Math.min(
      90,
      Math.max(
        confidence,
        58 +
          (desk?.bias === 'UP' ? 10 : 0) +
          (bullMa ? 8 : 0) +
          (veryNear ? 8 : 0) +
          (context.threeDayTrend === 'UP' ? 5 : 0) +
          (optionLeadsSpot === 'CE' ? 6 : 0) +
          (ceOk ? 4 : 0)
      )
    );
    headline = `Blink PREPARE CE — uptrend context before next buy leg.`;
    thesis = `Buyers control the morning. Do not chase CE mid-spike. Wait for a dip into support/EMA/PDL or OR low, then CE if reclaim prints. ${desk?.reasons?.join('; ') || ''}`;
    mustHappenFirst.push(
      near
        ? `Watch reclaim at ${near.kind} ${near.price.toFixed(1)} (or EMA21 ${ema21?.toFixed(1) ?? '—'})`
        : `Watch dip into EMA21 ${ema21?.toFixed(1) ?? '—'} / OR low / PDL`,
      'ATM CE expands ≥1.5–2 pts as Nifty holds the dip',
      'No PE chase while desk bias is UP'
    );
    invalidation = `Nifty loses day open ${desk?.dayOpen.toFixed(1) ?? '—'} and prints LH/LL.`;
    tradingIdeaPossible = confidence >= 64 && ceOk;
  }

  // Level-specific refine when near a mapped level
  if (nearEnough && near && bias === 'FLAT') {
    if (near.direction === 'UP' && (bullMa || trend === 'UP' || optionLeadsSpot === 'CE')) {
      mode = veryNear || compression ? 'PREPARE_CE' : 'WAIT_CONFIRM';
      bias = 'CE';
      confidence = Math.max(confidence, 60);
      headline = `Blink PREPARE CE — near ${near.kind} ${near.price.toFixed(1)}.`;
      mustHappenFirst.push(
        `Acceptance above ${near.price.toFixed(1)} (+1) with CE expansion`
      );
    } else if (
      near.direction === 'DOWN' &&
      (bearMa || trend === 'DOWN' || optionLeadsSpot === 'PE')
    ) {
      mode = veryNear || compression ? 'PREPARE_PE' : 'WAIT_CONFIRM';
      bias = 'PE';
      confidence = Math.max(confidence, 60);
      headline = `Blink PREPARE PE — near ${near.kind} ${near.price.toFixed(1)}.`;
      mustHappenFirst.push(
        `Acceptance below ${near.price.toFixed(1)} (−1) with PE expansion`
      );
    }
  }

  if (technique && (nearEnough || compression || trend !== 'SIDEWAYS')) {
    if (technique.bias === 'CE' && bias !== 'PE') {
      if (mode === 'STALK') mode = 'WAIT_CONFIRM';
      bias = 'CE';
      confidence = Math.max(confidence, Math.min(84, technique.confidence - 2));
      mustHappenFirst.push(technique.entryZone);
      thesis = `${thesis} Chart: ${technique.reason}`;
      invalidation = technique.invalidation;
    } else if (technique.bias === 'PE' && bias !== 'CE') {
      if (mode === 'STALK') mode = 'WAIT_CONFIRM';
      bias = 'PE';
      confidence = Math.max(confidence, Math.min(84, technique.confidence - 2));
      mustHappenFirst.push(technique.entryZone);
      thesis = `${thesis} Chart: ${technique.reason}`;
      invalidation = technique.invalidation;
    }
  }

  if (optionLeadsSpot && mode === 'STALK') {
    mode = optionLeadsSpot === 'CE' ? 'PREPARE_CE' : 'PREPARE_PE';
    bias = optionLeadsSpot;
    confidence = Math.max(confidence, 58);
    mustHappenFirst.push(
      `Nifty confirms ${optionLeadsSpot === 'CE' ? 'up' : 'down'} ≥2–3 pts`
    );
    tradingIdeaPossible = false;
  }

  if (!mustHappenFirst.length) {
    mustHappenFirst.push(
      'Identify morning bias from open + LH/LL or HH/HL',
      'Use PDH/PDL + OR + EMA as location',
      'Prepare the side BEFORE the break; confirm with option expansion'
    );
  }

  let ideaVerdict: string;
  if (mode === 'STALK') {
    ideaVerdict =
      'No clear idea yet — but prior days + live tape are loading. Blink will prepare early once morning bias or level location is clear.';
  } else if (tradingIdeaPossible) {
    ideaVerdict = `Yes — ${bias} idea forming BEFORE the next leg (${mode}, ${confidence}%). Still wait for must-happen confirmation; observation only.`;
  } else {
    ideaVerdict = `Partial ${bias} prepare from desk/tape. Useful for anticipation, not yet a confirmed trade — wait for the checklist.`;
  }

  return {
    at: latest.at,
    mode,
    bias,
    confidence,
    headline,
    thesis,
    mustHappenFirst: [...new Set(mustHappenFirst)].slice(0, 5),
    invalidation,
    indicators: {
      ema9: ema9 != null ? Math.round(ema9 * 10) / 10 : null,
      ema21: ema21 != null ? Math.round(ema21 * 10) / 10 : null,
      rsi: Math.round(rsi * 10) / 10,
      trend,
      compression,
      nearestLevel: near
        ? {
            kind: near.kind,
            price: near.price,
            distance: near.distance,
            side: near.side,
          }
        : null,
    },
    tape: { niftyDelta1s, ceDelta1s, peDelta1s, optionLeadsSpot },
    desk,
    context,
    patterns: patterns.slice(0, 8),
    readiness: { ce: ceReadiness, pe: peReadiness },
    tradingIdeaPossible,
    ideaVerdict,
  };
}
