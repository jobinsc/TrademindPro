'use client';

import { useCallback, useEffect, useState } from 'react';
import { normalizeTrade, type Trade, type TradeInput } from '@/lib/trades';

const STORAGE_KEY = 'trademindpro_trades_v1';

function readTrades(): Trade[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Trade>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is Partial<Trade> & { id: string } => Boolean(t && t.id))
      .map(normalizeTrade);
  } catch {
    return [];
  }
}

function writeTrades(trades: Trade[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = readTrades();
    setTrades(loaded);
    writeTrades(loaded);
    setReady(true);
  }, []);

  const persist = useCallback((next: Trade[]) => {
    setTrades(next);
    writeTrades(next);
  }, []);

  const addTrade = useCallback(
    (input: TradeInput) => {
      const trade: Trade = {
        ...input,
        symbol: input.symbol.trim().toUpperCase(),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      persist([trade, ...readTrades()]);
      return trade;
    },
    [persist]
  );

  const updateTrade = useCallback(
    (id: string, input: TradeInput) => {
      const next = readTrades().map((t) =>
        t.id === id
          ? {
              ...t,
              ...input,
              symbol: input.symbol.trim().toUpperCase(),
            }
          : t
      );
      persist(next);
    },
    [persist]
  );

  const deleteTrade = useCallback(
    (id: string) => {
      persist(readTrades().filter((t) => t.id !== id));
    },
    [persist]
  );

  return { trades, ready, addTrade, updateTrade, deleteTrade };
}
