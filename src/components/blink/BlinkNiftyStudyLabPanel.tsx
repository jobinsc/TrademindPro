'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Brain,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';
import {
  priorValidationYearRange,
  yearBeforeJuneStudyRange,
} from '@/lib/upstox-historical';
import type { SessionStudy, StudyLabReport } from '@/lib/blink-nifty-study-lab';

export function BlinkNiftyStudyLabPanel() {
  const yearBefore = useMemo(() => yearBeforeJuneStudyRange(), []);
  const validationYear = useMemo(() => priorValidationYearRange(), []);
  const [fromDate, setFromDate] = useState(yearBefore.fromDate);
  const [toDate, setToDate] = useState(yearBefore.toDate);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<StudyLabReport | null>(null);
  const [daysStored, setDaysStored] = useState(0);
  const [opsMeta, setOpsMeta] = useState<{
    total: number;
    days2plus: number;
    avg: number;
  } | null>(null);
  const [meta, setMeta] = useState<{ bars: number; chunks: number; source: string } | null>(
    null
  );
  const [dayIdx, setDayIdx] = useState(0);

  const session: SessionStudy | null = report?.sessions[dayIdx] ?? null;

  useEffect(() => {
    void loadMemory();
  }, []);

  async function loadMemory() {
    try {
      const res = await fetch('/api/blink/study-lab');
      const data = (await res.json()) as {
        ok?: boolean;
        report?: StudyLabReport | null;
        dayCount?: number;
        memory?: { summary?: StudyLabReport['summary'] };
      };
      if (data.ok && data.report?.sessions?.length) {
        setReport(data.report);
        setDaysStored(data.dayCount || data.report.sessions.length);
        setOpsMeta({
          total: data.report.summary.totalOpportunities ?? 0,
          days2plus: data.report.summary.daysWith2PlusOps ?? 0,
          avg: data.report.summary.avgOpsPerDay ?? 0,
        });
        setMeta({
          bars: data.report.totalBars,
          chunks: 0,
          source: 'agent memory',
        });
        setDayIdx(0);
      }
    } catch {
      /* empty memory is fine */
    }
  }

  async function collectAndStudy(opts: {
    preset?: 'year_before_june' | 'june_july';
    from?: string;
    to?: string;
    reanalyse?: boolean;
    grade?: boolean;
    validation?: boolean;
  }) {
    setError('');
    setLoading(true);
    setProgress(
      opts.validation
        ? 'Out-of-sample validation — grading the untouched prior year (1–3 min)…'
        : opts.grade
        ? 'Grading all opportunities — forward walk target vs stop (1–3 min)…'
        : opts.reanalyse
          ? 'Re-analysing with pro playbooks — hunting 2–3 opportunities per day (1–3 min)…'
          : 'Connecting to Upstox…'
    );
    try {
      if (!isUpstoxConnected()) {
        throw new Error('Connect Upstox first — Settings / broker login.');
      }
      const token = getUpstoxAccessToken();
      if (!token) {
        throw new Error('Upstox token missing or expired — reconnect Upstox.');
      }

      if (opts.validation) {
        setProgress(
          `Validating untouched Nifty 3m (${validationYear.fromDate} → ${validationYear.toDate}) — memory will not be overwritten…`
        );
      } else if (opts.preset === 'year_before_june' || opts.reanalyse || opts.grade) {
        setProgress(
          `Pulling Nifty 3m (${yearBefore.fromDate} → ${yearBefore.toDate}), hunting slots, grading WIN/LOSS…`
        );
      }

      const res = await fetch('/api/blink/study-lab', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preset: opts.reanalyse || opts.grade ? 'year_before_june' : opts.preset,
          fromDate: opts.from,
          toDate: opts.to,
          persist: !opts.validation,
          reanalyse: opts.reanalyse === true || opts.grade === true,
          grade: opts.grade === true,
          validation: opts.validation === true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        bars?: number;
        chunks?: number;
        source?: string;
        report?: StudyLabReport;
        daysStored?: number;
        totalOpportunities?: number;
        daysWith2PlusOps?: number;
        gradeSummary?: StudyLabReport['gradeSummary'];
      };
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error || 'Failed to load Upstox study data');
      }
      setReport(data.report);
      setDaysStored(data.daysStored || data.report.sessions.length);
      setOpsMeta({
        total:
          data.totalOpportunities ??
          data.report.summary.totalOpportunities ??
          0,
        days2plus:
          data.daysWith2PlusOps ?? data.report.summary.daysWith2PlusOps ?? 0,
        avg: data.report.summary.avgOpsPerDay ?? 0,
      });
      setMeta({
        bars: data.bars || data.report.totalBars,
        chunks: data.chunks || 0,
        source: data.source || data.report.source,
      });
      setFromDate(data.report.fromDate);
      setToDate(data.report.toDate);
      setDayIdx(0);
      const g = data.gradeSummary || data.report.gradeSummary;
      setProgress(
        g
          ? `Graded ${g.graded}: ${g.wins}W / ${g.losses}L / ${g.flats}F · WR ${g.winRate}% · avg R ${g.avgR} · expectancy ${g.expectancyR}R`
          : `Memory updated: ${data.daysStored} days · ${data.totalOpportunities ?? data.report.summary.totalOpportunities} opportunities.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Study Lab failed';
      setError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? 'Failed to fetch — is the TradePinax Dev window still open? Run npm run dev:window and retry.'
          : msg
      );
      setProgress('');
    } finally {
      setLoading(false);
    }
  }

  const scenarioTone =
    session?.scenario === 'UP'
      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
      : session?.scenario === 'DOWN'
        ? 'border-rose-200 bg-rose-50/90 text-rose-950'
        : 'border-amber-200 bg-amber-50/90 text-amber-950';

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            How you study with Blink
          </p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-[16px] font-semibold text-sky-ink">
            <GraduationCap className="h-5 w-5 text-sky-mid" />
            Nifty Study Lab · Agent memory
          </h3>
        </div>
        <Brain className="h-5 w-5 text-sky-mid" />
      </div>

      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-[12px] text-emerald-950">
        <p className="font-semibold">Cross-year edge locked · paper only</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
          <li>Active: RANGE_REJECT_HIGH_PE · upper-edge bearish rejection</li>
          <li>2025–26: 57 trades · +0.23R avg</li>
          <li>2024–25 validation: 44 trades · +0.21R avg</li>
          <li>Combined: 101 trades · weighted +0.22R</li>
          <li>Objective: +10–13 option pts net (about 24–30 Nifty pts at ATM Δ≈0.50)</li>
          <li>No trigger = no entry; never force a daily trade</li>
        </ul>
      </div>

      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-[12px] text-sky-950">
        <p className="font-semibold">Intraday only (no overnight)</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
          <li>All trades square off same session — never carry CE/PE overnight</li>
          <li>No new entries after ~14:30 · force flat by ~15:15</li>
          <li>Close-phase tickets are blocked; grades exit before the close bell</li>
        </ul>
      </div>

      <div className="mt-3 rounded-xl border border-[#eef3f8] bg-sky-soft/40 px-4 py-3 text-[12px] leading-relaxed text-sky-ink/70">
        <p className="font-semibold text-sky-ink">Trader mindset (agent)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Analyse each day’s 3m chart.</li>
          <li>
            Find <strong>0–2 quality opportunities</strong> — never force a daily quota.
          </li>
          <li>
            Each slot has entry, stop, target → execute → <strong>exit same day</strong> → bank.
          </li>
          <li>SIDEWAYS = range tools at OR/S/R only — not mid-range gambles.</li>
          <li>Never overnight — last hour is exit/manage only.</li>
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => void collectAndStudy({ grade: true })}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          Grade the opportunities (WIN/LOSS)
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void collectAndStudy({ validation: true })}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BookOpenCheck className="h-4 w-4" />
          )}
          Validate prior year (out-of-sample)
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void collectAndStudy({ reanalyse: true })}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          Re-analyse memory with pro playbooks
        </button>
        <label className="text-[12px] text-sky-ink/70">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 block rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink"
          />
        </label>
        <label className="text-[12px] text-sky-ink/70">
          To
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 block rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink"
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void collectAndStudy({ from: fromDate, to: toDate })}
          className="inline-flex items-center gap-2 rounded-xl border border-[#cfe0ee] bg-white px-4 py-2.5 text-sm font-semibold text-sky-ink hover:border-sky-mid disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Collect custom range
        </button>
      </div>

      <p className="mt-2 text-[11px] text-sky-ink/45">
        Year window: <strong>{yearBefore.label}</strong>. Upstox allows ~1 month of 3m bars per
        request — a full year is many chunks (wait patiently).
      </p>

      {progress && (
        <p className="mt-3 text-[12px] font-medium text-sky-mid">{progress}</p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          {error}
        </p>
      )}

      {report && meta && (
        <div className="mt-5 space-y-4">
          {report.gradeSummary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-[12px] text-emerald-950">
              <p className="font-semibold">
                Opportunity grades · {report.gradeSummary.graded} tested
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                <span>Wins: {report.gradeSummary.wins}</span>
                <span>Losses: {report.gradeSummary.losses}</span>
                <span>Flat/EOD: {report.gradeSummary.flats}</span>
                <span>Win rate: {report.gradeSummary.winRate}%</span>
                <span>Avg R: {report.gradeSummary.avgR}</span>
                <span>Expectancy: {report.gradeSummary.expectancyR}R</span>
                <span>
                  Spot PnL: {report.gradeSummary.totalPnlPts >= 0 ? '+' : ''}
                  {report.gradeSummary.totalPnlPts} pts
                </span>
              </div>
              {report.gradeSummary.lessons.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-emerald-900/80">
                  {report.gradeSummary.lessons.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-xl border border-[#eef3f8] bg-sky-soft/30 px-4 py-3 text-[12px] text-sky-ink/70">
            <strong className="text-sky-ink">Agent memory:</strong> {daysStored} days stored ·{' '}
            {meta.bars.toLocaleString()} bars seen · source {meta.source}
            {meta.chunks > 0 ? ` · ${meta.chunks} Upstox chunk(s)` : ''}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <span>UP: {report.summary.upDays}</span>
              <span>DOWN: {report.summary.downDays}</span>
              <span>RANGE: {report.summary.sidewaysDays}</span>
              <span>Days with trades: {report.summary.tradeableDays}</span>
              <span>Quiet days: {report.summary.flatDays}</span>
              <span>
                Opportunities:{' '}
                {opsMeta?.total ?? report.summary.totalOpportunities ?? 0}
              </span>
              <span>
                Days with 2+ ops:{' '}
                {opsMeta?.days2plus ?? report.summary.daysWith2PlusOps ?? 0}
              </span>
              <span>
                Avg ops/day: {opsMeta?.avg ?? report.summary.avgOpsPerDay ?? 0}
              </span>
            </div>
          </div>

          {session && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-sky-ink">
                  Study day {dayIdx + 1} / {report.sessions.length} · {session.date}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={dayIdx <= 0}
                    onClick={() => setDayIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#cfe0ee] px-2.5 py-1.5 text-[11px] font-semibold text-sky-ink disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev day
                  </button>
                  <button
                    type="button"
                    disabled={dayIdx >= report.sessions.length - 1}
                    onClick={() =>
                      setDayIdx((i) => Math.min(report.sessions.length - 1, i + 1))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#cfe0ee] px-2.5 py-1.5 text-[11px] font-semibold text-sky-ink disabled:opacity-40"
                  >
                    Next day <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className={`rounded-xl border px-4 py-3 ${scenarioTone}`}>
                <p className="text-[13px] font-semibold">
                  {session.scenario} · {session.changePct >= 0 ? '+' : ''}
                  {session.changePct.toFixed(2)}% · O {session.open.toFixed(1)} H{' '}
                  {session.high.toFixed(1)} L {session.low.toFixed(1)} C {session.close.toFixed(1)}
                </p>
                <p className="mt-1 text-[12px] opacity-90">{session.scenarioPlain}</p>
              </div>

              {'deepStudy' in session && session.deepStudy && (
                <div className="space-y-3 rounded-xl border border-[#cfe0ee] bg-white px-4 py-3">
                  <p className="text-[12px] font-semibold text-sky-ink">
                    Deep chart map (PA · S/R · phases)
                  </p>
                  <p className="text-[11px] leading-relaxed text-sky-ink/70">
                    {session.deepStudy.traderBrief}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-sky-soft/40 px-3 py-2 text-[11px] text-sky-ink/75">
                      <p className="font-semibold text-sky-ink">Supports</p>
                      {session.deepStudy.supports.length ? (
                        session.deepStudy.supports.map((s) => (
                          <p key={`s-${s.price}`}>
                            {s.price} · {s.strength} · {s.note}
                          </p>
                        ))
                      ) : (
                        <p>None clustered</p>
                      )}
                    </div>
                    <div className="rounded-lg bg-sky-soft/40 px-3 py-2 text-[11px] text-sky-ink/75">
                      <p className="font-semibold text-sky-ink">Resistances</p>
                      {session.deepStudy.resistances.length ? (
                        session.deepStudy.resistances.map((r) => (
                          <p key={`r-${r.price}`}>
                            {r.price} · {r.strength} · {r.note}
                          </p>
                        ))
                      ) : (
                        <p>None clustered</p>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-sky-ink/65">
                    <p>
                      <strong>Swings:</strong> {session.deepStudy.swingSequence}
                    </p>
                    <p className="mt-1">
                      <strong>OR:</strong> {session.deepStudy.openingRange.low}–
                      {session.deepStudy.openingRange.high} ·{' '}
                      <strong>Day:</strong> {session.deepStudy.dayRange.low}–
                      {session.deepStudy.dayRange.high} (
                      {session.deepStudy.dayRange.widthPts} pts)
                    </p>
                    <p className="mt-1">
                      <strong>Close:</strong> {session.deepStudy.closeContext.vsOpen} ·{' '}
                      {session.deepStudy.closeContext.inPremiumOrDiscount} ·{' '}
                      {session.deepStudy.closeContext.vsNearestSupport} ·{' '}
                      {session.deepStudy.closeContext.vsNearestResistance}
                    </p>
                    {session.deepStudy.reactions.length > 0 && (
                      <p className="mt-1">
                        <strong>Reactions:</strong>{' '}
                        {session.deepStudy.reactions.join('; ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {'behaviorSummary' in session && session.behaviorSummary && (
                <div className="rounded-xl border border-[#cfe0ee] bg-white px-4 py-3">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-sky-ink">
                    <BookOpenCheck className="h-4 w-4" /> How this day behaved (memory note)
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-sky-ink/70">
                    {session.behaviorSummary}
                  </p>
                </div>
              )}

              <ol className="space-y-2">
                {session.steps.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-[#eef3f8] bg-sky-soft/20 px-3 py-2.5"
                  >
                    <p className="text-[12px] font-semibold text-sky-ink">{s.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-sky-ink/60">{s.detail}</p>
                  </li>
                ))}
              </ol>

              {session.opportunities && session.opportunities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[12px] font-semibold text-sky-ink">
                    Trade slots ({session.opportunities.length}/3)
                  </p>
                  {session.opportunities.map((o) => {
                    const g = 'grade' in o ? (o as { grade?: string; rMultiple?: number; pnlPts?: number }) : null;
                    return (
                    <div
                      key={`${o.slot}-${o.setup}-${o.atBar}`}
                      className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5"
                    >
                      <p className="text-[12px] font-semibold text-sky-ink">
                        #{o.slot} · {o.sessionPhase} · {o.bias}
                        {o.strike != null ? ` ~${o.strike}` : ''} · {o.setup} · {o.confidence}%
                        {g?.grade ? (
                          <span
                            className={
                              g.grade === 'WIN'
                                ? ' ml-2 text-emerald-700'
                                : g.grade === 'LOSS'
                                  ? ' ml-2 text-rose-700'
                                  : ' ml-2 text-amber-700'
                            }
                          >
                            {g.grade}
                            {g.rMultiple != null ? ` ${g.rMultiple}R` : ''}
                            {g.pnlPts != null
                              ? ` (${g.pnlPts >= 0 ? '+' : ''}${g.pnlPts} pts)`
                              : ''}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sky-ink/65">{o.reason}</p>
                      <p className="mt-1 text-[11px] text-sky-ink/50">
                        Enter: {o.entryZone} · Stop: {o.invalidation} · Target: {o.targetHint}
                      </p>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-xl border border-[#cfe0ee] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold text-sky-ink">
                  Best slot · {session.options.bias}
                  {session.options.strike != null ? ` ~${session.options.strike}` : ''}
                </p>
                <p className="mt-1 text-[12px] text-sky-ink/70">{session.options.howToTrade}</p>
                <p className="mt-1 text-[11px] text-sky-ink/50">
                  Invalidation: {session.options.invalidation} · Confidence{' '}
                  {session.options.confidence}%
                </p>
              </div>

              <p className="rounded-xl border border-dashed border-[#cfe0ee] bg-sky-soft/40 px-3 py-2 text-[11px] text-sky-ink/70">
                <strong>Learning note:</strong> {session.learningNote}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
