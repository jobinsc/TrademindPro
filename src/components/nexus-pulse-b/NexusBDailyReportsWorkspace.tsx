'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Eye, FileText, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import RequireAdmin from '@/components/auth/RequireAdmin';
import type { NexusLaneId } from '@/lib/nexus-pulse/rules';
import { NEXUS_LANES } from '@/lib/nexus-pulse/rules';

type LaneSelectionMode = 'morning_open_stop_15' | 'current_bans' | 'both';

function activeLanesFromMode(mode: LaneSelectionMode): NexusLaneId[] {
  if (mode === 'both') return ['current_bans', 'morning_open_stop_15'];
  return [mode];
}

type ReportSections = {
  opening?: string[];
  market?: string[];
  calc?: string[];
  tradeBlocks?: string[][];
  deskSummary?: string[];
  suggestions?: string[];
  studyByLane?: string[];
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
  reportSource?: 'real_option_replay' | 'paper_desk';
  premiumModel?: string;
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
  const [laneMode, setLaneMode] = useState<LaneSelectionMode>('morning_open_stop_15');

  const load = useCallback(async () => {
    setError('');
    const res = await fetch('/api/nexus-pulse-b/daily-report', { credentials: 'include' });
    const data = (await res.json()) as { ok?: boolean; reports?: ReportRow[]; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
    setReports(data.reports || []);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  async function generate(forDate?: string) {
    const d = forDate || date;
    setBusy(`Real option replay for ${d} (may take 1–2 min)…`);
    setError('');
    const upstox = getUpstoxAccessToken();
    if (!upstox) {
      setBusy('Creating paper-desk report (connect Upstox for study replay)…');
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (upstox) headers.Authorization = `Bearer ${upstox}`;
      const res = await fetch('/api/nexus-pulse-b/daily-report', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          action: 'generate',
          date: d,
          activeLanes: activeLanesFromMode(laneMode),
        }),
      });
      const text = await res.text();
      if (!text.trim()) {
        throw new Error(`Generate failed (${res.status}) — empty server response`);
      }
      let data: {
        ok?: boolean;
        error?: string;
        meta?: ReportRow & { sections?: ReportSections };
      };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 160)}`);
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Generate failed');
      if (data.meta) {
        setViewer({
          date: data.meta.date,
          title: data.meta.title,
          generatedAt: data.meta.generatedAt,
          summary: data.meta.summary,
          sections: data.meta.sections,
          simpleStory: data.meta.simpleStory,
          reportSource: data.meta.reportSource,
          premiumModel: data.meta.premiumModel,
        });
      }
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
      const res = await fetch('/api/nexus-pulse-b/daily-report', {
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
      const res = await fetch(`/api/nexus-pulse-b/daily-report?date=${d}&view=1`, {
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

  async function removeReport(d: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Remove daily report and PDF for ${d}? This cannot be undone.`)
    ) {
      return;
    }
    setBusy(`Removing ${d}…`);
    setError('');
    try {
      const res = await fetch('/api/nexus-pulse-b/daily-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', date: d }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Remove failed');
      if (viewer?.date === d) setViewer(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy('');
    }
  }

  async function downloadPdf(d: string) {
    setBusy('Preparing PDF…');
    setError('');
    try {
      const res = await fetch(
        `/api/nexus-pulse-b/daily-report?date=${d}&download=1&attach=1`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ||
            'PDF not ready — tap Create report first, or use View for the full text on mobile.'
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexusPulseB-Day-${d}.pdf`;
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
            Phone-friendly day review: market behaviour, trade detail, P&L math, and suggestions.{' '}
            <strong>View</strong> works without PDF. PDF is built on the server (no Python required).
          </p>
        </div>
        <Link
          href="/app/nexus-pulse-b"
          className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-deep"
        >
          Back to NexusPulse
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/40 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-ink/45">Lanes (replay)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ['morning_open_stop_15', NEXUS_LANES.morning_open_stop_15.title],
              ['current_bans', NEXUS_LANES.current_bans.title],
              ['both', 'Both lanes'],
            ] as const
          ).map(([id, label]) => (
            <label
              key={id}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                laneMode === id
                  ? 'border-sky-deep bg-white text-sky-deep'
                  : 'border-sky-100 bg-white/80 text-sky-ink/70'
              }`}
            >
              <input
                type="radio"
                name="dr-lane"
                className="sr-only"
                checked={laneMode === id}
                onChange={() => setLaneMode(id)}
              />
              {label}
            </label>
          ))}
        </div>
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
                    {(r as ReportRow).reportSource === 'real_option_replay' ? (
                      <span className="ml-1 text-violet-700"> · Study replay</span>
                    ) : null}
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
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void removeReport(r.date)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
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
                disabled={Boolean(busy)}
                onClick={() => void removeReport(viewer.date)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
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
              {viewer.reportSource === 'real_option_replay' ? (
                <span className="font-semibold text-violet-800">Real Option Study replay · </span>
              ) : null}
              {viewer.premiumModel ? `${viewer.premiumModel}. ` : ''}
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
            {viewer.sections?.studyByLane?.length ? (
              <SectionBlock title="Study by lane (backtest match)" lines={viewer.sections.studyByLane} />
            ) : null}
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

export default function NexusBDailyReportsWorkspace() {
  return (
    <RequireAdmin>
      <NexusDailyReportsInner />
    </RequireAdmin>
  );
}
