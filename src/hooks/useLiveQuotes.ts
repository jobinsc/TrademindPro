'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUpstoxAccessToken } from '@/lib/upstox-client';

export type LiveQuoteRow = {
  symbol: string;
  lastPrice: number;
  change: number | null;
  changePct: number | null;
  ok: boolean;
};

const LIVE_MS = 3000;

/**
 * Polls /api/market/live every 3s for the given symbols.
 * Prefers Upstox token from localStorage when connected.
 */
export function useLiveQuotes(
  symbols: { symbol: string; exchange?: string }[],
  opts?: { enabled?: boolean; intervalMs?: number }
) {
  const enabled = opts?.enabled !== false;
  const intervalMs = opts?.intervalMs ?? LIVE_MS;
  const [quotes, setQuotes] = useState<Record<string, LiveQuoteRow>>({});
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const key = useMemo(
    () =>
      symbols
        .map((s) => `${s.symbol.toUpperCase()}:${s.exchange || 'NSE'}`)
        .sort()
        .join('|'),
    [symbols]
  );
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const pull = useCallback(async () => {
    const list = symbolsRef.current
      .map((s) => ({
        symbol: s.symbol.trim().toUpperCase(),
        exchange: s.exchange,
      }))
      .filter((s) => s.symbol);
    if (!list.length) {
      setQuotes({});
      return;
    }

    try {
      const token = getUpstoxAccessToken();
      const res = await fetch('/api/market/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ symbols: list }),
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        fetchedAt?: string;
        quotes?: LiveQuoteRow[];
      };
      if (!Array.isArray(data.quotes)) return;
      const map: Record<string, LiveQuoteRow> = {};
      for (const q of data.quotes) {
        map[q.symbol.toUpperCase()] = q;
      }
      setQuotes(map);
      setLive(Boolean(data.ok));
      setUpdatedAt(data.fetchedAt || new Date().toISOString());
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void pull();
    const id = window.setInterval(() => void pull(), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, key, pull]);

  return { quotes, live, updatedAt, refresh: pull };
}
