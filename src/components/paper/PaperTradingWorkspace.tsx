'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Download, FileText, OctagonX, Plus, RotateCcw, Save, Square, Trash2, X, Zap } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import { usePaperTrading } from '@/hooks/usePaperTrading';
import { usePaperTradeSettings } from '@/hooks/usePaperTradeSettings';
import { useNejoic } from '@/hooks/useNejoic';
import { useJimbo } from '@/hooks/useJimbo';
import {
  type PaperInstrument,
  type PaperSide,
  type PaperTradeInput,
} from '@/lib/paper';
import { formatCurrency } from '@/lib/utils';
import SymbolAutocomplete from '@/components/ui/SymbolAutocomplete';
import type { NejoicTrade } from '@/lib/nejoic';
import type { JimboTrade } from '@/lib/jimbo';
import { NEJOIC_NAME } from '@/lib/nejoic';
import { JIMBO_NAME } from '@/lib/jimbo';
import { NEJOIC_TIMEFRAMES } from '@/lib/nejoic-options';
import { StrategyGroupedSelect } from '@/components/ui/StrategyPicker';
import PaperTradeSettingsPanel from '@/components/paper/PaperTradeSettingsPanel';
import {
  buildPaperBook,
  clearPaperBookTrades,
  deletePaperBookRow,
  downloadPaperBookCsv,
  durationLabel,
  isToday,
  JIMBO_STORE_KEY,
  NEJOIC_STORE_KEY,
  summarizeBook,
  type ClearBookScope,
  type PaperBookRow,
} from '@/lib/paper-book';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';

const NEJOIC_KEY = NEJOIC_STORE_KEY;
const JIMBO_KEY = JIMBO_STORE_KEY;

function readNejoicTrades(): NejoicTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NEJOIC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { trades?: NejoicTrade[] };
    return Array.isArray(parsed.trades) ? parsed.trades : [];
  } catch {
    return [];
  }
}

function readJimboTrades(): JimboTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(JIMBO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { trades?: JimboTrade[] };
    return Array.isArray(parsed.trades) ? parsed.trades : [];
  } catch {
    return [];
  }
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

type ResultsTab = 'today' | 'past';

