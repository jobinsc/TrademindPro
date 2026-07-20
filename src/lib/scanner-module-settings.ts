/** Stock Scanner tab — module-level prefs (separate from per-template scan-settings). */

export type ScannerModuleSettings = {
  exchange: 'NSE' | 'BSE';
  category: string;
  settingsOpen: boolean;
};

export const SCANNER_MODULE_SETTINGS_KEY = 'trademindpro_scanner_module_v1';
export const SCANNER_MODULE_SYNC = 'trademindpro-scanner-module-sync';

export function defaultScannerModuleSettings(): ScannerModuleSettings {
  return {
    exchange: 'NSE',
    category: 'ALL',
    settingsOpen: false,
  };
}

export function readScannerModuleSettings(): ScannerModuleSettings {
  if (typeof window === 'undefined') return defaultScannerModuleSettings();
  try {
    const raw = localStorage.getItem(SCANNER_MODULE_SETTINGS_KEY);
    if (!raw) return defaultScannerModuleSettings();
    return {
      ...defaultScannerModuleSettings(),
      ...(JSON.parse(raw) as Partial<ScannerModuleSettings>),
    };
  } catch {
    return defaultScannerModuleSettings();
  }
}

export function writeScannerModuleSettings(
  patch: Partial<ScannerModuleSettings>
): ScannerModuleSettings {
  const next = { ...readScannerModuleSettings(), ...patch };
  localStorage.setItem(SCANNER_MODULE_SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SCANNER_MODULE_SYNC));
  return next;
}
