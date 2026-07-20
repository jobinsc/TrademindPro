'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultPaperTradeSettings,
  migrateLegacyPaperIntoNejoic,
  readPaperTradeSettings,
  writePaperTradeSettings,
  PAPER_TRADE_SYNC,
  type PaperTradeSettings,
  type PaperResultsColumns,
} from '@/lib/paper-trade-settings';

export function usePaperTradeSettings() {
  const [settings, setSettings] = useState<PaperTradeSettings>(defaultPaperTradeSettings());
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => {
    setSettings(readPaperTradeSettings());
  }, []);

  useEffect(() => {
    migrateLegacyPaperIntoNejoic();
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(PAPER_TRADE_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(PAPER_TRADE_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<PaperTradeSettings>) => {
    const next = writePaperTradeSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const updateResultsColumns = useCallback((patch: Partial<PaperResultsColumns>) => {
    const prev = readPaperTradeSettings();
    return update({ showInResults: { ...prev.showInResults, ...patch } });
  }, [update]);

  return { ready, settings, update, updateResultsColumns };
}
