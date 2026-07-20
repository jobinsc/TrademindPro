'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultPaperAccount,
  closePaperTradeWithBrokerage,
  paperPnL,
  type PaperAccount,
  type PaperTrade,
  type PaperTradeInput,
} from '@/lib/paper';
import { getBrokeragePerLot } from '@/lib/brokerage';
import { formatCurrency } from '@/lib/utils';

const KEY = 'trademindpro_paper_v1';
export const PAPER_SYNC = 'trademindpro-paper-sync';

type Store = { account: PaperAccount; trades: PaperTrade[] };

function normalizeTrade(t: Partial<PaperTrade>): PaperTrade {
  return {
    id: t.id || crypto.randomUUID(),
    mode: t.mode || 'manual',
    instrument: t.instrument || 'STOCK',
    symbol: t.symbol || '',
    side: t.side || 'BUY',
    qty: t.qty ?? 1,
    entryPrice: t.entryPrice ?? 0,
    exitPrice: t.exitPrice ?? null,
    optionType: t.optionType ?? null,
    strike: t.strike ?? null,
    strategyId: t.strategyId,
    timeframe: t.timeframe,
    targetPoints: t.targetPoints,
    stopLossPoints: t.stopLossPoints,
    trailingStopPoints: t.trailingStopPoints,
    trailingActivatePoints: t.trailingActivatePoints,
    status: t.status || 'open',
    openedAt: t.openedAt || new Date().toISOString(),
    closedAt: t.closedAt ?? null,
    brokerage: t.brokerage,
    grossPnl: t.grossPnl,
    note: t.note,
    stockName: t.stockName,
    exchange: t.exchange,
  };
}

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
      trades: Array.isArray(parsed.trades)
        ? parsed.trades.map((t) => normalizeTrade(t as Partial<PaperTrade>))
        : [],
    };
  } catch {
    return { account: defaultPaperAccount(), trades: [] };
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PAPER_SYNC));
  }
}

export function usePaperTrading() {
  const [account, setAccount] = useState<PaperAccount>(defaultPaperAccount());
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => {
    const store = read();
    setAccount(store.account);
    setTrades(store.trades);
  }, []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(PAPER_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(PAPER_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const persist = useCallback((store: Store) => {
    setAccount(store.account);
    setTrades(store.trades);
    write(store);
  }, []);

  const openTrade = useCallback(
    (input: PaperTradeInput) => {
      const store = read();
      const cost = input.qty * input.entryPrice;
      if (input.side === 'BUY' && cost > store.account.cash) {
        return { ok: false as const, error: 'Not enough paper cash' };
      }
      const perLot = input.brokeragePerLot ?? getBrokeragePerLot();
      const trade: PaperTrade = normalizeTrade({
        id: crypto.randomUUID(),
        mode: input.mode || 'manual',
        instrument: input.instrument,
        symbol: input.symbol.trim().toUpperCase(),
        side: input.side,
        qty: input.qty,
        entryPrice: input.entryPrice,
        optionType: input.optionType ?? null,
        strike: input.strike ?? null,
        strategyId: input.strategyId,
        timeframe: input.timeframe,
        targetPoints: input.targetPoints,
        stopLossPoints: input.stopLossPoints,
        trailingStopPoints: input.trailingStopPoints,
        trailingActivatePoints: input.trailingActivatePoints,
        note: input.note,
        stockName: input.stockName,
        exchange: input.exchange,
        status: 'open',
        openedAt: new Date().toISOString(),
        closedAt: null,
        exitPrice: null,
      });
      const cash =
        input.side === 'BUY' ? store.account.cash - cost : store.account.cash;
      persist({
        account: { ...store.account, cash },
        trades: [trade, ...store.trades],
      });
      return { ok: true as const, trade };
    },
    [persist]
  );

  const closeTrade = useCallback(
    (id: string, exitPrice: number, perLot?: number) => {
      const store = read();
      const trade = store.trades.find((t) => t.id === id);
      if (!trade || trade.status !== 'open') {
        return { ok: false as const, error: 'Trade not found or already closed' };
      }
      const rate = perLot ?? getBrokeragePerLot();
      const closed = closePaperTradeWithBrokerage(trade, exitPrice, rate);
      const pnl = paperPnL(closed, rate) || 0;
      const cash =
        trade.side === 'BUY'
          ? store.account.cash + trade.qty * trade.entryPrice + pnl
          : store.account.cash + pnl;

      persist({
        account: { ...store.account, cash },
        trades: store.trades.map((t) => (t.id === id ? closed : t)),
      });
      return { ok: true as const };
    },
    [persist]
  );

  const resetAccount = useCallback((startingCash?: number) => {
    const cap = Math.max(1000, Math.round(startingCash ?? defaultPaperAccount().startingCash));
    persist({ account: { cash: cap, startingCash: cap }, trades: [] });
  }, [persist]);

  const setCapital = useCallback(
    (amount: number) => {
      const store = read();
      const next = Math.max(1000, Math.round(amount));
      const open = store.trades.filter((t) => t.status === 'open');
      const locked = open
        .filter((t) => t.side === 'BUY')
        .reduce((a, t) => a + t.qty * t.entryPrice, 0);
      const minCash = locked;
      const newCash = store.account.cash + (next - store.account.startingCash);
      if (newCash < minCash) {
        return {
          ok: false as const,
          error: `Need at least ${formatCurrency(minCash)} cash for open positions`,
        };
      }
      persist({
        ...store,
        account: { startingCash: next, cash: Math.max(0, newCash) },
      });
      return { ok: true as const };
    },
    [persist]
  );

  return { ready, account, trades, openTrade, closeTrade, resetAccount, setCapital };
}
