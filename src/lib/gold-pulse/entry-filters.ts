import type { GoldBacktestParams } from '@/lib/gold-pulse/backtest-params';
import type { Candle } from '@/lib/nejoic';

export function goldEntryUtcHourAllowed(
  params: Pick<GoldBacktestParams, 'entryUtcHourMin' | 'entryUtcHourMax'>,
  at: Date = new Date()
): boolean {
  const min = params.entryUtcHourMin;
  const max = params.entryUtcHourMax;
  if (min == null || max == null) return true;
  const hour = at.getUTCHours();
  return min <= max ? hour >= min && hour <= max : hour >= min || hour <= max;
}

export function goldEntryRangeOk(
  params: Pick<GoldBacktestParams, 'minEntryRangeUsd' | 'entryRangeLookback'>,
  candlesEntry: Candle[]
): boolean {
  const min = params.minEntryRangeUsd;
  const lookback = params.entryRangeLookback;
  if (min <= 0 || !candlesEntry.length) return true;
  const from = Math.max(0, candlesEntry.length - lookback);
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j < candlesEntry.length; j++) {
    hi = Math.max(hi, candlesEntry[j].high);
    lo = Math.min(lo, candlesEntry[j].low);
  }
  return hi - lo >= min;
}

export function goldEntrySessionLabel(
  params: Pick<GoldBacktestParams, 'entryUtcHourMin' | 'entryUtcHourMax'>
): string {
  const min = params.entryUtcHourMin;
  const max = params.entryUtcHourMax;
  if (min == null || max == null) return '24h UTC entries';
  return `UTC ${min}:00–${max}:59 entries only`;
}
