'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Eye,
  Play,
  Radar,
  Search,
} from 'lucide-react';
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
import { formatCurrency, formatPercent } from '@/lib/utils';

const CATEGORIES: { id: 'ALL' | ScanCategory; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'technical', label: 'Technical' },
  { id: 'fundamental', label: 'Fundamental' },
  { id: 'volume', label: 'Volume' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'swing', label: 'Swing' },
];

export default function ScannerWorkspace() {
  const { addSymbol } = useWatchlists();
  const [category, setCategory] = useState<'ALL' | ScanCategory>('ALL');
  const [selectedId, setSelectedId] = useState(SCAN_TEMPLATES[0].id);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRan, setLastRan] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<SavedScan[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    setHistory(readScanHistory());
  }, []);

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

  const selected = SCAN_TEMPLATES.find((t) => t.id === selectedId) || SCAN_TEMPLATES[0];

  function handleRun() {
    setRunning(true);
    setToast('');
    // Small delay so it feels like a scan
    window.setTimeout(() => {
      const rows = runScan(selected.id);
      setResults(rows);
      setLastRan(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
      const hist = pushScanHistory({
        templateId: selected.id,
        templateName: selected.name,
        ranAt: new Date().toISOString(),
        resultCount: rows.length,
      });
      setHistory(hist);
      setRunning(false);
      setAdded({});
    }, 450);
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
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            NSE &amp; BSE Stock Scanner
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Pick a ready-made scan and run it. Results are demo samples until live market data is
            connected.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink disabled:opacity-60"
        >
          {running ? (
            'Scanning…'
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run scan
            </>
          )}
        </button>
      </div>

      {toast && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
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
        {/* Templates */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Radar className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Scan templates
            </h2>
          </div>
          <ul className="space-y-1.5">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                    selectedId === t.id
                      ? 'bg-sky-mist ring-1 ring-sky-mid/30'
                      : 'hover:bg-sky-soft/70'
                  }`}
                >
                  <p className="text-sm font-semibold text-sky-ink">{t.name}</p>
                  <p className="mt-0.5 text-[12px] text-sky-ink/50">{t.description}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-mid">
                    {t.category}
                  </p>
                </button>
              </li>
            ))}
          </ul>

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

        {/* Results */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Results · {selected.name}
              </h2>
              <p className="text-[12px] text-sky-ink/45">
                {results.length === 0
                  ? 'Select a template and click Run scan'
                  : `${filteredResults.length} symbols · last run ${lastRan || '—'}`}
              </p>
            </div>
            {results.length > 0 && (
              <div className="relative w-full max-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-ink/35" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter symbols…"
                  className="w-full rounded-xl border border-[#cfe0ee] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
                />
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-16 text-center">
              <Radar className="mx-auto h-8 w-8 text-sky-mid" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-semibold text-sky-ink">
                Ready to scan
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-sky-ink/55">
                Choose something like Momentum Breakout or RSI Reversal, then run the scan.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8f2fa] text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                    <th className="px-2 py-2">Symbol</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Change</th>
                    <th className="px-2 py-2">Strength</th>
                    <th className="px-2 py-2 text-right">Watch</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((row) => (
                    <tr key={row.symbol} className="border-b border-[#e8f2fa] last:border-0">
                      <td className="px-2 py-3">
                        <p className="font-semibold text-sky-ink">{row.symbol}</p>
                        <p className="text-[11px] text-sky-ink/40">{row.name}</p>
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
            Live NSE/BSE scans need a market data feed (TrueData / broker).{' '}
            <Link href="/app/options-scanner" className="font-semibold text-sky-deep hover:underline">
              Options Scanner
              <ArrowRight className="ml-0.5 inline h-3 w-3" />
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
