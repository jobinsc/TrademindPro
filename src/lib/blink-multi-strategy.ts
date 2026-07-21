import type { Candle, OptionBias } from '@/lib/nejoic';
import type { BlinkSettings, BlinkSignal } from '@/lib/blink';
import {
  blinkStrategyDisplayName,
  isBlinkStrategyMode,
  type BlinkStrategyMode,
} from '@/lib/blink-strategies';

export type BlinkStrategyCombine = 'any' | 'all';

export function activeBlinkStrategies(
  settings: Pick<BlinkSettings, 'strategyMode' | 'strategyMode2'>
): BlinkStrategyMode[] {
  const primary = settings.strategyMode;
  const modes: BlinkStrategyMode[] = [primary];
  const second = settings.strategyMode2?.trim();
  if (second && second !== 'none' && isBlinkStrategyMode(second) && second !== primary) {
    modes.push(second);
  }
  return modes;
}

export function blinkStrategyComboLabel(
  settings: Pick<BlinkSettings, 'strategyMode' | 'strategyMode2' | 'strategyCombine'>
): string {
  const modes = activeBlinkStrategies(settings);
  if (modes.length === 1) return blinkStrategyDisplayName(modes[0]);
  const names = modes.map(blinkStrategyDisplayName).join(' + ');
  return settings.strategyCombine === 'all' ? `${names} (both must agree)` : `${names} (either can fire)`;
}

type ScalpInput = Parameters<typeof import('@/lib/blink').analyzeBlinkScalp>[1];

/** Merge 2+ strategy signals into one Blink signal */
export function mergeBlinkStrategySignals(
  signals: BlinkSignal[],
  combine: BlinkStrategyCombine,
  minConfidence: number,
  spot: number,
  strike: number,
  premium: number
): BlinkSignal {
  const flat = (reason: string, setup = 'MULTI_WAIT'): BlinkSignal => ({
    bias: 'FLAT',
    niftySpot: spot,
    strike,
    premium,
    confidence: 0,
    setup,
    reason,
    emaFast: 0,
    emaSlow: 0,
    rsi: 50,
  });

  if (!signals.length) {
    return flat('No strategy signals.');
  }

  const actionable = signals.filter(
    (s) => (s.bias === 'CE' || s.bias === 'PE') && s.confidence >= minConfidence
  );

  if (combine === 'all') {
    if (actionable.length < signals.length) {
      const waiting = signals.find((s) => s.bias === 'FLAT' || s.confidence < minConfidence);
      return flat(
        waiting?.reason || 'Not all strategies agree yet.',
        waiting?.setup || 'MULTI_WAIT'
      );
    }
    const bias = actionable[0].bias;
    if (!actionable.every((s) => s.bias === bias)) {
      return flat(
        'Strategies disagree — one says CE, one says PE. No trade.',
        'MULTI_CONFLICT'
      );
    }
    const best = actionable.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return {
      ...best,
      setup: `MULTI_ALL_${best.setup}`,
      reason: `Both strategies agree ${bias}: ${best.reason}`,
    };
  }

  // any — pick strongest CE or PE
  if (!actionable.length) {
    const bestFlat = signals.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return flat(
      bestFlat.reason || 'No strategy passed min confidence.',
      bestFlat.setup || 'MULTI_WAIT'
    );
  }

  const ce = actionable.filter((s) => s.bias === 'CE');
  const pe = actionable.filter((s) => s.bias === 'PE');
  const pool = ce.length && pe.length
    ? (ce[0].confidence >= pe[0].confidence ? ce : pe)
    : ce.length
      ? ce
      : pe;
  const pick = pool.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return {
    ...pick,
    setup: `MULTI_ANY_${pick.setup}`,
    reason: `Strategy fired (${pick.bias}): ${pick.reason}`,
  };
}

export type BlinkBarSignal = {
  bias: OptionBias;
  confidence: number;
  setup: string;
};

/** Lightweight export for backtest loops */
export function blinkBarSignalFromScalp(sig: BlinkSignal): BlinkBarSignal | null {
  if (sig.bias !== 'CE' && sig.bias !== 'PE') return null;
  return {
    bias: sig.bias,
    confidence: sig.confidence,
    setup: sig.setup,
  };
}
