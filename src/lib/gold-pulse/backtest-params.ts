/** Shared backtest / paper strategy parameters (GoldPulse only). */

export type GoldBacktestParams = {
  trailMfeTrigger: number;
  trailKeepFrac: number;
  reentryCooldownMs: number;
  entryFlipNeedsHtfAgainst: boolean;
  disableEntryFlipExit: boolean;
  defaultSlPct: number;
  minSlUsd: number;
  useStopLoss: boolean;
  roundTripCostUsd: number;
  requireHtfStable: boolean;
  minEntryRangeUsd: number;
  entryRangeLookback: number;
  sideMode: 'BOTH' | 'LONG' | 'SHORT';
  useTrail: boolean;
  maxTradesPerDay: number;
  entryUtcHourMin: number | null;
  entryUtcHourMax: number | null;
};

export const GOLD_PAPER_QTY = 1;
export const GOLD_PAPER_POINT_VALUE = 1;
