/**
 * Unified paper book — manual + auto (Nejoic) trades in one list for Paper Trading page.
 */

import { JIMBO_NAME, type JimboSettings, type JimboTrade } from '@/lib/jimbo';
import type { NejoicSettings, NejoicTrade } from '@/lib/nejoic';
import { strategyLabel } from '@/lib/nejoic-options';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import { defaultPaperAccount, paperPnL, type PaperAccount, type PaperTrade } from '@/lib/paper';

export const PAPER_STORE_KEY = 'trademindpro_paper_v1';
export const NEJOIC_STORE_KEY = 'trademindpro_nejoic_v1';
export const JIMBO_STORE_KEY = 'trademindpro_jimbo_v1';

export type ClearBookScope = 'today' | 'past' | 'all';

export type PaperBookMode = 'manual' | 'auto';
export type PaperBookInstrument = 'NIFTY' | 'BANKNIFTY' | 'STOCK' | 'OPTION';

export type PaperBookRow = {
  id: string;
  source: 'manual' | 'nejoic' | 'jimbo';
  mode: PaperBookMode;
  instrument: PaperBookInstrument;
  symbol: string;
  stockName: string;
  exchange: string;
  side: string;
  qty: number;
  entry: number;
  exit: number | null;
  openedAt: string;
  closedAt: string | null;
  status: 'open' | 'closed';
  strategyId: CatalogStrategyId | string;
  strategyLabel: string;
  timeframe: string;
  targetPoints: number;
  stopLossPoints: number;
  trailingPoints: number;
  trailingActivatePoints: number;
  brokerage: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  note: string;
  /** Manual row id for close action */
  manualId?: string;
};

export function todayKeyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return key === todayKeyLocal();
  } catch {
    return false;
  }
}

export function durationLabel(openedAt: string, closedAt?: string | null): string {
  if (!closedAt) return 'open';
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function manualInstrument(t: PaperTrade): PaperBookInstrument {
  if (t.instrument) return t.instrument;
  if (t.optionType) return 'OPTION';
  return 'STOCK';
}

function manualSymbol(t: PaperTrade): string {
  if (t.optionType && t.strike) {
    return `${t.symbol || 'NIFTY'} ${t.strike} ${t.optionType}`;
  }
  return t.symbol;
}

export function manualToBookRow(t: PaperTrade): PaperBookRow {
  const net = paperPnL(t);
  return {
    id: `m-${t.id}`,
    source: 'manual',
    mode: t.mode || 'manual',
    instrument: manualInstrument(t),
    symbol: manualSymbol(t),
    stockName: t.stockName || '',
    exchange: t.exchange || '',
    side: t.side,
    qty: t.qty,
    entry: t.entryPrice ?? 0,
    exit: t.exitPrice,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    status: t.status,
    strategyId: t.strategyId || 'price_action_hhll',
    strategyLabel: strategyLabel(t.strategyId || 'price_action_hhll'),
    timeframe: t.timeframe || '5m',
    targetPoints: t.targetPoints ?? 40,
    stopLossPoints: t.stopLossPoints ?? 25,
    trailingPoints: t.trailingStopPoints ?? 0,
    trailingActivatePoints: t.trailingActivatePoints ?? 0,
    brokerage: t.brokerage ?? null,
    grossPnl: t.grossPnl ?? null,
    netPnl: net,
    note: t.note || '',
    manualId: t.id,
  };
}

export function nejoicToBookRow(t: NejoicTrade, nejoic: NejoicSettings): PaperBookRow {
  const strat = nejoic.strategyIds[0] || 'price_action_hhll';
  return {
    id: `n-${t.id}`,
    source: 'nejoic',
    mode: 'auto',
    instrument: 'NIFTY',
    symbol: `NIFTY ${t.strike} ${t.option}`,
    stockName: '',
    exchange: '',
    side: t.side,
    qty: t.lots,
    entry: t.entryPremium ?? 0,
    exit: t.exitPremium,
    openedAt: t.at,
    closedAt: t.exitAt,
    status: t.status,
    strategyId: strat,
    strategyLabel: strategyLabel(strat),
    timeframe: nejoic.primaryTimeframe,
    targetPoints: nejoic.targetPoints,
    stopLossPoints: nejoic.stopLossPoints,
    trailingPoints: nejoic.trailingStopPoints,
    trailingActivatePoints: nejoic.trailingActivatePoints,
    brokerage: t.brokerage ?? null,
    grossPnl: t.grossPnl ?? null,
    netPnl: t.pnl,
    note: t.note || '',
  };
}

export function jimboToBookRow(t: JimboTrade, jimbo: JimboSettings): PaperBookRow {
  const strat = jimbo.strategyId || 'price_action_hhll';
  return {
    id: `j-${t.id}`,
    source: 'jimbo',
    mode: 'auto',
    instrument: 'STOCK',
    symbol: `${t.symbol} ${t.strike} ${t.option}`,
    stockName: t.symbol,
    exchange: 'NSE',
    side: 'BUY',
    qty: t.lots * t.lotSize,
    entry: t.entryPremium,
    exit: t.exitPremium,
    openedAt: t.at,
    closedAt: t.exitAt,
    status: t.status,
    strategyId: strat,
    strategyLabel: `${JIMBO_NAME} · ${strategyLabel(strat)}`,
    timeframe: jimbo.primaryTimeframe,
    targetPoints: jimbo.targetPoints,
    stopLossPoints: jimbo.stopLossPoints,
    trailingPoints: jimbo.trailingStopPoints,
    trailingActivatePoints: jimbo.trailingActivatePoints,
    brokerage: null,
    grossPnl: t.pnl,
    netPnl: t.pnl,
    note: t.note || '',
  };
}

export function buildPaperBook(
  manual: PaperTrade[],
  nejoic: NejoicTrade[],
  jimbo: JimboTrade[],
  nejoicSettings: NejoicSettings,
  jimboSettings: JimboSettings
): PaperBookRow[] {
  const rows = [
    ...manual.map(manualToBookRow),
    ...nejoic.map((t) => nejoicToBookRow(t, nejoicSettings)),
    ...jimbo.map((t) => jimboToBookRow(t, jimboSettings)),
  ];
  return rows.sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
  );
}

