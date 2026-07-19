'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Holding, HoldingInput } from '@/lib/holdings';

const KEY = 'trademindpro_holdings_v1';

function readHoldings(): Holding[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Holding[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHoldings(holdings: Holding[]) {
  localStorage.setItem(KEY, JSON.stringify(holdings));
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHoldings(readHoldings());
    setReady(true);
  }, []);

  const persist = useCallback((next: Holding[]) => {
    setHoldings(next);
    writeHoldings(next);
  }, []);

  const addHolding = useCallback(
    (input: HoldingInput) => {
      const item: Holding = {
        ...input,
        symbol: input.symbol.trim().toUpperCase(),
        name: input.name.trim() || input.symbol.trim().toUpperCase(),
        id: crypto.randomUUID(),
        addedAt: new Date().toISOString(),
      };
      persist([item, ...readHoldings()]);
      return item;
    },
    [persist]
  );

  const updateHolding = useCallback(
    (id: string, input: HoldingInput) => {
      const next = readHoldings().map((h) =>
        h.id === id
          ? {
              ...h,
              ...input,
              symbol: input.symbol.trim().toUpperCase(),
              name: input.name.trim() || input.symbol.trim().toUpperCase(),
            }
          : h
      );
      persist(next);
    },
    [persist]
  );

  const deleteHolding = useCallback(
    (id: string) => {
      persist(readHoldings().filter((h) => h.id !== id));
    },
    [persist]
  );

  const patchLtps = useCallback(
    (updates: { id: string; ltp: number }[]) => {
      if (!updates.length) return;
      const map = new Map(updates.map((u) => [u.id, u.ltp]));
      const next = readHoldings().map((h) =>
        map.has(h.id) ? { ...h, ltp: map.get(h.id)! } : h
      );
      persist(next);
    },
    [persist]
  );

  return { holdings, ready, addHolding, updateHolding, deleteHolding, patchLtps };
}
