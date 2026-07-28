/**
 * GoldPulse paper strategies — v12 Max vs sweep peak (GoldPulse only).
 */

import type { GoldBacktestParams } from '@/lib/gold-pulse/backtest-params';
import {
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_SYMBOL,
} from '@/lib/gold-pulse/rules';

export type GoldStrategyId = 'v12_max' | 'sweep_peak';

const SHARED: Pick<
  GoldBacktestParams,
  | 'useTrail'
  | 'trailMfeTrigger'
  | 'trailKeepFrac'
  | 'useStopLoss'
  | 'defaultSlPct'
  | 'minSlUsd'
  | 'entryFlipNeedsHtfAgainst'
  | 'disableEntryFlipExit'
  | 'requireHtfStable'
  | 'entryRangeLookback'
  | 'sideMode'
  | 'roundTripCostUsd'
> = {
  useTrail: false,
  trailMfeTrigger: 12,
  trailKeepFrac: 0.5,
  useStopLoss: false,
  defaultSlPct: 0.006,
  minSlUsd: 8,
  entryFlipNeedsHtfAgainst: true,
  disableEntryFlipExit: true,
  requireHtfStable: false,
  entryRangeLookback: 3,
  sideMode: 'BOTH',
  roundTripCostUsd: 5,
};

export type GoldStrategyDefinition = {
  id: GoldStrategyId;
  title: string;
  badge: string;
  description: string;
  /** Paper + study backtest params */
  params: GoldBacktestParams;
};

export const GOLD_STRATEGIES: Record<GoldStrategyId, GoldStrategyDefinition> = {
  v12_max: {
    id: 'v12_max',
    title: 'Gold Sector 7 Max (v12)',
    badge: 'v12 Max',
    description:
      'UTC 7–21 entries · max 5/day · min $10 on last 3×15m bars · exit 30m only.',
    params: {
      ...SHARED,
      maxTradesPerDay: 5,
      reentryCooldownMs: 0,
      minEntryRangeUsd: 10,
      entryUtcHourMin: 7,
      entryUtcHourMax: 21,
    },
  },
  sweep_peak: {
    id: 'sweep_peak',
    title: 'Sweep peak (24h)',
    badge: 'Sweep peak',
    description:
      '24h entries · max 5/day · min $10 range · no cooldown · exit 30m only.',
    params: {
      ...SHARED,
      maxTradesPerDay: 5,
      reentryCooldownMs: 0,
      minEntryRangeUsd: 10,
      entryUtcHourMin: null,
      entryUtcHourMax: null,
    },
  },
};

export function getGoldStrategy(id: GoldStrategyId): GoldStrategyDefinition {
  return GOLD_STRATEGIES[id];
}

export function isGoldStrategyId(v: string): v is GoldStrategyId {
  return v === 'v12_max' || v === 'sweep_peak';
}

export function goldStrategyParams(id: GoldStrategyId): GoldBacktestParams {
  return { ...GOLD_STRATEGIES[id].params };
}

export function goldStrategySummaryLines(id: GoldStrategyId): string[] {
  const s = GOLD_STRATEGIES[id];
  const p = s.params;
  const hours =
    p.entryUtcHourMin != null && p.entryUtcHourMax != null
      ? `UTC ${p.entryUtcHourMin}:00–${p.entryUtcHourMax}:59`
      : '24h UTC';
  return [
    s.title,
    s.description,
    `Signal: ${GOLD_UT_ENTRY.tf} + ${GOLD_UT_HTF.tf} UT agree · ${hours}.`,
    `Max ${p.maxTradesPerDay}/day · cooldown ${p.reentryCooldownMs / 60000}m · cost $${p.roundTripCostUsd}/trade.`,
    `Exit: ${GOLD_UT_HTF.tf} against only (no ${GOLD_UT_ENTRY.tf} flip).`,
    `Symbol: ${GOLD_YAHOO_SYMBOL} · paper only.`,
  ];
}

export function goldStrategyReportKey(id: GoldStrategyId, fromDate: string, toDate: string): string {
  return `${id}_${fromDate}_to_${toDate}`;
}
