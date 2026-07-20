'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BacktestRun } from '@/lib/backtest';

const KEY = 'trademindpro_backtests_v1';

function read(): BacktestRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BacktestRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: BacktestRun[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function useBacktests() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRuns(read());
    setReady(true);
  }, []);

  const persist = useCallback((next: BacktestRun[]) => {
    setRuns(next);
    write(next);
  }, []);

  const saveRun = useCallback(
    (item: BacktestRun) => {
      persist([item, ...read()].slice(0, 30));
      return item;
    },
    [persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(read().filter((r) => r.id !== id));
    },
    [persist]
  );

  return { runs, ready, saveRun, remove };
}