export default function PaperTradingWorkspace() {
  const { ready, account, trades, openTrade, closeTrade, resetAccount } = usePaperTrading();
  const { ready: paperReady, settings, update: updatePaper } = usePaperTradeSettings();
  const {
    ready: nejoicReady,
    settings: nejoicSettings,
    setAutoTrade: setNejoicAuto,
    fullStop: nejoicFullStop,
  } = useNejoic();
  const {
    ready: jimboReady,
    settings: jimboSettings,
    setAutoTrade: setJimboAuto,
    closeOpen: closeJimboOpen,
  } = useJimbo();

  const [nejoicTrades, setNejoicTrades] = useState<NejoicTrade[]>([]);
  const [jimboTrades, setJimboTrades] = useState<JimboTrade[]>([]);
  const [resultsTab, setResultsTab] = useState<ResultsTab>('today');
  const [resultsHint, setResultsHint] = useState('');
  const [detailRow, setDetailRow] = useState<PaperBookRow | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState(0);

  // New trade form
  const [formMode, setFormMode] = useState<'manual' | 'auto'>('manual');
  const [instrument, setInstrument] = useState<PaperInstrument>('NIFTY');
  const [symbol, setSymbol] = useState('');
  const [stockName, setStockName] = useState('');
  const [stockExchange, setStockExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [side, setSide] = useState<PaperSide>('BUY');
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [strike, setStrike] = useState<number>(0);
  const [qty, setQty] = useState(1);
  const [entryPrice, setEntryPrice] = useState(0);
  const [strategyId, setStrategyId] = useState<CatalogStrategyId>('price_action_hhll');
  const [timeframe, setTimeframe] = useState('5m');
  const [targetPoints, setTargetPoints] = useState(40);
  const [stopLossPoints, setStopLossPoints] = useState(25);
  const [trailingPoints, setTrailingPoints] = useState(0);
  const [trailingActivate, setTrailingActivate] = useState(20);
  const [note, setNote] = useState('');
  const [autoPickNejoic, setAutoPickNejoic] = useState(true);
  const [autoPickJimbo, setAutoPickJimbo] = useState(true);

  useEffect(() => {
    if (!paperReady) return;
    setInstrument(settings.defaultInstrument === 'STOCK' ? 'STOCK' : settings.defaultInstrument);
  }, [paperReady, settings.defaultInstrument]);

  useEffect(() => {
    const pull = () => {
      setNejoicTrades(readNejoicTrades());
      setJimboTrades(readJimboTrades());
    };
    pull();
    const id = window.setInterval(pull, 3000);
    window.addEventListener('focus', pull);
    window.addEventListener('trademindpro-nejoic-sync', pull);
    window.addEventListener('trademindpro-jimbo-sync', pull);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', pull);
      window.removeEventListener('trademindpro-nejoic-sync', pull);
      window.removeEventListener('trademindpro-jimbo-sync', pull);
    };
  }, []);

  function flashResults(msg: string) {
    setResultsHint(msg);
    window.setTimeout(() => setResultsHint(''), 2200);
  }

  function refreshBookFromStorage() {
    setNejoicTrades(readNejoicTrades());
    setJimboTrades(readJimboTrades());
  }

  function handleClearResults(scope: ClearBookScope) {
    const scopeLabel =
      scope === 'all' ? 'all' : scope === 'today' ? "today's" : 'past';
    const count =
      scope === 'all'
        ? book.length
        : scope === 'today'
          ? book.filter((r) => isToday(r.openedAt)).length
          : book.filter((r) => !isToday(r.openedAt)).length;
    if (count === 0) {
      flashResults(`No ${scopeLabel} trades to clear`);
      return;
    }
    if (
      !window.confirm(
        `Delete ${count} ${scopeLabel} paper result${count === 1 ? '' : 's'}? Manual, Nejoic, and Jimbo trades in this group will be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    const removed = clearPaperBookTrades(scope);
    refreshBookFromStorage();
    if (detailRow && (scope === 'all' || rowInScope(detailRow, scope))) {
      setDetailRow(null);
    }
    flashResults(removed ? `Cleared ${removed} trade${removed === 1 ? '' : 's'}` : 'Nothing to clear');
  }

  function rowInScope(row: PaperBookRow, scope: ClearBookScope): boolean {
    if (scope === 'all') return true;
    const today = isToday(row.openedAt);
    return scope === 'today' ? today : !today;
  }

  function handleDeleteRow(row: PaperBookRow) {
    const label = row.symbol || 'this trade';
    if (
      !window.confirm(
        `Delete ${label} from paper results?${row.status === 'open' && row.source === 'manual' ? ' Open manual cash will be returned.' : ''}`
      )
    ) {
      return;
    }
    if (deletePaperBookRow(row)) {
      refreshBookFromStorage();
      if (detailRow?.id === row.id) setDetailRow(null);
      flashResults('Trade deleted');
    } else {
      flashResults('Could not delete trade');
    }
  }

  function handleDownloadCsv() {
    if (displayRows.length === 0) {
      flashResults('No rows to export');
      return;
    }
    downloadPaperBookCsv(displayRows, resultsTab);
    flashResults(`Saved ${displayRows.length} rows as CSV`);
  }

  const book = useMemo(
    () =>
      paperReady && nejoicReady && jimboReady
        ? buildPaperBook(trades, nejoicTrades, jimboTrades, nejoicSettings, jimboSettings)
        : [],
    [paperReady, nejoicReady, jimboReady, trades, nejoicTrades, jimboTrades, nejoicSettings, jimboSettings]
  );

  const stats = useMemo(() => summarizeBook(book), [book]);

  const displayRows = useMemo(() => {
    if (resultsTab === 'today') return book.filter((r) => isToday(r.openedAt));
    return book.filter((r) => !isToday(r.openedAt));
  }, [book, resultsTab]);

  const showStockNameCol = useMemo(
    () => displayRows.some((r) => r.instrument === 'STOCK'),
    [displayRows]
  );

  const nejoicAutoOn = nejoicReady && nejoicSettings.autoTrade;
  const jimboAutoOn = jimboReady && jimboSettings.autoTrade;
  const bothAutoOn = nejoicAutoOn && jimboAutoOn;

  function applyAutoSelection(start: boolean) {
    if (autoPickNejoic && nejoicReady) setNejoicAuto(start);
    if (autoPickJimbo && jimboReady) setJimboAuto(start);
    if (start && autoPickNejoic && autoPickJimbo) updatePaper({ paperAgent: 'both' });
  }

  function resetFormFromSettings() {
    setFormMode('manual');
    setInstrument(settings.defaultInstrument === 'STOCK' ? 'STOCK' : settings.defaultInstrument);
    setSymbol('');
    setStockName('');
    setStockExchange('NSE');
    setSide('BUY');
    setOptionType('CE');
    setStrike(0);
    setQty(nejoicSettings.maxLotsPerTrade || 1);
    setEntryPrice(0);
    setStrategyId('price_action_hhll');
    setTimeframe(nejoicSettings.primaryTimeframe || '5m');
    setTargetPoints(nejoicSettings.targetPoints || 40);
    setStopLossPoints(nejoicSettings.stopLossPoints || 25);
    setTrailingPoints(nejoicSettings.trailingStopPoints || 0);
    setTrailingActivate(nejoicSettings.trailingActivatePoints || 20);
    setNote('');
  }

  function paperForceStop(exitTrades: boolean) {
    if (nejoicReady) setNejoicAuto(false);
    if (jimboReady) setJimboAuto(false);
    if (exitTrades) {
      for (const t of trades) {
        if (t.status === 'open') {
          closeTrade(t.id, t.entryPrice, nejoicSettings.brokeragePerLot);
        }
      }
      if (nejoicReady) nejoicFullStop(true);
      if (jimboReady) closeJimboOpen();
    }
  }

  function openNewTradeDrawer() {
    setError('');
    resetFormFromSettings();
    setOpen(true);
  }

  const settingsOpen = settings.settingsOpen;

  function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (formMode === 'auto') {
      if (!autoPickNejoic && !autoPickJimbo) {
        setError('Select at least one brain to start or stop');
        return;
      }
      const selectedRunning =
        (autoPickNejoic && nejoicAutoOn) || (autoPickJimbo && jimboAutoOn);
      applyAutoSelection(!selectedRunning);
      setOpen(false);
      return;
    }

    if (settings.allowManualWithAuto === false && anyAutoOn) {
      setError('Manual trades are disabled while auto is running. Enable in Paper settings.');
      return;
    }

    const isOption = instrument === 'NIFTY' || instrument === 'BANKNIFTY' || instrument === 'OPTION';
    if (isOption && (!strike || strike <= 0)) {
      setError('Enter strike for option paper trade');
      return;
    }
    if (!isOption && !symbol.trim()) {
      setError('Enter symbol for stock paper trade');
      return;
    }
    if (qty <= 0 || entryPrice <= 0) {
      setError('Qty and entry price are required');
      return;
    }

    const sym = isOption
      ? instrument === 'BANKNIFTY'
        ? 'BANKNIFTY'
        : 'NIFTY'
      : symbol.trim().toUpperCase();

    const input: PaperTradeInput = {
      mode: 'manual',
      instrument,
      symbol: sym,
      side,
      qty,
      entryPrice,
      optionType: isOption ? optionType : null,
      strike: isOption ? strike : null,
      strategyId,
      timeframe,
      targetPoints,
      stopLossPoints,
      trailingStopPoints: trailingPoints,
      trailingActivatePoints: trailingActivate,
      note: note.trim(),
      brokeragePerLot: nejoicSettings.brokeragePerLot,
      stockName: !isOption ? stockName.trim() || undefined : undefined,
      exchange: !isOption ? stockExchange : undefined,
    };

    const result = openTrade(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!closingId || exitPrice <= 0) return;
    closeTrade(closingId, exitPrice, nejoicSettings.brokeragePerLot);
    setClosingId(null);
    setExitPrice(0);
  }

  if (!ready || !paperReady) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading paper trading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Paper hub · results & manual trades
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Paper Trading
            </h1>
            <InfoBubble title="Paper hub">
              Run <strong>{NEJOIC_NAME}</strong> (Nifty), <strong>{JIMBO_NAME}</strong> (stocks), or{' '}
              <strong>both together</strong>. Manual trades work alongside auto. Each brain keeps its
              own settings.
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ModuleSettingsButton
            open={settingsOpen}
            onToggle={() => updatePaper({ settingsOpen: !settingsOpen })}
          />
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Reset paper cash to ${formatCurrency(settings.startingCapital)} and clear manual trades?`
                )
              ) {
                resetAccount(settings.startingCapital);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ee] bg-white px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
          >
            <RotateCcw className="h-4 w-4" />
            Reset manual
          </button>
          <button
            type="button"
            onClick={openNewTradeDrawer}
            className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Plus className="h-4 w-4" />
            New paper trade
          </button>
        </div>
      </div>

      {/* Auto status */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#cfe0ee] bg-sky-soft/40 px-4 py-3">
        <Bot className="h-5 w-5 shrink-0 text-sky-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sky-ink">
            {bothAutoOn
              ? `${NEJOIC_NAME} + ${JIMBO_NAME} auto ON`
              : nejoicAutoOn
                ? `${NEJOIC_NAME} auto ON · ${JIMBO_NAME} OFF`
                : jimboAutoOn
                  ? `${JIMBO_NAME} auto ON · ${NEJOIC_NAME} OFF`
                  : 'All auto OFF'}
          </p>
          <p className="text-[11px] text-sky-ink/50">
            {NEJOIC_NAME}: {nejoicSettings.mode} · {JIMBO_NAME}: {jimboSettings.mode} · Manual{' '}
            {settings.allowManualWithAuto !== false ? 'allowed' : 'paused while auto runs'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleRunButton variant="force" onClick={() => paperForceStop(false)}>
            <OctagonX className="h-4 w-4" />
            Force stop all
          </ModuleRunButton>
          <ModuleRunButton variant="force" onClick={() => paperForceStop(true)}>
            <OctagonX className="h-4 w-4" />
            Force stop + exit
          </ModuleRunButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Paper cash" value={formatCurrency(account.cash)} />
        <Stat
          label="Starting capital"
          value={formatCurrency(account.startingCash)}
        />
        <Stat label="Today net P&L" value={formatCurrency(stats.netToday)} tone={stats.netToday > 0 ? 'up' : stats.netToday < 0 ? 'down' : 'flat'} />
        <Stat label="All-time net" value={formatCurrency(stats.netAll)} tone={stats.netAll > 0 ? 'up' : stats.netAll < 0 ? 'down' : 'flat'} />
        <Stat label="Open / closed" value={`${stats.openCount} / ${stats.closedCount}`} />
        <Stat label="Brokerage paid" value={formatCurrency(stats.brokeragePaid)} />
      </div>

      <ModuleSettingsPanel
        open={settingsOpen}
        title="Paper hub settings"
        description="Run Nejoic, Jimbo, or both for auto paper/live. Manual trades can run alongside. Strategy & SL/target live in each agent."
        footer={
          <button
            type="button"
            onClick={() => {
              updatePaper({ ...settings });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        }
        controls={
          <>
            <ModuleRunButton variant="force" onClick={() => paperForceStop(false)}>
              <OctagonX className="h-4 w-4" />
              Force stop all
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={() => paperForceStop(true)}>
              <OctagonX className="h-4 w-4" />
              Force stop + exit
            </ModuleRunButton>
          </>
        }
      >
        <PaperTradeSettingsPanel embedded />
      </ModuleSettingsPanel>

      {/* Results */}
      <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Paper results
            </h2>
            <p className="mt-0.5 text-[12px] text-sky-ink/50">
              Manual + auto in one book · click a row for full details
            </p>
            {resultsHint ? (
              <p className="mt-1 text-[12px] font-semibold text-emerald-600">{resultsHint}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-[#cfe0ee] bg-white p-1">
              {(['today', 'past'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setResultsTab(tab)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize ${
                    resultsTab === tab
                      ? 'bg-sky-deep text-white'
                      : 'text-sky-ink/55 hover:text-sky-ink'
                  }`}
                >
                  {tab === 'today' ? `Today (${stats.todayCount})` : 'Past'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={displayRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-xs font-semibold text-sky-ink/70 hover:bg-sky-soft disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-3.5 w-3.5" />
              Save CSV
            </button>
            <button
              type="button"
              onClick={() => handleClearResults(resultsTab)}
              disabled={displayRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear {resultsTab === 'today' ? 'today' : 'past'}
            </button>
          </div>
        </div>
        {book.length > 0 ? (
          <p className="mt-2 text-[11px] text-sky-ink/45">
            <button
              type="button"
              onClick={() => handleClearResults('all')}
              className="font-semibold text-rose-600/80 hover:text-rose-700 hover:underline"
            >
              Clear all results
            </button>
            {' · '}
            Use Delete on a row to remove one trade only
          </p>
        ) : null}

        {displayRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#b8d4e8] px-4 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-sky-ink">
              No {resultsTab === 'today' ? "today's" : 'past'} paper trades
            </p>
            <p className="mt-1 text-[12px] text-sky-ink/55">
              Use <strong>New paper trade</strong> or turn <strong>Auto ON</strong> above.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8f2fa] text-[10px] font-semibold uppercase tracking-wide text-sky-ink/40">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Mode</th>
                  <th className="px-2 py-2">Instrument</th>
                  <th className="px-2 py-2">Symbol</th>
                  {showStockNameCol ? (
                    <th className="px-2 py-2">Stock name</th>
                  ) : null}
                  <th className="px-2 py-2">Strategy</th>
                  <th className="px-2 py-2">TF</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Entry → Exit</th>
                  <th className="px-2 py-2">SL/Tgt</th>
                  <th className="px-2 py-2">Trail</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Brok</th>
                  <th className="px-2 py-2 text-right">Net P&amp;L</th>
                  <th className="px-2 py-2">Dur</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/30"
                    onClick={() => setDetailRow(r)}
                  >
                    <td className="px-2 py-2.5 text-[12px] text-sky-ink/55">
                      {r.openedAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-2 py-2.5 capitalize">{r.mode}</td>
                    <td className="px-2 py-2.5">{r.instrument}</td>
                    <td className="px-2 py-2.5 font-semibold text-sky-ink">{r.symbol}</td>
                    {showStockNameCol ? (
                      <td className="max-w-[140px] truncate px-2 py-2.5 text-[12px] text-sky-ink/60">
                        {r.instrument === 'STOCK' ? r.stockName || '—' : '—'}
                      </td>
                    ) : null}
                    <td className="max-w-[120px] truncate px-2 py-2.5 text-[12px]">
                      {r.strategyLabel}
                    </td>
                    <td className="px-2 py-2.5">{r.timeframe}</td>
                    <td className="px-2 py-2.5 tabular-nums">{r.qty}</td>
                    <td className="px-2 py-2.5 tabular-nums text-sky-ink/70">
                      ₹{r.entry.toFixed(2)}
                      {r.exit != null ? ` → ₹${r.exit.toFixed(2)}` : ' → open'}
                    </td>
                    <td className="px-2 py-2.5 text-[12px]">
                      {r.stopLossPoints}/{r.targetPoints}
                    </td>
                    <td className="px-2 py-2.5 text-[12px]">
                      {r.trailingPoints > 0 ? `${r.trailingPoints}pts` : 'off'}
                    </td>
                    <td className="px-2 py-2.5 capitalize">{r.status}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-sky-ink/50">
                      {r.brokerage != null ? formatCurrency(r.brokerage) : '—'}
                    </td>
                    <td
                      className={`px-2 py-2.5 text-right font-semibold tabular-nums ${
                        r.netPnl == null
                          ? 'text-sky-ink/35'
                          : r.netPnl >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-500'
                      }`}
                    >
                      {r.netPnl == null ? '—' : formatCurrency(r.netPnl)}
                    </td>
                    <td className="px-2 py-2.5 text-[12px]">
                      {durationLabel(r.openedAt, r.closedAt)}
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === 'open' && r.manualId && (
                          <button
                            type="button"
                            onClick={() => {
                              setClosingId(r.manualId!);
                              setExitPrice(r.entry);
                            }}
                            className="text-xs font-semibold text-sky-deep hover:underline"
                          >
                            Close
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(r)}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* New trade drawer */}
      {open && (
        <Drawer title="New paper trade" onClose={() => setOpen(false)}>
          <form onSubmit={handleOpen} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Field label="Mode">
              <div className="grid grid-cols-2 gap-2">
                {(['manual', 'auto'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormMode(m)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${
                      formMode === m
                        ? 'border-sky-deep bg-sky-soft text-sky-deep'
                        : 'border-[#cfe0ee] text-sky-ink/60'
                    }`}
                  >
                    {m === 'manual' ? 'Manual · open now' : 'Auto · start bot'}
                  </button>
                ))}
              </div>
            </Field>

            {formMode === 'manual' && (
              <>
                <Field label="Instrument">
                  <select
                    value={instrument}
                    onChange={(e) => {
                      const next = e.target.value as PaperInstrument;
                      setInstrument(next);
                      if (next !== 'STOCK') {
                        setSymbol('');
                        setStockName('');
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="NIFTY">Nifty options</option>
                    <option value="BANKNIFTY">Bank Nifty options</option>
                    <option value="STOCK">Stock (NSE/BSE)</option>
                  </select>
                </Field>

                {(instrument === 'NIFTY' || instrument === 'BANKNIFTY') && (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Strike">
                      <input
                        type="number"
                        min={0}
                        value={strike || ''}
                        onChange={(e) => setStrike(Number(e.target.value))}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Option">
                      <select
                        value={optionType}
                        onChange={(e) => setOptionType(e.target.value as 'CE' | 'PE')}
                        className={inputClass}
                      >
                        <option value="CE">CE</option>
                        <option value="PE">PE</option>
                      </select>
                    </Field>
                    <Field label="Side">
                      <select
                        value={side}
                        onChange={(e) => setSide(e.target.value as PaperSide)}
                        className={inputClass}
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </Field>
                  </div>
                )}

                {instrument === 'STOCK' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Symbol (NSE/BSE)">
                        <SymbolAutocomplete
                          value={symbol}
                          onChange={(v) => {
                            setSymbol(v);
                            if (!v.trim()) setStockName('');
                          }}
                          onPick={(item) => {
                            setSymbol(item.symbol);
                            setStockName(item.name);
                            setStockExchange(item.exchange);
                          }}
                          placeholder="Type RELIANCE, TCS…"
                          className={inputClass}
                          required
                        />
                      </Field>
                      <Field label="Company name">
                        <input
                          value={stockName}
                          readOnly
                          placeholder="Pick from suggestions"
                          className={`${inputClass} bg-sky-soft/40`}
                        />
                      </Field>
                    </div>
                    {stockExchange && symbol ? (
                      <p className="text-[11px] font-semibold uppercase text-sky-mid">
                        Exchange · {stockExchange}
                      </p>
                    ) : null}
                    <Field label="Side">
                      <select
                        value={side}
                        onChange={(e) => setSide(e.target.value as PaperSide)}
                        className={inputClass}
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </Field>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lots / qty">
                    <input
                      type="number"
                      min={1}
                      value={qty || ''}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label="Entry price ₹">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={entryPrice || ''}
                      onChange={(e) => setEntryPrice(Number(e.target.value))}
                      className={inputClass}
                      required
                    />
                  </Field>
                </div>

                <Field label="Strategy">
                  <StrategyGroupedSelect
                    value={strategyId}
                    onChange={(id) => setStrategyId(id as CatalogStrategyId)}
                    className={inputClass}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Timeframe">
                    <select
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                      className={inputClass}
                    >
                      {NEJOIC_TIMEFRAMES.map((tf) => (
                        <option key={tf.id} value={tf.id}>
                          {tf.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Brokerage ₹/lot">
                    <input
                      type="number"
                      min={0}
                      value={nejoicSettings.brokeragePerLot}
                      readOnly
                      className={`${inputClass} bg-sky-soft/40`}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Target (points)">
                    <input
                      type="number"
                      min={1}
                      value={targetPoints}
                      onChange={(e) => setTargetPoints(Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Stop-loss (points)">
                    <input
                      type="number"
                      min={1}
                      value={stopLossPoints}
                      onChange={(e) => setStopLossPoints(Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Trailing SL (pts · 0=off)">
                    <input
                      type="number"
                      min={0}
                      value={trailingPoints}
                      onChange={(e) => setTrailingPoints(Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Trail after profit (pts)">
                    <input
                      type="number"
                      min={0}
                      value={trailingActivate}
                      onChange={(e) => setTrailingActivate(Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Note (optional)">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={inputClass}
                    placeholder="Setup note…"
                  />
                </Field>
              </>
            )}

            {formMode === 'auto' && (
              <div className="space-y-3 rounded-xl border border-[#cfe0ee] bg-sky-soft/40 px-3 py-3 text-sm text-sky-ink/70">
                <p>Choose which brain(s) to start or stop. Both can run at the same time.</p>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoPickNejoic}
                    onChange={(e) => setAutoPickNejoic(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
                  />
                  <span>
                    <strong>{NEJOIC_NAME}</strong> · Nifty ({nejoicAutoOn ? 'ON' : 'OFF'}) ·{' '}
                    {nejoicSettings.mode}
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoPickJimbo}
                    onChange={(e) => setAutoPickJimbo(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
                  />
                  <span>
                    <strong>{JIMBO_NAME}</strong> · Stocks ({jimboAutoOn ? 'ON' : 'OFF'}) ·{' '}
                    {jimboSettings.mode}
                  </span>
                </label>
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              {formMode === 'auto' ? (
                (autoPickNejoic && nejoicAutoOn) || (autoPickJimbo && jimboAutoOn) ? (
                  <>
                    <Square className="h-4 w-4" />
                    Stop selected brains
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Start selected brains
                  </>
                )
              ) : (
                'Open paper trade'
              )}
            </button>
          </form>
        </Drawer>
      )}

      {closingId && (
        <Drawer title="Close paper trade" onClose={() => setClosingId(null)}>
          <form onSubmit={handleClose} className="space-y-4">
            <Field label="Exit price ₹">
              <input
                type="number"
                min={0}
                step="0.01"
                value={exitPrice || ''}
                onChange={(e) => setExitPrice(Number(e.target.value))}
                className={inputClass}
                required
              />
            </Field>
            <button
              type="submit"
              className="w-full rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Close trade
            </button>
          </form>
        </Drawer>
      )}

      {detailRow && (
        <Drawer title="Trade details" onClose={() => setDetailRow(null)}>
          <dl className="space-y-3 text-sm">
            <Detail label="Mode" value={detailRow.mode} />
            <Detail label="Source" value={detailRow.source} />
            <Detail label="Instrument" value={detailRow.instrument} />
            <Detail label="Symbol" value={detailRow.symbol} />
            {detailRow.instrument === 'STOCK' && detailRow.stockName ? (
              <Detail label="Stock name" value={detailRow.stockName} />
            ) : null}
            {detailRow.exchange ? (
              <Detail label="Exchange" value={detailRow.exchange} />
            ) : null}
            <Detail label="Side" value={detailRow.side} />
            <Detail label="Strategy" value={detailRow.strategyLabel} />
            <Detail label="Timeframe" value={detailRow.timeframe} />
            <Detail label="Qty / lots" value={String(detailRow.qty)} />
            <Detail label="Entry" value={`₹${detailRow.entry.toFixed(2)}`} />
            <Detail
              label="Exit"
              value={detailRow.exit != null ? `₹${detailRow.exit.toFixed(2)}` : 'open'}
            />
            <Detail label="Target pts" value={String(detailRow.targetPoints)} />
            <Detail label="Stop-loss pts" value={String(detailRow.stopLossPoints)} />
            <Detail
              label="Trailing"
              value={
                detailRow.trailingPoints > 0
                  ? `${detailRow.trailingPoints}pts after +${detailRow.trailingActivatePoints}`
                  : 'off'
              }
            />
            <Detail
              label="Brokerage"
              value={detailRow.brokerage != null ? formatCurrency(detailRow.brokerage) : '—'}
            />
            <Detail
              label="Gross P&L"
              value={detailRow.grossPnl != null ? formatCurrency(detailRow.grossPnl) : '—'}
            />
            <Detail
              label="Net P&L"
              value={detailRow.netPnl != null ? formatCurrency(detailRow.netPnl) : '—'}
            />
            <Detail label="Opened" value={detailRow.openedAt.replace('T', ' ').slice(0, 19)} />
            <Detail
              label="Closed"
              value={detailRow.closedAt ? detailRow.closedAt.replace('T', ' ').slice(0, 19) : '—'}
            />
            <Detail
              label="Duration"
              value={durationLabel(detailRow.openedAt, detailRow.closedAt)}
            />
            {detailRow.note ? <Detail label="Note" value={detailRow.note} /> : null}
          </dl>
        </Drawer>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#e8f2fa] pb-2">
      <dt className="text-sky-ink/50">{label}</dt>
      <dd className="text-right font-medium text-sky-ink">{value}</dd>
    </div>
  );
}

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-sky-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  tone = 'flat',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
        {label}
      </p>
      <p
        className={`mt-1.5 font-display text-xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
