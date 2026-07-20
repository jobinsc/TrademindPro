'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultBacktestSettings,
  readBacktestSettings,
  writeBacktestSettings,
  BACKTEST_SETTINGS_SYNC,
  type BacktestSettings,
} from '@/lib/backtest-settings';

export function useBacktestSettings() {
  const [settings, setSettings] = useState<BacktestSettings>(defaultBacktestSettings());
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => setSettings(readBacktestSettings()), []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(BACKTEST_SETTINGS_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(BACKTEST_SETTINGS_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<BacktestSettings>) => {
    const next = writeBacktestSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { ready, settings, update };
}
