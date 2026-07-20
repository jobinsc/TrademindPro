'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultOptionsScannerSettings,
  readOptionsScannerSettings,
  writeOptionsScannerSettings,
  OPTIONS_SCANNER_SYNC,
  type OptionsScannerSettings,
} from '@/lib/options-scanner-settings';

export function useOptionsScannerSettings() {
  const [settings, setSettings] = useState<OptionsScannerSettings>(
    defaultOptionsScannerSettings()
  );
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => setSettings(readOptionsScannerSettings()), []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(OPTIONS_SCANNER_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(OPTIONS_SCANNER_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<OptionsScannerSettings>) => {
    const next = writeOptionsScannerSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { ready, settings, update };
}
