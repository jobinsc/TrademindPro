'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultStrategyBuilderSettings,
  readStrategyBuilderSettings,
  writeStrategyBuilderSettings,
  STRATEGY_BUILDER_SYNC,
  type StrategyBuilderSettings,
} from '@/lib/strategy-builder-settings';

export function useStrategyBuilderSettings() {
  const [settings, setSettings] = useState<StrategyBuilderSettings>(
    defaultStrategyBuilderSettings()
  );
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => setSettings(readStrategyBuilderSettings()), []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(STRATEGY_BUILDER_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(STRATEGY_BUILDER_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<StrategyBuilderSettings>) => {
    const next = writeStrategyBuilderSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { ready, settings, update };
}
