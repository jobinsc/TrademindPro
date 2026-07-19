/** Nejoic brain options — strategies, timeframes, analysis styles */

export const NEJOIC_TIMEFRAMES = [
  { id: '1m', label: '1 min', yahoo: '1m' as const },
  { id: '3m', label: '3 min', yahoo: '2m' as const }, // Yahoo has 2m; closest
  { id: '5m', label: '5 min', yahoo: '5m' as const },
  { id: '15m', label: '15 min', yahoo: '15m' as const },
  { id: '30m', label: '30 min', yahoo: '30m' as const },
  { id: '1H', label: '1 hour', yahoo: '60m' as const },
  { id: '4H', label: '4 hour', yahoo: '60m' as const }, // Yahoo: use 60m series
  { id: '1D', label: 'Daily', yahoo: '1d' as const },
  { id: '1W', label: 'Weekly', yahoo: '1wk' as const },
  { id: '1M', label: 'Monthly', yahoo: '1mo' as const },
] as const;

export type NejoicTimeframeId = (typeof NEJOIC_TIMEFRAMES)[number]['id'];

export type NejoicStrategyId =
  | 'price_action_hhll'
  | 'ema_cross'
  | 'rsi_bounce'
  | 'breakout'
  | 'swing_hl';

export const NEJOIC_STRATEGIES: {
  id: NejoicStrategyId;
  name: string;
  short: string;
  whatYouFix: string;
}[] = [
  {
    id: 'price_action_hhll',
    name: 'Price Action (HH / HL)',
    short: 'Your Pine style — Higher High / Higher Low only. No RSI/EMA.',
    whatYouFix: 'Left/Right bars + strict or balanced style',
  },
  {
    id: 'ema_cross',
    name: 'EMA Cross',
    short: 'Fast EMA crosses Slow EMA → CE (up) or PE (down).',
    whatYouFix: 'Fast EMA & Slow EMA numbers',
  },
  {
    id: 'rsi_bounce',
    name: 'RSI Bounce',
    short: 'Buy CE when RSI rises from oversold; PE from overbought.',
    whatYouFix: 'RSI length + oversold / overbought levels',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    short: 'CE if price breaks recent high; PE if breaks recent low.',
    whatYouFix: 'Lookback bars for high/low',
  },
  {
    id: 'swing_hl',
    name: 'Swing HL / LH',
    short: 'Same HH/HL idea but looser — good for slower charts.',
    whatYouFix: 'Left/Right bars (usually higher, e.g. 8–10)',
  },
];

export type NejoicAnalysisStyle = 'strict' | 'balanced' | 'aggressive';

export const NEJOIC_ANALYSIS_STYLES: {
  id: NejoicAnalysisStyle;
  name: string;
  desc: string;
}[] = [
  {
    id: 'strict',
    name: 'Strict',
    desc: 'Fewer trades. Only clear setups. Safer for paper learning.',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    desc: 'Normal — good default for most days.',
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    desc: 'More signals, lower confidence gate. Practice only.',
  },
];

export function timeframeToYahoo(id: string): string {
  const row = NEJOIC_TIMEFRAMES.find((t) => t.id === id);
  return row?.yahoo ?? '5m';
}

export function normalizeTimeframeId(raw: string | null | undefined): NejoicTimeframeId {
  const q = (raw || '').trim();
  const hit = NEJOIC_TIMEFRAMES.find(
    (t) => t.id === q || t.id.toLowerCase() === q.toLowerCase()
  );
  if (hit) return hit.id;
  const lower = q.toLowerCase().replace(/\s+/g, '');
  // bare numbers: 5 → 5m, 15 → 15m, 1 → 1m
  if (/^\d+$/.test(lower)) {
    const n = lower;
    if (n === '1') return '1m';
    if (n === '3') return '3m';
    if (n === '5') return '5m';
    if (n === '15') return '15m';
    if (n === '30') return '30m';
    if (n === '60') return '1H';
  }
  if (lower.includes('week') || lower === '1wk' || lower === 'w') return '1W';
  if (lower.includes('month') || lower === '1mo' || lower === 'm') return '1M';
  if (lower.includes('day') || lower === '1d' || lower === 'd') return '1D';
  if (lower.includes('4h')) return '4H';
  if (lower.includes('1h') || lower.includes('60')) return '1H';
  if (lower.includes('30')) return '30m';
  if (lower.includes('15')) return '15m';
  if (lower.includes('3m') || lower === '3') return '3m';
  if (lower.includes('5m') || lower === '5') return '5m';
  if (lower.includes('1m')) return '1m';
  return '5m';
}

/** True if user only typed a timeframe / pulse request */
export function looksLikePulseAsk(prompt: string): boolean {
  const q = prompt.trim().toLowerCase();
  if (!q) return false;
  if (q === 'pulse' || q.startsWith('/pulse') || q.startsWith('/nifty')) return true;
  if (/\b(pulse|nifty|analyse|analyze|chart|structure|levels|decision)\b/.test(q)) return true;
  // "5", "5m", "15m", "1h", "pulse 5m"
  if (/^(?:pulse\s+)?(?:\d+\s*m?|1h|4h|1d|1w|1wk|daily|weekly|monthly)$/i.test(q)) return true;
  if (/^(?:ce|pe|wait)$/i.test(q)) return true;
  return false;
}
