/**
 * Deep chart study for one Nifty 3m session — what a serious day trader maps:
 * swings, multi-level S/R, OR, session phases, PA sequence, distance-to-levels.
 */

import type { Candle } from '@/lib/nejoic';
import { runPriceAction, type StructureLabel } from '@/lib/price-action';

export type SrLevel = {
  price: number;
  kind: 'support' | 'resistance';
  touches: number;
  strength: 'weak' | 'medium' | 'strong';
  note: string;
};

export type SwingMark = {
  label: StructureLabel;
  price: number;
  time: string;
  kind: 'high' | 'low';
};

export type SessionPhaseStudy = {
  phase: 'open' | 'mid' | 'close';
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  bias: 'bull' | 'bear' | 'chop';
  note: string;
};

export type DeepChartStudy = {
  /** Ordered swing labels through the day */
  swingSequence: string;
  swings: SwingMark[];
  /** Ranked support levels (nearest first) */
  supports: SrLevel[];
  /** Ranked resistance levels (nearest first) */
  resistances: SrLevel[];
  openingRange: { high: number; low: number; mid: number; widthPts: number };
  dayRange: { high: number; low: number; mid: number; widthPts: number; widthPct: number };
  /** Where close sits vs structure */
  closeContext: {
    vsOpen: string;
    vsOr: string;
    vsNearestSupport: string;
    vsNearestResistance: string;
    inPremiumOrDiscount: 'premium' | 'discount' | 'equilibrium';
  };
  phases: SessionPhaseStudy[];
  /** Candle reactions at levels (trader reads) */
  reactions: string[];
  /** Full narrative a desk trader would write */
  traderBrief: string;
};

function clusterLevels(
  prices: number[],
  spot: number,
  kind: 'support' | 'resistance',
  tolPct = 0.08
): SrLevel[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { sum: number; n: number; prices: number[] }[] = [];

  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.sum / last.n) / spot <= tolPct / 100) {
      last.sum += p;
      last.n += 1;
      last.prices.push(p);
    } else {
      clusters.push({ sum: p, n: 1, prices: [p] });
    }
  }

  return clusters
    .map((c) => {
      const price = c.sum / c.n;
      const touches = c.n;
      const strength: SrLevel['strength'] =
        touches >= 3 ? 'strong' : touches === 2 ? 'medium' : 'weak';
      const dist = ((spot - price) / spot) * 100;
      return {
        price: Math.round(price * 10) / 10,
        kind,
        touches,
        strength,
        note:
          kind === 'support'
            ? `${touches}× pivot low · ${dist.toFixed(2)}% below spot`
            : `${touches}× pivot high · ${Math.abs(dist).toFixed(2)}% above spot`,
      };
    })
    .sort((a, b) =>
      kind === 'support'
        ? Math.abs(spot - a.price) - Math.abs(spot - b.price)
        : Math.abs(a.price - spot) - Math.abs(b.price - spot)
    )
    .slice(0, 4);
}

function phaseSlice(bars: Candle[], fromPct: number, toPct: number): Candle[] {
  const a = Math.floor(bars.length * fromPct);
  const b = Math.max(a + 1, Math.ceil(bars.length * toPct));
  return bars.slice(a, b);
}

function studyPhase(phase: SessionPhaseStudy['phase'], slice: Candle[]): SessionPhaseStudy {
  const open = slice[0].open;
  const close = slice[slice.length - 1].close;
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const changePct = open ? ((close - open) / open) * 100 : 0;
  const range = high - low || 1;
  const body = Math.abs(close - open);
  let bias: SessionPhaseStudy['bias'] = 'chop';
  if (changePct > 0.05 && close > open) bias = 'bull';
  else if (changePct < -0.05 && close < open) bias = 'bear';
  else if (body / range < 0.35) bias = 'chop';
  else bias = close >= open ? 'bull' : 'bear';

  const note =
    bias === 'bull'
      ? `${phase}: buyers in control (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`
      : bias === 'bear'
        ? `${phase}: sellers in control (${changePct.toFixed(2)}%)`
        : `${phase}: balance / chop — wait for edge`;

  return { phase, open, high, low, close, changePct, bias, note };
}

function findReactions(bars: Candle[], supports: SrLevel[], resistances: SrLevel[]): string[] {
  const out: string[] = [];
  const lastN = bars.slice(-40);
  for (const c of lastN) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 1;
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    for (const s of supports.slice(0, 2)) {
      if (c.low <= s.price * 1.001 && c.close > s.price && lowerWick > body * 1.2) {
        out.push(`Rejection up from support ${s.price} (bull wick)`);
      }
    }
    for (const r of resistances.slice(0, 2)) {
      if (c.high >= r.price * 0.999 && c.close < r.price && upperWick > body * 1.2) {
        out.push(`Rejection down from resistance ${r.price} (bear wick)`);
      }
    }
    if (body / range > 0.7 && c.close > c.open) {
      const prev = bars[bars.indexOf(c) - 1];
      if (prev && c.close > prev.high) out.push(`Bullish break candle @ ${c.close.toFixed(1)}`);
    }
    if (body / range > 0.7 && c.close < c.open) {
      const prev = bars[bars.indexOf(c) - 1];
      if (prev && c.close < prev.low) out.push(`Bearish break candle @ ${c.close.toFixed(1)}`);
    }
  }
  // unique, max 6
  return [...new Set(out)].slice(0, 6);
}

