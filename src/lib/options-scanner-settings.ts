/** Options Scanner tab — isolated settings (not shared with stock scanner). */

export type OptionsScannerSettings = {
  underlyingId: string;
  minOi: number;
  minIv: number;
  strikeRange: number;
  autoRefreshSec: number;
  settingsOpen: boolean;
};

export const OPTIONS_SCANNER_SETTINGS_KEY = 'trademindpro_options_scanner_settings_v1';
export const OPTIONS_SCANNER_SYNC = 'trademindpro-options-scanner-sync';

export function defaultOptionsScannerSettings(): OptionsScannerSettings {
  return {
    underlyingId: 'nifty',
    minOi: 0,
    minIv: 0,
    strikeRange: 10,
    autoRefreshSec: 0,
    settingsOpen: false,
  };
}

export function readOptionsScannerSettings(): OptionsScannerSettings {
  if (typeof window === 'undefined') return defaultOptionsScannerSettings();
  try {
    const raw = localStorage.getItem(OPTIONS_SCANNER_SETTINGS_KEY);
    if (!raw) return defaultOptionsScannerSettings();
    return {
      ...defaultOptionsScannerSettings(),
      ...(JSON.parse(raw) as Partial<OptionsScannerSettings>),
    };
  } catch {
    return defaultOptionsScannerSettings();
  }
}

export function writeOptionsScannerSettings(
  patch: Partial<OptionsScannerSettings>
): OptionsScannerSettings {
  const next = { ...readOptionsScannerSettings(), ...patch };
  localStorage.setItem(OPTIONS_SCANNER_SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(OPTIONS_SCANNER_SYNC));
  return next;
}
