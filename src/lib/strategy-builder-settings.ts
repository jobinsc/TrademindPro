/** Strategy Builder tab — module prefs only (strategies themselves stay in strategies_v1). */

export type StrategyBuilderSettings = {
  defaultTimeframe: string;
  defaultMarket: 'NSE' | 'BSE' | 'NIFTY' | 'BANKNIFTY';
  /** Default stock/index when creating a strategy */
  defaultSymbol: string;
  settingsOpen: boolean;
};

export const STRATEGY_BUILDER_SETTINGS_KEY = 'trademindpro_strategy_builder_v1';
export const STRATEGY_BUILDER_SYNC = 'trademindpro-strategy-builder-sync';

export function defaultStrategyBuilderSettings(): StrategyBuilderSettings {
  return {
    defaultTimeframe: '15m',
    defaultMarket: 'NSE',
    defaultSymbol: '',
    settingsOpen: false,
  };
}

export function readStrategyBuilderSettings(): StrategyBuilderSettings {
  if (typeof window === 'undefined') return defaultStrategyBuilderSettings();
  try {
    const raw = localStorage.getItem(STRATEGY_BUILDER_SETTINGS_KEY);
    if (!raw) return defaultStrategyBuilderSettings();
    const parsed = JSON.parse(raw) as Partial<StrategyBuilderSettings>;
    return {
      ...defaultStrategyBuilderSettings(),
      ...parsed,
      defaultSymbol: parsed.defaultSymbol ?? '',
    };
  } catch {
    return defaultStrategyBuilderSettings();
  }
}

export function writeStrategyBuilderSettings(
  patch: Partial<StrategyBuilderSettings>
): StrategyBuilderSettings {
  const next = { ...readStrategyBuilderSettings(), ...patch };
  localStorage.setItem(STRATEGY_BUILDER_SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STRATEGY_BUILDER_SYNC));
  return next;
}