/**
 * Full trader map of one session.
 */
export function buildDeepChartStudy(bars: Candle[]): DeepChartStudy {
  const spot = bars[bars.length - 1].close;
  const open = bars[0].open;
  const dayHigh = Math.max(...bars.map((c) => c.high));
  const dayLow = Math.min(...bars.map((c) => c.low));
  const dayMid = (dayHigh + dayLow) / 2;
  const dayWidth = dayHigh - dayLow;

  const pa = runPriceAction(bars, { leftBars: 5, rightBars: 5 });
  const swings: SwingMark[] = pa.labels.map((l) => ({
    label: l.label,
    price: l.price,
    time: l.time,
    kind: l.label === 'HH' || l.label === 'LH' ? 'high' : 'low',
  }));

  const pivotLows = pa.points.filter((p) => p.kind === -1).map((p) => p.price);
  const pivotHighs = pa.points.filter((p) => p.kind === 1).map((p) => p.price);
  // Also include day extremes as S/R
  pivotLows.push(dayLow);
  pivotHighs.push(dayHigh);

  const supports = clusterLevels(pivotLows.filter((p) => p <= spot * 1.002), spot, 'support');
  const resistances = clusterLevels(
    pivotHighs.filter((p) => p >= spot * 0.998),
    spot,
    'resistance'
  );

  const orBars = bars.slice(0, Math.min(5, bars.length));
  const orHigh = Math.max(...orBars.map((c) => c.high));
  const orLow = Math.min(...orBars.map((c) => c.low));
  const orMid = (orHigh + orLow) / 2;

  const nearestSup = supports[0]?.price ?? dayLow;
  const nearestRes = resistances[0]?.price ?? dayHigh;

  let vsOr = 'inside OR';
  if (spot > orHigh) vsOr = `above OR high ${orHigh.toFixed(1)} (bull continuation zone)`;
  else if (spot < orLow) vsOr = `below OR low ${orLow.toFixed(1)} (bear continuation zone)`;

  const premiumDiscount: DeepChartStudy['closeContext']['inPremiumOrDiscount'] =
    spot > dayMid + dayWidth * 0.1
      ? 'premium'
      : spot < dayMid - dayWidth * 0.1
        ? 'discount'
        : 'equilibrium';

  const phases = [
    studyPhase('open', phaseSlice(bars, 0, 0.33)),
    studyPhase('mid', phaseSlice(bars, 0.33, 0.66)),
    studyPhase('close', phaseSlice(bars, 0.66, 1)),
  ];

  const reactions = findReactions(bars, supports, resistances);

  const swingSequence =
    swings.length > 0
      ? swings.map((s) => `${s.label}@${s.price.toFixed(0)}`).join(' → ')
      : pa.structureText;

  const traderBrief = [
    `Session map: O ${open.toFixed(1)} / H ${dayHigh.toFixed(1)} / L ${dayLow.toFixed(1)} / C ${spot.toFixed(1)}.`,
    `Range ${dayWidth.toFixed(1)} pts (${((dayWidth / open) * 100).toFixed(2)}%) · close in ${premiumDiscount}.`,
    `OR ${orLow.toFixed(1)}–${orHigh.toFixed(1)}; price ${vsOr}.`,
    `Swings: ${swingSequence}.`,
    supports.length
      ? `Supports: ${supports.map((s) => `${s.price}(${s.strength})`).join(', ')}.`
      : 'Supports: thin.',
    resistances.length
      ? `Resistances: ${resistances.map((r) => `${r.price}(${r.strength})`).join(', ')}.`
      : 'Resistances: thin.',
    `Phases: ${phases.map((p) => p.note).join(' | ')}.`,
    reactions.length ? `Reactions: ${reactions.join('; ')}.` : 'No sharp level reactions logged.',
    `Nearest buy defense ~${nearestSup.toFixed(1)}; nearest sell ceiling ~${nearestRes.toFixed(1)}.`,
  ].join(' ');

  return {
    swingSequence,
    swings,
    supports,
    resistances,
    openingRange: {
      high: Math.round(orHigh * 10) / 10,
      low: Math.round(orLow * 10) / 10,
      mid: Math.round(orMid * 10) / 10,
      widthPts: Math.round((orHigh - orLow) * 10) / 10,
    },
    dayRange: {
      high: Math.round(dayHigh * 10) / 10,
      low: Math.round(dayLow * 10) / 10,
      mid: Math.round(dayMid * 10) / 10,
      widthPts: Math.round(dayWidth * 10) / 10,
      widthPct: Math.round((dayWidth / open) * 10000) / 100,
    },
    closeContext: {
      vsOpen: `${spot >= open ? '+' : ''}${(((spot - open) / open) * 100).toFixed(2)}% vs open`,
      vsOr,
      vsNearestSupport: `Support ${nearestSup.toFixed(1)} · ${(((spot - nearestSup) / spot) * 100).toFixed(2)}% above`,
      vsNearestResistance: `Resistance ${nearestRes.toFixed(1)} · ${(((nearestRes - spot) / spot) * 100).toFixed(2)}% below`,
      inPremiumOrDiscount: premiumDiscount,
    },
    phases,
    reactions,
    traderBrief,
  };
}
