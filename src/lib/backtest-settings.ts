/** Backtesting tab — persisted run setup (isolated from other modules). */

export type BacktestSettings = {
  pickMode: 'single' | 'multi';
  strategyId: string;
  strategyIds: string[];
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  capital: number;
  stopLossPoints: number;
  targetPoints: number;
  settingsOpen: boolean;
};

export const BACKTEST_SETTINGS_KEY = 'trademindpro_backtest_settings_v1';
export const BACKTEST_SETTINGS_SYNC = 'trademindpro-backtest-settings-sync';

export function defaultBacktestSettings(): BacktestSettings {
  return {
    pickMode: 'single',
    strategyId: 'ema_cross',
    strategyIds: ['ema_cross'],
    symbol: 'NIFTY',
    timeframe: '15m',
    fromDate: '2024-01-01',
    toDate: new Date().toISOString().slice(0, 10),
    capital: 100000,
    stopLossPoints: 50,
    targetPoints: 75,
    settingsOpen: true,
  };
}

export function readBacktestSettings(): BacktestSettings {
  if (typeof window === 'undefined') return defaultBacktestSettings();
  try {
    const raw = localStorage.getItem(BACKTEST_SETTINGS_KEY);
    if (!raw) return defaultBacktestSettings();
    return { ...defaultBacktestSettings(), ...(JSON.parse(raw) as Partial<BacktestSettings>) };
  } catch {
    return defaultBacktestSettings();
  }
}

export function writeBacktestSettings(patch: Partial<BacktestSettings>): BacktestSettings {
  const next = { ...readBacktestSettings(), ...patch };
  localStorage.setItem(BACKTEST_SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(BACKTEST_SETTINGS_SYNC));
  return next;
}
