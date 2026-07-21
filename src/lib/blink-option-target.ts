/**
 * Translate an ATM option scalp objective into the Nifty move required.
 *
 * This is a delta proxy, not an options-chain backtest. Live execution must
 * use the actual option LTP/spread because IV, gamma and theta also move price.
 */

import { estimateOptionDelta, pickOptionStrike } from '@/lib/option-sim';

export const OPTION_NET_TARGET_MIN = 10;
export const OPTION_NET_TARGET_MAX = 13;
export const OPTION_COST_BUFFER_PTS = 2;
export const OPTION_GROSS_STOP_PTS = 8;

export type AtmOptionMovePlan = {
  strike: number;
  absDelta: number;
  netOptionTarget: { min: number; max: number };
  grossOptionTarget: { min: number; max: number };
  requiredNiftyMove: { min: number; max: number };
  requiredNiftyStop: number;
  direction: 'UP' | 'DOWN';
  summary: string;
};

export function buildAtmOptionMovePlan(
  spot: number,
  bias: 'CE' | 'PE',
  strike = pickOptionStrike(spot, bias, 'atm', 50)
): AtmOptionMovePlan {
  const rawDelta = Math.abs(estimateOptionDelta(spot, strike, bias));
  // Keep the proxy realistic around ATM and avoid unstable extremes.
  const absDelta = Math.min(0.6, Math.max(0.4, rawDelta || 0.5));
  const grossMin = OPTION_NET_TARGET_MIN + OPTION_COST_BUFFER_PTS;
  const grossMax = OPTION_NET_TARGET_MAX + OPTION_COST_BUFFER_PTS;
  const niftyMin = Math.ceil(grossMin / absDelta);
  const niftyMax = Math.ceil(grossMax / absDelta);
  const niftyStop = Math.ceil(OPTION_GROSS_STOP_PTS / absDelta);
  const direction = bias === 'CE' ? 'UP' : 'DOWN';

  return {
    strike,
    absDelta: Math.round(absDelta * 100) / 100,
    netOptionTarget: {
      min: OPTION_NET_TARGET_MIN,
      max: OPTION_NET_TARGET_MAX,
    },
    grossOptionTarget: { min: grossMin, max: grossMax },
    requiredNiftyMove: { min: niftyMin, max: niftyMax },
    requiredNiftyStop: niftyStop,
    direction,
    summary:
      `${bias} ${strike}: target +${OPTION_NET_TARGET_MIN}–${OPTION_NET_TARGET_MAX} option pts net ` +
      `(seek +${grossMin}–${grossMax} gross). At Δ≈${absDelta.toFixed(2)}, ` +
      `Nifty needs ~${niftyMin}–${niftyMax} pts ${direction}; model stop ~${niftyStop} Nifty pts.`,
  };
}

export function optionTargetHint(
  spot: number,
  bias: 'CE' | 'PE',
  strike?: number | null
): string {
  return buildAtmOptionMovePlan(
    spot,
    bias,
    strike ?? pickOptionStrike(spot, bias, 'atm', 50)
  ).summary;
}
