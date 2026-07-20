'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultScannerModuleSettings,
  readScannerModuleSettings,
  writeScannerModuleSettings,
  SCANNER_MODULE_SYNC,
  type ScannerModuleSettings,
} from '@/lib/scanner-module-settings';

export function useScannerModuleSettings() {
  const [settings, setSettings] = useState<ScannerModuleSettings>(defaultScannerModuleSettings());
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => setSettings(readScannerModuleSettings()), []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(SCANNER_MODULE_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(SCANNER_MODULE_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<ScannerModuleSettings>) => {
    const next = writeScannerModuleSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { ready, settings, update };
}
