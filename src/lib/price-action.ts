/**
 * Higher High / Lower Low price-action engine
 * Port of TradingView HH/LL study (LonesomeThecolor.blue style, MPL-2.0).
 * Nejoic uses this only — plain chart structure, no indicators.
 * Defaults: Left Bars = 5, Right Bars = 5 (same as your Pine).
 */

export type PaCandle = {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type PivotKind = 1 | -1; // 1 = swing high, -1 = swing low
export type StructureLabel = 'HH' | 'HL' | 'LH' | 'LL';

export type StructurePoint = {
  index: number;
  price: number;
  kind: PivotKind;
  label: StructureLabel | null;
  time: string;
};

export type PriceActionResult = {
  leftBars: number;
  rightBars: number;
  points: StructurePoint[];
  labels: { index: number; label: StructureLabel; price: number; time: string }[];
  support: number | null;
  resistance: number | null;
  trend: 1 | -1 | 0;
  lastLabel: StructureLabel | null;
  structureText: string;
  bias: 'CE' | 'PE' | 'FLAT';
  setup: string;
  confidence: number;
  entryHint: string;
};

type RawPivot = { index: number; price: number; kind: PivotKind; time: string };

function isPivotHigh(highs: number[], i: number, lb: number, rb: number): boolean {
  const v = highs[i];
  for (let j = i - lb; j <= i + rb; j++) {
    if (j === i) continue;
    if (j < 0 || j >= highs.length) return false;
    if (highs[j] > v) return false;
  }
  return true;
}

function isPivotLow(lows: number[], i: number, lb: number, rb: number): boolean {
  const v = lows[i];
  for (let j = i - lb; j <= i + rb; j++) {
    if (j === i) continue;
    if (j < 0 || j >= lows.length) return false;
    if (lows[j] < v) return false;
  }
  return true;
}

function collectPivots(candles: PaCandle[], lb: number, rb: number): RawPivot[] {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const out: RawPivot[] = [];
  for (let i = lb; i < candles.length - rb; i++) {
    const ph = isPivotHigh(highs, i, lb, rb);
    const pl = isPivotLow(lows, i, lb, rb);
    if (ph && !pl) out.push({ index: i, price: highs[i], kind: 1, time: candles[i].t });
    else if (pl && !ph) out.push({ index: i, price: lows[i], kind: -1, time: candles[i].t });
  }
  return out;
}

function filterZigZag(raw: RawPivot[]): RawPivot[] {
  const kept: RawPivot[] = [];
  for (const p of raw) {
    const prev = kept[kept.length - 1];
    if (!prev) {
      kept.push(p);
      continue;
    }
    if (p.kind === prev.kind) {
      if (p.kind === 1 && p.price > prev.price) kept[kept.length - 1] = p;
      if (p.kind === -1 && p.price < prev.price) kept[kept.length - 1] = p;
      continue;
    }
    if (p.kind === -1 && prev.kind === 1 && p.price > prev.price) continue;
    if (p.kind === 1 && prev.kind === -1 && p.price < prev.price) continue;
    kept.push(p);
  }
  return kept;
}

function findPrevious(points: RawPivot[], fromIdx: number): [number, number, number, number] {
  const cur = points[fromIdx];
  let ehl: PivotKind = cur.kind === 1 ? -1 : 1;
  let loc1 = NaN;
  let loc2 = NaN;
  let loc3 = NaN;
  let loc4 = NaN;
  let xx = fromIdx - 1;

  for (let x = xx; x >= 0; x--) {
    if (points[x].kind === ehl) {
      loc1 = points[x].price;
      xx = x - 1;
      break;
    }
  }
  ehl = cur.kind;
  for (let x = xx; x >= 0; x--) {
    if (points[x].kind === ehl) {
      loc2 = points[x].price;
      xx = x - 1;
      break;
    }
  }
  ehl = cur.kind === 1 ? -1 : 1;
  for (let x = xx; x >= 0; x--) {
    if (points[x].kind === ehl) {
      loc3 = points[x].price;
      xx = x - 1;
      break;
    }
  }
  ehl = cur.kind;
  for (let x = xx; x >= 0; x--) {
    if (points[x].kind === ehl) {
      loc4 = points[x].price;
      break;
    }
  }
  return [loc1, loc2, loc3, loc4];
}

function classifyLabel(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
): StructureLabel | null {
  if ([a, b, c, d].some((x) => Number.isNaN(x))) return null;

  if (a > b && a > c && c > b && c > d) return 'HH';
  if (a < b && a < c && c < b && c < d) return 'LL';

  const hlFull =
    !Number.isNaN(e) && a >= c && b > c && b > d && d > c && d > e;
  const hlSimple = a < b && a > c && b < d;
  if (hlFull || hlSimple) return 'HL';

  const lhFull =
    !Number.isNaN(e) && a <= c && b < c && b < d && d < c && d > e;
  const lhSimple = a > b && a < c && b > d;
  if (lhFull || lhSimple) return 'LH';

  return null;
}

export function runPriceAction(
  candles: PaCandle[],
  opts?: { leftBars?: number; rightBars?: number }
): PriceActionResult {
  const lb = opts?.leftBars ?? 5;
  const rb = opts?.rightBars ?? 5;
  const empty: PriceActionResult = {
    leftBars: lb,
    rightBars: rb,
    points: [],
    labels: [],
    support: null,
    resistance: null,
    trend: 0,
    lastLabel: null,
    structureText: 'Not enough bars for pivots (need clear swings).',
    bias: 'FLAT',
    setup: 'WAIT',
    confidence: 20,
    entryHint: 'Need more Nifty candles for HH/HL structure.',
  };

  if (candles.length < lb + rb + 10) return empty;

  const zig = filterZigZag(collectPivots(candles, lb, rb));
  const points: StructurePoint[] = [];
  const labels: PriceActionResult['labels'] = [];

  for (let i = 0; i < zig.length; i++) {
    const [b, c, d, e] = findPrevious(zig, i);
    const a = zig[i].price;
    const label = classifyLabel(a, b, c, d, e);
    points.push({
      index: zig[i].index,
      price: a,
      kind: zig[i].kind,
      label,
      time: zig[i].time,
    });
    if (label) {
      labels.push({
        index: zig[i].index,
        label,
        price: a,
        time: zig[i].time,
      });
    }
  }

  let support: number | null = null;
  let resistance: number | null = null;
  let trend: 1 | -1 | 0 = 0;
  const labelByIndex = new Map(labels.map((l) => [l.index, l]));

  for (let i = 0; i < candles.length; i++) {
    const lab = labelByIndex.get(i);
    if (lab) {
      if (lab.label === 'LH') resistance = lab.price;
      if (lab.label === 'HL') support = lab.price;
      if (trend === 1 && lab.label === 'HH') resistance = lab.price;
      if (trend === -1 && lab.label === 'LH') resistance = lab.price;
      if (trend === 1 && lab.label === 'HL') support = lab.price;
      if (trend === -1 && lab.label === 'LL') support = lab.price;
    }
    const close = candles[i].close;
    if (resistance != null && close > resistance) trend = 1;
    else if (support != null && close < support) trend = -1;
  }

  const lastLabel = labels.length ? labels[labels.length - 1].label : null;
  const lastFew = labels.slice(-4).map((l) => l.label);
  const structureText =
    lastFew.length > 0
      ? `Structure: ${lastFew.join(' → ')} · Trend ${
          trend === 1 ? 'BULLISH' : trend === -1 ? 'BEARISH' : 'NEUTRAL'
        } · Sup ${support?.toFixed(0) ?? '—'} / Res ${resistance?.toFixed(0) ?? '—'}`
      : 'No HH/HL/LH/LL labels yet — waiting for confirmed pivots (lb=5, rb=5).';

  let bias: 'CE' | 'PE' | 'FLAT' = 'FLAT';
  let setup = 'WAIT';
  let confidence = 35;
  let entryHint = 'No clear price-action entry. Stay flat.';

  const close = candles[candles.length - 1]?.close ?? 0;

  // Your PA playbook → Nifty options
  if (trend === 1 && lastLabel === 'HL') {
    bias = 'CE';
    setup = 'HL_IN_UPTREND';
    confidence = 84;
    entryHint = `Bullish PA: Higher Low @ ${support?.toFixed(0)}. BUY CE. Invalid if close breaks that HL/support.`;
  } else if (trend === 1 && lastLabel === 'HH' && support != null && close > support) {
    bias = 'CE';
    setup = 'HH_CONTINUATION';
    confidence = 70;
    entryHint = `Bullish PA: Higher High. Prefer CE on pullback to HL/support ${support.toFixed(0)} — do not chase.`;
  } else if (trend === -1 && lastLabel === 'LH') {
    bias = 'PE';
    setup = 'LH_IN_DOWNTREND';
    confidence = 84;
    entryHint = `Bearish PA: Lower High @ ${resistance?.toFixed(0)}. BUY PE. Invalid if close breaks that LH/resistance.`;
  } else if (trend === -1 && lastLabel === 'LL' && resistance != null && close < resistance) {
    bias = 'PE';
    setup = 'LL_CONTINUATION';
    confidence = 70;
    entryHint = `Bearish PA: Lower Low. Prefer PE on bounce to LH/resistance ${resistance.toFixed(0)} — do not chase.`;
  } else if (
    lastLabel === 'HH' &&
    labels.slice(-3).some((l) => l.label === 'HL') &&
    trend !== -1
  ) {
    bias = 'CE';
    setup = 'HH_HL_SEQUENCE';
    confidence = 76;
    entryHint = 'HH + HL = bullish market structure. CE favored on hold above last HL.';
  } else if (
    lastLabel === 'LL' &&
    labels.slice(-3).some((l) => l.label === 'LH') &&
    trend !== 1
  ) {
    bias = 'PE';
    setup = 'LL_LH_SEQUENCE';
    confidence = 76;
    entryHint = 'LL + LH = bearish market structure. PE favored on hold below last LH.';
  } else if (trend === 1 && support != null && close > support) {
    bias = 'FLAT';
    setup = 'UPTREND_WAIT_HL';
    confidence = 48;
    entryHint = `Uptrend above ${support.toFixed(0)} but wait for a fresh Higher Low before CE.`;
  } else if (trend === -1 && resistance != null && close < resistance) {
    bias = 'FLAT';
    setup = 'DOWNTREND_WAIT_LH';
    confidence = 48;
    entryHint = `Downtrend below ${resistance.toFixed(0)} but wait for a fresh Lower High before PE.`;
  }

  // Strict: only trade high-quality PA (matches “exact” preference)
  if (confidence < 70) {
    bias = 'FLAT';
    if (setup === 'WAIT' || setup.includes('WAIT')) {
      entryHint =
        entryHint +
        ' Nejoic rule: only HL→CE or LH→PE (or clear HH/HL / LL/LH sequences).';
    }
  }

  return {
    leftBars: lb,
    rightBars: rb,
    points,
    labels,
    support,
    resistance,
    trend,
    lastLabel,
    structureText,
    bias,
    setup,
    confidence: bias === 'FLAT' ? Math.min(confidence, 55) : confidence,
    entryHint,
  };
}
