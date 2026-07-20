import {
  ALL_TIMEFRAMES,
  strategyTemplatesFromCatalog,
  type CatalogStrategyId,
} from '@/lib/strategy-catalog';

export type StrategyStatus = 'draft' | 'ready' | 'paused' | 'live';

export type Strategy = {
  id: string;
  name: string;
  market: 'NSE' | 'BSE' | 'NIFTY' | 'BANKNIFTY';
  /** Stock or index symbol — full NSE/BSE list via search */
  symbol: string;
  stockName?: string;
  timeframe: string;
  entryRule: string;
  exitRule: string;
  /** Free-text note (optional) */
  stopLoss: string;
  /** Free-text note (optional) */
  target: string;
  /** Numeric stop distance in points (index / price points) */
  stopLossPoints: number | null;
  /** Numeric target distance in points */
  targetPoints: number | null;
  status: StrategyStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Links to popular catalog when created from template */
  catalogId?: CatalogStrategyId | string;
};

export type StrategyInput = Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>;

export const TIMEFRAMES = ALL_TIMEFRAMES.map((t) => t.id);

/** What the status filter chips mean (kept for UI copy) */
export const STRATEGY_STATUS_HELP: {
  id: 'ALL' | StrategyStatus;
  label: string;
  meaning: string;
}[] = [
  {
    id: 'ALL',
    label: 'All',
    meaning: 'Shows every strategy you saved — any status.',
  },
  {
    id: 'draft',
    label: 'Draft',
    meaning: 'Still editing / not ready. Not used for auto or live yet.',
  },
  {
    id: 'ready',
    label: 'On',
    meaning: 'Ready to use — can be picked for backtest / paper / Nejoic.',
  },
  {
    id: 'paused',
    label: 'Stopped',
    meaning: 'Temporarily off. Kept in the list but should not fire trades.',
  },
  {
    id: 'live',
    label: 'Live',
    meaning: 'Marked as active for live / auto use (when live orders are enabled).',
  },
];

export const STRATEGY_TEMPLATES: (Omit<StrategyInput, 'status' | 'notes'> & {
  catalogId?: string;
})[] = strategyTemplatesFromCatalog().map((t) => ({
  name: t.name,
  market: t.market,
  symbol: defaultSymbolForMarket(t.market),
  stockName: '',
  timeframe: t.timeframe,
  entryRule: t.entryRule,
  exitRule: t.exitRule,
  stopLoss: t.stopLoss,
  target: t.target,
  stopLossPoints: t.stopLossPoints ?? 50,
  targetPoints: t.targetPoints ?? 75,
  catalogId: t.catalogId,
}));

export function defaultSymbolForMarket(
  market: StrategyInput['market']
): string {
  if (market === 'NIFTY') return 'NIFTY';
  if (market === 'BANKNIFTY') return 'BANKNIFTY';
  return '';
}

export function emptyStrategyInput(): StrategyInput {
  return {
    name: '',
    market: 'NSE',
    symbol: '',
    stockName: '',
    timeframe: '15m',
    entryRule: '',
    exitRule: '',
    stopLoss: '',
    target: '',
    stopLossPoints: 50,
    targetPoints: 75,
    status: 'draft',
    notes: '',
  };
}

export function normalizeStrategyPoints(
  raw: Partial<Strategy> | StrategyInput | null | undefined
): Pick<Strategy, 'stopLossPoints' | 'targetPoints'> {
  const sl = Number(raw?.stopLossPoints);
  const tg = Number(raw?.targetPoints);
  return {
    stopLossPoints: Number.isFinite(sl) && sl > 0 ? sl : null,
    targetPoints: Number.isFinite(tg) && tg > 0 ? tg : null,
  };
}

export function summarizeStrategies(strategies: Strategy[]) {
  return {
    total: strategies.length,
    draft: strategies.filter((s) => s.status === 'draft').length,
    ready: strategies.filter((s) => s.status === 'ready').length,
    paused: strategies.filter((s) => s.status === 'paused').length,
    live: strategies.filter((s) => s.status === 'live').length,
  };
}
