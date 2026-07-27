'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Eye, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import RequireAdmin from '@/components/auth/RequireAdmin';

type ReportSections = {
  opening?: string[];
  market?: string[];
  calc?: string[];
  tradeBlocks?: string[][];
  deskSummary?: string[];
  suggestions?: string[];
};

type ReportRow = {
  date: string;
  title: string;
  generatedAt: string;
  summary: {
    tradeCount: number;
    wins: number;
    losses: number;
    netAfter70: number;
    winRate?: number;
    gross?: number;
    brokerage?: number;
  };
  simpleStory?: string[];
  sections?: ReportSections;
};

function SectionBlock({ title, lines }: { title: string; lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-bold text-sky-deep">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line, i) => (
          <li key={`${title}-${i}`} className="text-[12px] leading-relaxed text-sky-ink/80">
            · {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NexusDailyReportsInner() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [date, setDate] = useState(() => {
    // Prefer IST calendar date for the date picker default
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  });
  const [viewer, setViewer] = useState<ReportRow | null>(null);

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
    setBusy(`Writing detailed report for ${d}…`);
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
    setBusy('Uploading trades, PDFs, and index to cloud…');
    setError('');
    try {
      const res = await fetch('/api/nexus-pulse/daily-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_db' }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sync?: { ok?: boolean; error?: string };
        cloud?: { errors?: string[] };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.sync?.error || data.cloud?.errors?.[0] || 'Sync failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy('');
    }
  }

  async function openReport(d: string) {
    setBusy('Opening report…');
    setError('');
    try {
      const res = await fetch(`/api/nexus-pulse/daily-report?date=${d}&view=1`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { ok?: boolean; report?: ReportRow; error?: string };
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error || 'Report not found');
      }
      setViewer(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open report');
    } finally {
      setBusy('');
    }
  }

  async function downloadPdf(d: string) {
    setBusy('Preparing PDF…');
    setError('');
    try {
      const res = await fetch(
        `/api/nexus-pulse/daily-report?date=${d}&download=1&attach=1`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'PDF not found — tap Create PDF first, then Sync to cloud');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexusPulse-Day-${d}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Keep blob URL briefly so mobile share sheets can read it
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            NexusPulse · By date
          </p>
          <h1 className="font-display text-2xl font-bold text-sky-deep">Daily Reports</h1>
          <p className="mt-1 text-[13px] text-sky-ink/60">
            Phone-friendly day review: market behaviour, trade detail, full P&amp;L math, desk
            summary, and improvement notes. Tap <strong>View</strong> on mobile (PDF download is
            optional).
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
          className="min-h-[40px] rounded-xl border border-sky-200 px-3 py-1.5 text-[12px]"
        />
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void generate()}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Create report
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void syncDb()}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Sync to cloud
        </button>
      </div>

      {busy && <p className="mt-3 text-[12px] text-sky-ink/55">{busy}</p>}
      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>
      )}

      <section className="mt-6 space-y-3">
        {reports.length === 0 ? (
          <p className="text-[13px] text-sky-ink/50">
            No daily reports yet. Pick a date and tap Create report (after market is best). On
            production, also tap Sync to cloud so your phone can load them.
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
                    {r.summary.tradeCount} trades · W {r.summary.wins} / L {r.summary.losses}
                    {r.summary.winRate != null ? ` (${r.summary.winRate}%)` : ''} · Net ~₹
                    {r.summary.netAfter70.toFixed(0)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void openReport(r.date)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void downloadPdf(r.date)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-bold text-sky-deep disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
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

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 border-b border-sky-100 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                NexusPulse report
              </p>
              <h2 className="text-base font-bold text-sky-deep">{viewer.date}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadPdf(viewer.date)}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[11px] font-semibold"
              >
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setViewer(null)}
                className="rounded-lg bg-sky-deep p-2 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-[12px] text-sky-ink/55">
              {viewer.summary.tradeCount} trades · W {viewer.summary.wins} / L{' '}
              {viewer.summary.losses}
              {viewer.summary.gross != null ? ` · Gross ₹${viewer.summary.gross.toFixed(0)}` : ''}
              {viewer.summary.brokerage != null
                ? ` · Cost ₹${viewer.summary.brokerage.toFixed(0)}`
                : ''}{' '}
              · Net ₹{viewer.summary.netAfter70.toFixed(0)}
            </p>
            <SectionBlock title="1. What happened" lines={viewer.sections?.opening} />
            <SectionBlock title="2. Market behaviour" lines={viewer.sections?.market} />
            <SectionBlock title="3. Overall calculation" lines={viewer.sections?.calc} />
            {viewer.sections?.tradeBlocks?.length ? (
              <div className="mt-4">
                <h3 className="text-[13px] font-bold text-sky-deep">4. Each trade</h3>
                <div className="mt-2 space-y-3">
                  {viewer.sections.tradeBlocks.map((block, i) => (
                    <div
                      key={`tb-${i}`}
                      className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"
                    >
                      {block.map((line, j) => (
                        <p
                          key={`tb-${i}-${j}`}
                          className={`text-[12px] leading-relaxed ${
                            j === 0 ? 'font-bold text-sky-deep' : 'text-sky-ink/75'
                          }`}
                        >
                          {j === 0 ? line : `· ${line}`}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <SectionBlock
              title="5. Our summary (market + trades)"
              lines={viewer.sections?.deskSummary}
            />
            <SectionBlock title="6. Suggestions & improvements" lines={viewer.sections?.suggestions} />
            {!viewer.sections && viewer.simpleStory?.length ? (
              <SectionBlock title="Story" lines={viewer.simpleStory} />
            ) : null}
          </div>
        </div>
      )}
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
