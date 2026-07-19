'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  emptyWatchlist,
  ensurePrimaryWatchlist,
  isPinned,
  isPrimaryCorePin,
  makeSymbol,
  nextPinOrder,
  type Exchange,
  type Watchlist,
  type WatchSymbol,
} from '@/lib/watchlist';

const KEY = 'trademindpro_watchlists_v1';

function normalizeLists(lists: Watchlist[]): Watchlist[] {
  if (!lists.length) {
    return [ensurePrimaryWatchlist(emptyWatchlist())];
  }
  return lists.map((l, i) => (i === 0 ? ensurePrimaryWatchlist(l) : l));
}

function readLists(): Watchlist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const first = ensurePrimaryWatchlist(emptyWatchlist());
      localStorage.setItem(KEY, JSON.stringify([first]));
      return [first];
    }
    const parsed = JSON.parse(raw) as Watchlist[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const first = ensurePrimaryWatchlist(emptyWatchlist());
      localStorage.setItem(KEY, JSON.stringify([first]));
      return [first];
    }
    const normalized = normalizeLists(parsed);
    localStorage.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [ensurePrimaryWatchlist(emptyWatchlist())];
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
    const normalized = normalizeLists(next);
    setLists(normalized);
    writeLists(normalized);
    if (nextActive) setActiveId(nextActive);
  }, []);

  const active = lists.find((l) => l.id === activeId) || lists[0] || null;
  const isPrimaryList = Boolean(
    active && lists[0] && active.id === lists[0].id
  );

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
      const next = readLists().map((l) =>
        l.id === id ? { ...l, name: name.trim() } : l
      );
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
      if (current[0]?.id === id) {
        alert('Primary watchlist cannot be deleted (keeps NIFTY & SENSEX).');
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
      pin?: boolean;
    }) => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return { ok: false as const, error: 'No watchlist' };

      const symbol = input.symbol.trim().toUpperCase();
      if (!symbol) return { ok: false as const, error: 'Enter a symbol' };
      if (
        list.symbols.some(
          (s) => s.symbol === symbol && s.exchange === input.exchange
        )
      ) {
        return {
          ok: false as const,
          error: `${symbol} is already in this list`,
        };
      }

      const pinOrder = input.pin ? nextPinOrder(list.symbols) : null;
      const item = makeSymbol({ ...input, pinOrder });
      // New symbols go after pins
      const pinned = list.symbols.filter((s) => isPinned(s));
      const rest = list.symbols.filter((s) => !isPinned(s));
      const nextSymbols = pinOrder
        ? [...pinned, item, ...rest]
        : [...pinned, ...rest, item];

      const next = current.map((l) =>
        l.id === list.id ? { ...l, symbols: nextSymbols } : l
      );
      persist(next);
      return { ok: true as const, item };
    },
    [activeId, persist]
  );

  const removeSymbol = useCallback(
    (symbolId: string) => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return;
      const row = list.symbols.find((s) => s.id === symbolId);
      if (
        row &&
        current[0]?.id === list.id &&
        isPrimaryCorePin(row)
      ) {
        alert('NIFTY and SENSEX stay on the primary watchlist (positions 1 & 2).');
        return;
      }
      const next = current.map((l) =>
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

  /** Pin a symbol to the top block (after NIFTY/SENSEX on primary). */
  const pinSymbol = useCallback(
    (symbolId: string) => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return;
      const row = list.symbols.find((s) => s.id === symbolId);
      if (!row || isPinned(row)) return;

      const order = nextPinOrder(list.symbols);
      const next = current.map((l) =>
        l.id === list.id
          ? {
              ...l,
              symbols: l.symbols.map((s) =>
                s.id === symbolId ? { ...s, pinOrder: order } : s
              ),
            }
          : l
      );
      persist(next);
    },
    [activeId, persist]
  );

  /** Unpin (not allowed for NIFTY/SENSEX on primary list). */
  const unpinSymbol = useCallback(
    (symbolId: string) => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return;
      const row = list.symbols.find((s) => s.id === symbolId);
      if (!row) return;
      if (current[0]?.id === list.id && isPrimaryCorePin(row)) {
        alert('NIFTY and SENSEX stay pinned as #1 and #2 on the primary list.');
        return;
      }
      const next = current.map((l) =>
        l.id === list.id
          ? {
              ...l,
              symbols: l.symbols.map((s) =>
                s.id === symbolId ? { ...s, pinOrder: null } : s
              ),
            }
          : l
      );
      persist(next);
    },
    [activeId, persist]
  );

  /** Move a pinned row up/down within the pinned block. */
  const movePin = useCallback(
    (symbolId: string, direction: 'up' | 'down') => {
      const current = readLists();
      const list = current.find((l) => l.id === activeId) || current[0];
      if (!list) return;

      const pinned = list.symbols
        .filter((s) => isPinned(s))
        .sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
      const idx = pinned.findIndex((s) => s.id === symbolId);
      if (idx < 0) return;

      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= pinned.length) return;

      // On primary list, keep NIFTY/SENSEX locked in slots 0 and 1
      const isPrimary = current[0]?.id === list.id;
      if (isPrimary) {
        const a = pinned[idx];
        const b = pinned[swapWith];
        if (isPrimaryCorePin(a) || isPrimaryCorePin(b)) {
          // Allow swapping only among non-core pins (index >= 2)
          if (idx < 2 || swapWith < 2) return;
        }
      }

      const orderA = pinned[idx].pinOrder || idx + 1;
      const orderB = pinned[swapWith].pinOrder || swapWith + 1;
      const idA = pinned[idx].id;
      const idB = pinned[swapWith].id;

      const next = current.map((l) =>
        l.id === list.id
          ? {
              ...l,
              symbols: l.symbols.map((s) => {
                if (s.id === idA) return { ...s, pinOrder: orderB };
                if (s.id === idB) return { ...s, pinOrder: orderA };
                return s;
              }),
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
    isPrimaryList,
    setActiveId,
    createList,
    renameList,
    deleteList,
    addSymbol,
    removeSymbol,
    updateNotes,
    pinSymbol,
    unpinSymbol,
    movePin,
  };
}

export type { WatchSymbol, Watchlist };
