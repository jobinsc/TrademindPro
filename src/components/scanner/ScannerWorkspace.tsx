'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Eye,
  Play,
  Radar,
  RotateCcw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { SymbolChartLink } from '@/components/chart/SymbolChartLink';
import { useWatchlists } from '@/hooks/useWatchlists';
import {
  SCAN_TEMPLATES,
  pushScanHistory,
  readScanHistory,
  runScan,
  type ScanCategory,
  type ScanResult,
  type SavedScan,
} from '@/lib/scanner';
import {
  defaultSettingsFor,
  filterFieldsForTemplate,
  indicatorFieldsForTemplate,
  readScanSettings,
  settingsSummary,
  writeScanSettings,
  type ScanSettings,
} from '@/lib/scan-settings';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';

const CATEGORIES: { id: 'ALL' | ScanCategory; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'indicators', label: 'Indicators' },
  { id: 'swing', label: 'Swing' },
  { id: 'positional', label: 'Positional' },
  { id: 'technical', label: 'Technical' },
  { id: 'volume', label: 'Volume' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'fundamental', label: 'Fundamental' },
];

type ExchangeOpt = 'NSE' | 'BSE';

export default function ScannerWorkspace() {
  const { addSymbol } = useWatchlists();
  const [category, setCategory] = useState<'ALL' | ScanCategory>('ALL');
  const [selectedId, setSelectedId] = useState(SCAN_TEMPLATES[0].id);
  const [exchange, setExchange] = useState<ExchangeOpt>('NSE');
  const [settings, setSettings] = useState<ScanSettings>(() =>
    defaultSettingsFor(SCAN_TEMPLATES[0].id)
  );
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRan, setLastRan] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<SavedScan[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [live, setLive] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [matched, setMatched] = useState(0);
  const [universe, setUniverse] = useState(0);
  const [universeStats, setUniverseStats] = useState<{ nse: number; bse: number } | null>(null);
  const [source, setSource] = useState<'upstox' | 'demo' | null>(null);
  const [modalDraft, setModalDraft] = useState<ScanSettings | null>(null);

  useEffect(() => {
    setHistory(readScanHistory());
    setLive(Boolean(getUpstoxAccessToken()));
    fetch('/api/market/instruments?limit=1')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUniverseStats({ nse: d.nseCount || 0, bse: d.bseCount || 0 });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSettings(readScanSettings(selectedId));
  }, [selectedId]);

  const templates = useMemo(() => {
    if (category === 'ALL') return SCAN_TEMPLATES;
    return SCAN_TEMPLATES.filter((t) => t.category === category);
  }, [category]);

  const filteredResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return results;
    return results.filter(
      (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q)
    );
  }, [results, query]);

  const strengthRank = { Strong: 3, Moderate: 2, Weak: 1 } as const;
  const { sorted: displayResults, sort, toggle } = useSortable(
    filteredResults,
    (row, key) => {
      switch (key) {
        case 'symbol':
          return row.symbol;
        case 'price':
          return row.price;
        case 'changePct':
          return row.changePct;
        case 'strength':
          return strengthRank[row.strength];
        default:
          return '';
      }
    },
    { key: 'changePct', dir: 'desc' }
  );

  const selected = SCAN_TEMPLATES.find((t) => t.id === selectedId) || SCAN_TEMPLATES[0];
  const settingsTemplate =
    SCAN_TEMPLATES.find((t) => t.id === settingsOpenFor) || selected;

  useEffect(() => {
    if (settingsOpenFor) {
      setModalDraft(
        settingsOpenFor === selectedId
          ? settings
          : readScanSettings(settingsOpenFor)
      );
    } else {
      setModalDraft(null);
    }
  }, [settingsOpenFor, selectedId, settings]);

  function updateSetting<K extends keyof ScanSettings>(key: K, value: number) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      writeScanSettings(selectedId, next);
      return next;
    });
  }

  function resetInlineSettings() {
    const next = defaultSettingsFor(selectedId);
    writeScanSettings(selectedId, next);
    setSettings(next);
    setToast('Indicator periods reset to defaults');
    window.setTimeout(() => setToast(''), 2000);
  }

  function openSettings(templateId: string, e?: React.MouseEvent<HTMLButtonElement>) {
    e?.stopPropagation();
    setSelectedId(templateId);
    setSettingsOpenFor(templateId);
  }

  function updateModalSetting<K extends keyof ScanSettings>(key: K, value: number) {
    setModalDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  }

  function saveModalSettings() {
    if (!settingsOpenFor || !modalDraft) return;
    writeScanSettings(settingsOpenFor, modalDraft);
    if (settingsOpenFor === selectedId) setSettings(modalDraft);
    setToast(`Saved settings · ${settingsTemplate.name}`);
    setSettingsOpenFor(null);
    window.setTimeout(() => setToast(''), 2000);
  }

  function resetModalSettings() {
    if (!settingsOpenFor) return;
    const next = defaultSettingsFor(settingsOpenFor);
    setModalDraft(next);
  }

  async function handleRun() {
    setRunning(true);
    setToast('');
    const token = getUpstoxAccessToken();
    setLive(Boolean(token));
    writeScanSettings(selectedId, settings);

    try {
      if (token) {
        setToast(`Scanning all ${exchange} equities… this can take up to ~1 minute`);
        const res = await fetch('/api/market/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            templateId: selected.id,
            exchange,
            settings,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Live scan failed');
        }
        setResults(data.results as ScanResult[]);
        setScanned(Number(data.scanned || 0));
        setMatched(Number(data.matched || 0));
        setUniverse(Number(data.universe || 0));
        setSource('upstox');
        setLastRan(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        const hist = pushScanHistory({
          templateId: selected.id,
          templateName: `${selected.name} · ${exchange}`,
          ranAt: new Date().toISOString(),
          resultCount: data.results.length,
        });
        setHistory(hist);
        setAdded({});
        setToast(
          `Live ${exchange} · ${data.scanned}/${data.universe} quotes · ${data.matched} matched`
        );
        window.setTimeout(() => setToast(''), 4000);
      } else {
        const rows = runScan(selected.id);
        setResults(rows);
        setScanned(0);
        setMatched(rows.length);
        setUniverse(0);
        setSource('demo');
        setLastRan(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        const hist = pushScanHistory({
          templateId: selected.id,
          templateName: selected.name,
          ranAt: new Date().toISOString(),
          resultCount: rows.length,
        });
        setHistory(hist);
        setAdded({});
        setToast('Demo mode — connect Upstox for full exchange scans');
        window.setTimeout(() => setToast(''), 3500);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      setToast(message);
      const rows = runScan(selected.id);
      setResults(rows);
      setSource('demo');
      setLastRan(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRunning(false);
    }
  }

  function handleAddWatch(row: ScanResult) {
    const result = addSymbol({
      symbol: row.symbol,
      exchange: row.exchange,
      name: row.name,
      notes: `From scanner: ${row.signal}`,
    });
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setAdded((prev) => ({ ...prev, [row.symbol]: true }));
    setToast(`${row.symbol} added to watchlist`);
    window.setTimeout(() => setToast(''), 2000);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 3 · Scanner
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              NSE &amp; BSE Stock Scanner
            </h1>
            <InfoBubble title="About Scanner">
              Select a strategy (e.g. EMA Crossover), then change{' '}
              <strong className="font-semibold text-sky-ink/75">Fast MA / Slow MA</strong> (or RSI,
              MACD…) to any number — same idea as TradingView inputs.
            </InfoBubble>
          </div>
          {universeStats && (
            <p className="mt-2 text-[12px] font-medium text-sky-deep">
              Universe: {universeStats.nse.toLocaleString('en-IN')} NSE ·{' '}
              {universeStats.bse.toLocaleString('en-IN')} BSE equities
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
              live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {live ? 'Live · Upstox' : 'Demo'}
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink disabled:opacity-60"
          >
            {running ? (
              `Scanning ${exchange}…`
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run {exchange} scan
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
          Exchange
        </span>
        {(['NSE', 'BSE'] as ExchangeOpt[]).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setExchange(ex)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
              exchange === ex
                ? 'bg-sky-deep text-white'
                : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee] hover:text-sky-ink'
            }`}
          >
            {ex}
            {universeStats && (
              <span className="ml-1.5 font-medium opacity-80">
                ({ex === 'NSE' ? universeStats.nse : universeStats.bse})
              </span>
            )}
          </button>
        ))}
      </div>

      {toast && (
        <div
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${
            toast.toLowerCase().includes('fail') || toast.toLowerCase().includes('error')
              ? 'border border-rose-200 bg-rose-50 text-rose-700'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {toast}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              category === c.id
                ? 'bg-sky-deep text-white'
                : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee] hover:text-sky-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Strategies & indicators
              </h2>
            </div>
            <span className="text-[11px] text-sky-ink/40">{templates.length}</span>
          </div>
          <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
            {templates.map((t) => {
              const saved = t.id === selectedId ? settings : readScanSettings(t.id);
              const summary = settingsSummary(t.id, saved);
              return (
              <li key={t.id}>
                <div
                  className={`flex items-start gap-1 rounded-xl transition ${
                    selectedId === t.id
                      ? 'bg-sky-mist ring-1 ring-sky-mid/30'
                      : 'hover:bg-sky-soft/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  >
                    <p className="text-sm font-semibold text-sky-ink">{t.name}</p>
                    <p className="mt-0.5 text-[12px] text-sky-ink/50">{t.description}</p>
                    {summary && (
                      <p className="mt-1 text-[11px] font-semibold text-sky-deep">{summary}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-mid">
                        {t.category}
                      </span>
                      {t.indicators?.map((ind) => (
                        <span
                          key={ind}
                          className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-ink/55 ring-1 ring-[#cfe0ee]"
                        >
                          {ind}
                        </span>
                      ))}
                    </div>
                  </button>
                  <button
                    type="button"
                    title={`Change periods · ${t.name}`}
                    aria-label={`Settings for ${t.name}`}
                    onClick={(e) => openSettings(t.id, e)}
                    className="mr-2 mt-2 shrink-0 rounded-lg bg-white p-2 text-sky-deep shadow-sm ring-1 ring-[#cfe0ee] transition hover:bg-sky-soft"
                  >
                    <Settings2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
              );
            })}
          </ul>

          {/* Always-visible period editor for selected strategy */}
          <div className="mt-4 rounded-xl border border-sky-mid/25 bg-sky-soft/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  Indicator settings
                </p>
                <p className="mt-0.5 text-sm font-semibold text-sky-ink">{selected.name}</p>
              </div>
              <button
                type="button"
                onClick={resetInlineSettings}
                className="rounded-lg p-1.5 text-sky-ink/45 hover:bg-white hover:text-sky-ink"
                title="Reset periods"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-sky-ink/50">
              Change MA / RSI / MACD numbers here (like TradingView inputs).
            </p>
            {indicatorFieldsForTemplate(selectedId).length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {indicatorFieldsForTemplate(selectedId).map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-sky-ink/55">
                      {field.label}
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={field.step}
                      value={settings[field.key]}
                      onChange={(e) => updateSetting(field.key, Number(e.target.value))}
                      className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-sky-ink/50">
                This template has no MA/RSI-style period — use filters below if needed.
              </p>
            )}
            <button
              type="button"
              onClick={() => openSettings(selectedId)}
              className="mt-3 w-full rounded-xl border border-[#cfe0ee] bg-white py-2 text-xs font-semibold text-sky-deep hover:bg-sky-mist"
            >
              More filters (volume, change %, results…)
            </button>
          </div>

          {history.length > 0 && (
            <div className="mt-5 border-t border-[#e8f2fa] pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
                Recent runs
              </p>
              <ul className="mt-2 space-y-1.5">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between text-[12px] text-sky-ink/60">
                    <span className="font-medium text-sky-ink/80">{h.templateName}</span>
                    <span>
                      {h.resultCount} · {h.ranAt.slice(11, 16)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Results · {selected.name} · {exchange}
              </h2>
              <p className="text-[12px] text-sky-ink/45">
                {results.length === 0
                  ? 'Pick a strategy, tap settings gear to tune, then Run scan'
                  : `${filteredResults.length} shown · click column headers to sort · last run ${lastRan || '—'}${
                      scanned > 0 ? ` · scanned ${scanned}/${universe} · matched ${matched}` : ''
                    }`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openSettings(selectedId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-3 py-2 text-xs font-semibold text-sky-ink/70 hover:bg-sky-soft"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Settings
              </button>
              {results.length > 0 && (
                <div className="relative w-full max-w-[200px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-ink/35" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter…"
                    className="w-full rounded-xl border border-[#cfe0ee] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
                  />
                </div>
              )}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-16 text-center">
              <Radar className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
                Ready to scan {exchange}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-sky-ink/55">
                Use the gear on RSI, EMA, MACD, Bollinger, Supertrend, VWAP, and more — same idea as
                TradingView strategy inputs.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8f2fa]">
                    <SortableTh
                      label="Symbol"
                      className="px-2 py-2"
                      active={sort.key === 'symbol'}
                      dir={sort.dir}
                      onClick={() => toggle('symbol')}
                    />
                    <SortableTh
                      label="Price"
                      className="px-2 py-2"
                      active={sort.key === 'price'}
                      dir={sort.dir}
                      onClick={() => toggle('price')}
                    />
                    <SortableTh
                      label="Change"
                      className="px-2 py-2"
                      active={sort.key === 'changePct'}
                      dir={sort.dir}
                      onClick={() => toggle('changePct')}
                    />
                    <SortableTh
                      label="Strength"
                      className="px-2 py-2"
                      active={sort.key === 'strength'}
                      dir={sort.dir}
                      onClick={() => toggle('strength')}
                    />
                    <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                      Watch
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((row) => (
                    <tr
                      key={`${row.exchange}-${row.symbol}`}
                      className="border-b border-[#e8f2fa] last:border-0"
                    >
                      <td className="px-2 py-3">
                        <SymbolChartLink
                          symbol={row.symbol}
                          exchange={row.exchange}
                          name={row.name}
                          className="font-semibold"
                        >
                          {row.symbol}
                        </SymbolChartLink>
                        <p className="text-[11px] text-sky-ink/40">
                          {row.exchange} · {row.name}
                        </p>
                      </td>
                      <td className="px-2 py-3 tabular-nums text-sky-ink/75">
                        {formatCurrency(row.price)}
                      </td>
                      <td
                        className={`px-2 py-3 font-semibold tabular-nums ${
                          row.changePct >= 0 ? 'text-emerald-600' : 'text-rose-500'
                        }`}
                      >
                        {formatPercent(row.changePct)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            row.strength === 'Strong'
                              ? 'bg-emerald-50 text-emerald-700'
                              : row.strength === 'Moderate'
                                ? 'bg-sky-mist text-sky-deep'
                                : 'bg-sky-soft text-sky-ink/55'
                          }`}
                        >
                          {row.strength}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          disabled={added[row.symbol]}
                          onClick={() => handleAddWatch(row)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                            added[row.symbol]
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-sky-soft text-sky-deep hover:bg-sky-mist'
                          }`}
                        >
                          {added[row.symbol] ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Added
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Add
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-[12px] text-sky-ink/45">
            Live scans use Upstox quotes on the full {exchange} list. Candle-true RSI/MACD comes
            next with history bars.{' '}
            <Link href="/app/terminal" className="font-semibold text-sky-deep hover:underline">
              Broker Terminal
              <ArrowRight className="ml-0.5 inline h-3 w-3" />
            </Link>
          </p>
        </section>
      </div>

      {/* Per-strategy settings modal */}
      {settingsOpenFor && modalDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-sky-ink/30 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => setSettingsOpenFor(null)}
            aria-hidden
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#cfe0ee] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  Strategy settings
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-sky-ink">
                  {settingsTemplate.name}
                </h3>
                <p className="mt-1 text-[12px] text-sky-ink/50">
                  {settingsTemplate.indicators?.join(' · ') || settingsTemplate.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpenFor(null)}
                className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {indicatorFieldsForTemplate(settingsOpenFor).length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-deep">
                    Indicator periods (change any number)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {indicatorFieldsForTemplate(settingsOpenFor).map((field) => (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                          {field.label}
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={field.step}
                          value={modalDraft[field.key]}
                          onChange={(e) => updateModalSetting(field.key, Number(e.target.value))}
                          className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm font-semibold text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
                        />
                        <span className="mt-0.5 block text-[10px] text-sky-ink/40">{field.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-ink/40">
                  Scan filters
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filterFieldsForTemplate(settingsOpenFor).map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                        {field.label}
                      </span>
                      <input
                        type="number"
                        step={field.step}
                        value={modalDraft[field.key]}
                        onChange={(e) => updateModalSetting(field.key, Number(e.target.value))}
                        className="w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30"
                      />
                      <span className="mt-0.5 block text-[10px] text-sky-ink/40">{field.hint}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveModalSettings}
                className="rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
              >
                Save settings
              </button>
              <button
                type="button"
                onClick={resetModalSettings}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpenFor(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-sky-ink/50 hover:text-sky-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
