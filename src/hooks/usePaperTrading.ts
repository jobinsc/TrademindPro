'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultPaperAccount,
  paperPnL,
  type PaperAccount,
  type PaperSide,
  type PaperTrade,
} from '@/lib/paper';

const KEY = 'trademindpro_paper_v1';

type Store = { account: PaperAccount; trades: PaperTrade[] };

function read(): Store {
  if (typeof window === 'undefined') {
    return { account: defaultPaperAccount(), trades: [] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { account: defaultPaperAccount(), trades: [] };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      account: { ...defaultPaperAccount(), ...parsed.account },
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    };
  } catch {
    return { account: defaultPaperAccount(), trades: [] };
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function usePaperTrading() {
  const [account, setAccount] = useState<PaperAccount>(defaultPaperAccount());
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = read();
    setAccount(store.account);
    setTrades(store.trades);
    setReady(true);
  }, []);

  const persist = useCallback((store: Store) => {
    setAccount(store.account);
    setTrades(store.trades);
    write(store);
  }, []);

  const openTrade = useCallback(
    (input: { symbol: string; side: PaperSide; qty: number; entryPrice: number }) => {
      const store = read();
      const cost = input.qty * input.entryPrice;
      if (input.side === 'BUY' && cost > store.account.cash) {
        return { ok: false as const, error: 'Not enough paper cash' };
      }
      const trade: PaperTrade = {
        id: crypto.randomUUID(),
        symbol: input.symbol.trim().toUpperCase(),
        side: input.side,
        qty: input.qty,
        entryPrice: input.entryPrice,
        exitPrice: null,
        status: 'open',
        openedAt: new Date().toISOString(),
        closedAt: null,
      };
      const cash =
        input.side === 'BUY' ? store.account.cash - cost : store.account.cash; // short: simplify — no margin model
      persist({
        account: { ...store.account, cash },
        trades: [trade, ...store.trades],
      });
      return { ok: true as const, trade };
    },
    [persist]
  );

  const closeTrade = useCallback(
    (id: string, exitPrice: number) => {
      const store = read();
      const trade = store.trades.find((t) => t.id === id);
      if (!trade || trade.status !== 'open') {
        return { ok: false as const, error: 'Trade not found or already closed' };
      }
      const closed: PaperTrade = {
        ...trade,
        exitPrice,
        status: 'closed',
        closedAt: new Date().toISOString(),
      };
      const pnl = paperPnL(closed) || 0;
      const release =
        trade.side === 'BUY' ? trade.qty * trade.entryPrice + pnl : trade.qty * exitPrice;
      // For BUY: return entry cost + pnl to cash. For SELL short simplified: add exit proceeds impact via pnl on cash
      const cash =
        trade.side === 'BUY'
          ? store.account.cash + trade.qty * trade.entryPrice + pnl
          : store.account.cash + pnl;

      persist({
        account: { ...store.account, cash },
        trades: store.trades.map((t) => (t.id === id ? closed : t)),
      });
      // silence unused
      void release;
      return { ok: true as const };
    },
    [persist]
  );

  const resetAccount = useCallback(() => {
    persist({ account: defaultPaperAccount(), trades: [] });
  }, [persist]);

  return { ready, account, trades, openTrade, closeTrade, resetAccount };
}
