'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CHART_PEEK_KEY,
  readChartPeekEnabled,
  writeChartPeekEnabled,
} from '@/lib/chart';

const EVENT = 'trademindpro-chart-peek';

export function useChartPeekEnabled() {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabled(readChartPeekEnabled());
    setReady(true);
    function onStorage(e: StorageEvent) {
      if (e.key === CHART_PEEK_KEY) setEnabled(readChartPeekEnabled());
    }
    function onCustom() {
      setEnabled(readChartPeekEnabled());
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVENT, onCustom);
    };
  }, []);

  const setPeekEnabled = useCallback((on: boolean) => {
    writeChartPeekEnabled(on);
    setEnabled(on);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const toggle = useCallback(() => {
    setPeekEnabled(!readChartPeekEnabled());
  }, [setPeekEnabled]);

  return { ready, enabled, setPeekEnabled, toggle };
}
