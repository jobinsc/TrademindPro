'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  emptyWatchlist,
  makeSymbol,
  type Exchange,
  type Watchlist,
  type WatchSymbol,
} from '@/lib/watchlist';

const KEY = 'trademindpro_watchlists_v1';

function readLists(): Watchlist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const first = emptyWatchlist();
      localStorage.setItem(KEY, JSON.stringify([first]));
      return [first];
    }
    const parsed = JSON.parse(raw) as Watchlist[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const first = emptyWatchlist();
      localStorage.setItem(KEY, JSON.stringify([first]));
      return [first];
    }
    return parsed;
  } catch {
    return [emptyWatchlist()];
  }
}

function writeLists(lists: Watchlist[]) {
  localStorage.setItem(KEY, JSON.stringify(lists));
}

export function useWatchlists() {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = readLists();
    setLists(loaded);
    setActiveId(loaded[0]?.id || '');
    setReady(true);
  }, []);

  const persist = useCallback((next: Watchlist[], nextActive?: string) => {
    setLists(next);
    writeLists(next);
    if (nextActive) setActiveId(nextActive);
  }, []);

  const active = lists.find((l) => l.id === activeId) || lists[0] || null;

  const createList = useCallback(
    (name: string) => {
      const list = emptyWatchlist(name.trim() || 'New Watchlist');
      const current = readLists();
      persist([...current, list], list.id);
      return list;
    },
    [persist]
  );

  const renameList = useCallback(
    (id: string, name: string) => {
      if (!name.trim()) return;
      const next = readLists().map((l) => (l.id === id ? { ...l, name: name.trim() } : l));
      persist(next);
    },
    [persist]
  );

  const deleteList = useCallback(
    (id: string) => {
      const current = readLists();
      if (current.length <= 1) {
        alert('Keep at least one watchlist');
        return;
      }
      const next = current.filter((l) => l.id !== id);
      persist(next, next[0].id);
    },
    [persist]
  );

  const addSymbol = useCallback(
    (input: {
      symbol: string;
      exchange: Exchange;
      name?: string;
      notes?: string;
    }) => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return { ok: false as const, error: 'No watchlist' };

      const symbol = input.symbol.trim().toUpperCase();
      if (!symbol) return { ok: false as const, error: 'Enter a symbol' };
      if (list.symbols.some((s) => s.symbol === symbol && s.exchange === input.exchange)) {
        return { ok: false as const, error: `${symbol} is already in this list` };
      }

      const item = makeSymbol(input);
      const next = current.map((l) =>
        l.id === list.id ? { ...l, symbols: [item, ...l.symbols] } : l
      );
      persist(next);
      return { ok: true as const, item };
    },
    [activeId, persist]
  );

  const removeSymbol = useCallback(
    (symbolId: string) => {
      const next = readLists().map((l) =>
        l.id === activeId
          ? { ...l, symbols: l.symbols.filter((s) => s.id !== symbolId) }
          : l
      );
      persist(next);
    },
    [activeId, persist]
  );

  const updateNotes = useCallback(
    (symbolId: string, notes: string) => {
      const next = readLists().map((l) =>
        l.id === activeId
          ? {
              ...l,
              symbols: l.symbols.map((s) =>
                s.id === symbolId ? { ...s, notes } : s
              ),
            }
          : l
      );
      persist(next);
    },
    [activeId, persist]
  );

  return {
    ready,
    lists,
    active,
    activeId,
    setActiveId,
    createList,
    renameList,
    deleteList,
    addSymbol,
    removeSymbol,
    updateNotes,
  };
}

export type { WatchSymbol, Watchlist };
