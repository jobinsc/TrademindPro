'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Strategy, StrategyInput } from '@/lib/strategies';

const KEY = 'trademindpro_strategies_v1';

function read(): Strategy[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Strategy[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: Strategy[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function useStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStrategies(read());
    setReady(true);
  }, []);

  const persist = useCallback((next: Strategy[]) => {
    setStrategies(next);
    write(next);
  }, []);

  const add = useCallback(
    (input: StrategyInput) => {
      const now = new Date().toISOString();
      const item: Strategy = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      persist([item, ...read()]);
      return item;
    },
    [persist]
  );

  const update = useCallback(
    (id: string, input: StrategyInput) => {
      const next = read().map((s) =>
        s.id === id ? { ...s, ...input, updatedAt: new Date().toISOString() } : s
      );
      persist(next);
    },
    [persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(read().filter((s) => s.id !== id));
    },
    [persist]
  );

  return { strategies, ready, add, update, remove };
}