export function summarizeBook(rows: PaperBookRow[]) {
  const open = rows.filter((r) => r.status === 'open');
  const closed = rows.filter((r) => r.status === 'closed');
  const today = rows.filter((r) => isToday(r.openedAt));
  const todayClosed = today.filter((r) => r.status === 'closed');
  const netToday = todayClosed.reduce((s, r) => s + (r.netPnl ?? 0), 0);
  const netAll = closed.reduce((s, r) => s + (r.netPnl ?? 0), 0);
  const brok = closed.reduce((s, r) => s + (r.brokerage ?? 0), 0);
  return {
    openCount: open.length,
    closedCount: closed.length,
    todayCount: today.length,
    todayClosedCount: todayClosed.length,
    netToday,
    netAll,
    brokeragePaid: brok,
  };
}

function rowMatchesScope(openedAt: string, scope: ClearBookScope): boolean {
  if (scope === 'all') return true;
  const today = isToday(openedAt);
  return scope === 'today' ? today : !today;
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function dispatchStoreSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('trademindpro-paper-sync'));
  window.dispatchEvent(new Event('trademindpro-nejoic-sync'));
  window.dispatchEvent(new Event('trademindpro-jimbo-sync'));
}

function unlockManualCash(trade: PaperTrade, cash: number): number {
  if (trade.status === 'open' && trade.side === 'BUY') {
    return cash + trade.qty * trade.entryPrice;
  }
  return cash;
}

function readPaperStore(): { account: PaperAccount; trades: PaperTrade[] } {
  const fallback = defaultPaperAccount();
  if (typeof window === 'undefined') {
    return { account: fallback, trades: [] };
  }
  try {
    const raw = localStorage.getItem(PAPER_STORE_KEY);
    if (!raw) return { account: fallback, trades: [] };
    const parsed = JSON.parse(raw) as { account?: PaperAccount; trades?: PaperTrade[] };
    return {
      account: { ...fallback, ...parsed.account },
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    };
  } catch {
    return { account: fallback, trades: [] };
  }
}

function writePaperStore(store: { account: PaperAccount; trades: PaperTrade[] }) {
  localStorage.setItem(PAPER_STORE_KEY, JSON.stringify(store));
}

function filterManualTrades(trades: PaperTrade[], scope: ClearBookScope) {
  const keep: PaperTrade[] = [];
  const remove: PaperTrade[] = [];
  for (const t of trades) {
    if (rowMatchesScope(t.openedAt, scope)) remove.push(t);
    else keep.push(t);
  }
  return { keep, remove };
}

function filterByScope<T extends { at: string }>(trades: T[], scope: ClearBookScope) {
  const keep: T[] = [];
  const remove: T[] = [];
  for (const t of trades) {
    if (rowMatchesScope(t.at, scope)) remove.push(t);
    else keep.push(t);
  }
  return { keep, remove };
}

