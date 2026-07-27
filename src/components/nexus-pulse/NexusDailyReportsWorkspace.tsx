'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import RequireAdmin from '@/components/auth/RequireAdmin';

type ReportRow = {
  date: string;
  title: string;
  generatedAt: string;
  summary: {
    tradeCount: number;
    wins: number;
    losses: number;
    netAfter70: number;
  };
  simpleStory?: string[];
};

function NexusDailyReportsInner() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setError('');
    const res = await fetch('/api/nexus-pulse/daily-report', { credentials: 'include' });
    const data = (await res.json()) as { ok?: boolean; reports?: ReportRow[]; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
    setReports(data.reports || []);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  async function generate(forDate?: string) {
    const d = forDate || date;
    setBusy(`Writing report for ${d}…`);
    setError('');
    try {
      const res = await fetch('/api/nexus-pulse/daily-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', date: d }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Generate failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setBusy('');
    }
  }

  async function syncDb() {
    setBusy('Syncing index to database…');
    setError('');
    try {
      const res = await fetch('/api/nexus-pulse/daily-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_db' }),
      });
      const data = (await res.json()) as { ok?: boolean; sync?: { ok?: boolean; error?: string } };
      if (!res.ok || !data.ok) throw new Error(data.sync?.error || 'Sync failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            NexusPulse · By date
          </p>
          <h1 className="font-display text-2xl font-bold text-sky-deep">Daily Reports</h1>
          <p className="mt-1 text-[13px] text-sky-ink/60">
            Simple mobile PDF for each day — what happened, wins/losses, each trade in plain words.
            Stored under <code className="text-[11px]">.data/nexus-pulse/reports/daily/</code> and
            synced to database (admin).
          </p>
        </div>
        <Link
          href="/app/nexus-pulse"
          className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-deep"
        >
          Back to NexusPulse
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-sky-200 px-3 py-1.5 text-[12px]"
        />
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void generate()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Create PDF for date
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void syncDb()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Sync to database
        </button>
      </div>

      {busy && <p className="mt-3 text-[12px] text-sky-ink/55">{busy}</p>}
      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>
      )}

      <section className="mt-6 space-y-3">
        {reports.length === 0 ? (
          <p className="text-[13px] text-sky-ink/50">
            No daily reports yet. Pick a date and click Create PDF (after market is best).
          </p>
        ) : (
          reports.map((r) => (
            <article
              key={r.date}
              className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-sky-deep">{r.date}</h2>
                  <p className="text-[11px] text-sky-ink/50">
                    {r.summary.tradeCount} trades · W {r.summary.wins} / L {r.summary.losses} · Net
                    ~₹{r.summary.netAfter70.toFixed(0)} (after ₹70/trade)
                  </p>
                </div>
                <a
                  href={`/api/nexus-pulse/daily-report?date=${r.date}&download=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  Open PDF
                </a>
              </div>
              {r.simpleStory?.[0] && (
                <p className="mt-2 text-[12px] leading-relaxed text-sky-ink/75">{r.simpleStory[0]}</p>
              )}
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void generate(r.date)}
                className="mt-2 text-[11px] font-semibold text-sky-deep underline"
              >
                Regenerate
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export default function NexusDailyReportsWorkspace() {
  return (
    <RequireAdmin>
      <NexusDailyReportsInner />
    </RequireAdmin>
  );
}
