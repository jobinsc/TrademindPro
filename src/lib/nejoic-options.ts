/** Nejoic brain options — strategies, timeframes, analysis styles (from shared catalog) */

import {
  ALL_TIMEFRAMES,
  STRATEGY_GROUPS,
  nejoicCatalogStrategies,
  type CatalogStrategyId,
  type StrategyGroupId,
} from '@/lib/strategy-catalog';

export const NEJOIC_TIMEFRAMES = ALL_TIMEFRAMES.map((t) => ({
  id: t.id,
  label: t.label,
  yahoo: t.yahoo,
}));

export type NejoicTimeframeId = string;

export type NejoicStrategyId = CatalogStrategyId;

export type NejoicStrategyMeta = {
  id: NejoicStrategyId;
  name: string;
  short: string;
  whatYouFix: string;
  group: StrategyGroupId;
  side?: 'long' | 'short';
};

export const NEJOIC_STRATEGIES: NejoicStrategyMeta[] = nejoicCatalogStrategies().map((s) => ({
  id: s.id,
  name: s.name,
  short: s.short,
  whatYouFix: s.entryRule,
  group: s.group,
  side:
    s.id === 'price_action_hhll' ? 'long' : s.id === 'swing_hl' ? 'short' : undefined,
}));

export const NEJOIC_STRATEGY_GROUPS: {
  id: StrategyGroupId;
  title: string;
  hint: string;
}[] = STRATEGY_GROUPS;

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
  if (lower.includes('month') || lower === '1mo') return '1M';
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

const STRATEGY_SET = new Set(NEJOIC_STRATEGIES.map((s) => s.id));

/** Resolve multi-select list; migrates legacy single strategyId. */
export function normalizeStrategyIds(
  strategyIds?: NejoicStrategyId[] | null,
  strategyId?: NejoicStrategyId | string | null
): NejoicStrategyId[] {
  const fromList = (strategyIds || []).filter((id): id is NejoicStrategyId =>
    STRATEGY_SET.has(id as NejoicStrategyId)
  );
  if (fromList.length) return [...new Set(fromList)];
  const single = (strategyId || 'price_action_hhll') as NejoicStrategyId;
  return STRATEGY_SET.has(single) ? [single] : ['price_action_hhll'];
}

export function strategyLabel(id: NejoicStrategyId | string): string {
  return NEJOIC_STRATEGIES.find((s) => s.id === id)?.name ?? id;
}

/** True if user only typed a timeframe / pulse request */
export function looksLikePulseAsk(prompt: string): boolean {
  const q = prompt.trim().toLowerCase();
  if (!q) return false;
  if (q === 'pulse' || q.startsWith('/pulse') || q.startsWith('/nifty')) return true;
  if (/\b(pulse|nifty|analyse|analyze|chart|structure|levels|decision)\b/.test(q)) return true;
  if (/^(?:pulse\s+)?(?:\d+\s*m?|1h|4h|1d|1w|1wk|daily|weekly|monthly)$/i.test(q)) return true;
  if (/^(?:ce|pe|wait)$/i.test(q)) return true;
  return false;
}