/** Remove paper-book rows by scope (today / past / all). Returns count removed. */
export function clearPaperBookTrades(scope: ClearBookScope): number {
  if (typeof window === 'undefined') return 0;

  let removed = 0;

  const paper = readPaperStore();
  const manual = filterManualTrades(paper.trades, scope);
  if (manual.remove.length) {
    let cash = paper.account.cash;
    for (const t of manual.remove) cash = unlockManualCash(t, cash);
    writePaperStore({ account: { ...paper.account, cash }, trades: manual.keep });
    removed += manual.remove.length;
  }

  try {
    const nejoicRaw = localStorage.getItem(NEJOIC_STORE_KEY);
    if (nejoicRaw) {
      const parsed = JSON.parse(nejoicRaw) as { trades?: NejoicTrade[] };
      const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
      const filtered = filterByScope(trades, scope);
      if (filtered.remove.length) {
        localStorage.setItem(
          NEJOIC_STORE_KEY,
          JSON.stringify({ ...parsed, trades: filtered.keep })
        );
        removed += filtered.remove.length;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const jimboRaw = localStorage.getItem(JIMBO_STORE_KEY);
    if (jimboRaw) {
      const parsed = JSON.parse(jimboRaw) as { trades?: JimboTrade[] };
      const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
      const filtered = filterByScope(trades, scope);
      if (filtered.remove.length) {
        localStorage.setItem(
          JIMBO_STORE_KEY,
          JSON.stringify({ ...parsed, trades: filtered.keep })
        );
        removed += filtered.remove.length;
      }
    }
  } catch {
    /* ignore */
  }

  if (removed > 0) dispatchStoreSync();
  return removed;
}

/** Delete one row from its source store. */
export function deletePaperBookRow(row: PaperBookRow): boolean {
  if (typeof window === 'undefined') return false;

  if (row.source === 'manual' && row.manualId) {
    const paper = readPaperStore();
    const trade = paper.trades.find((t) => t.id === row.manualId);
    if (!trade) return false;
    const cash = unlockManualCash(trade, paper.account.cash);
    writePaperStore({
      account: { ...paper.account, cash },
      trades: paper.trades.filter((t) => t.id !== row.manualId),
    });
    dispatchStoreSync();
    return true;
  }

  const tradeId = row.id.slice(2);

  if (row.source === 'nejoic') {
    try {
      const raw = localStorage.getItem(NEJOIC_STORE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { trades?: NejoicTrade[] };
      const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
      if (!trades.some((t) => t.id === tradeId)) return false;
      localStorage.setItem(
        NEJOIC_STORE_KEY,
        JSON.stringify({ ...parsed, trades: trades.filter((t) => t.id !== tradeId) })
      );
      dispatchStoreSync();
      return true;
    } catch {
      return false;
    }
  }

  if (row.source === 'jimbo') {
    try {
      const raw = localStorage.getItem(JIMBO_STORE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { trades?: JimboTrade[] };
      const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
      if (!trades.some((t) => t.id === tradeId)) return false;
      localStorage.setItem(
        JIMBO_STORE_KEY,
        JSON.stringify({ ...parsed, trades: trades.filter((t) => t.id !== tradeId) })
      );
      dispatchStoreSync();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/** Download rows as CSV to the user's computer. */
export function downloadPaperBookCsv(rows: PaperBookRow[], tabLabel: string) {
  if (typeof window === 'undefined' || rows.length === 0) return;

  const headers = [
    'Opened at',
    'Closed at',
    'Source',
    'Mode',
    'Instrument',
    'Symbol',
    'Stock name',
    'Exchange',
    'Side',
    'Strategy',
    'Timeframe',
    'Qty',
    'Entry',
    'Exit',
    'Stop loss pts',
    'Target pts',
    'Trailing pts',
    'Status',
    'Brokerage',
    'Gross P&L',
    'Net P&L',
    'Duration',
    'Note',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.openedAt,
        r.closedAt || '',
        r.source,
        r.mode,
        r.instrument,
        r.symbol,
        r.stockName,
        r.exchange,
        r.side,
        r.strategyLabel,
        r.timeframe,
        r.qty,
        r.entry,
        r.exit ?? '',
        r.stopLossPoints,
        r.targetPoints,
        r.trailingPoints,
        r.status,
        r.brokerage ?? '',
        r.grossPnl ?? '',
        r.netPnl ?? '',
        durationLabel(r.openedAt, r.closedAt),
        r.note,
      ]
        .map(csvCell)
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `paper-results-${tabLabel}-${todayKeyLocal()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
