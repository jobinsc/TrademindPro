'use client';

import { useMemo } from 'react';
import { BookOpen, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useBlink } from '@/hooks/useBlink';
import {
  analyzeNiftyPaProfile,
  PA_LESSON_OPTIONS,
  type PaLessonFocus,
} from '@/lib/blink-nifty-pa-profile';

export function BlinkNiftyPaProfilePanel() {
  const { settings, updateSettings, candles, spot, signal } = useBlink();

  const active = settings.strategyMode === 'nifty_pa_3m';

  const profile = useMemo(() => {
    if (!active || candles.length < 20) return null;
    return analyzeNiftyPaProfile(
      candles,
      settings,
      spot || undefined,
      signal?.premium ?? null
    );
  }, [active, candles, settings, spot, signal?.premium]);

  if (!active) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-[#cfe0ee] bg-sky-soft/30 p-5">
        <h3 className="font-display text-[15px] font-semibold text-sky-ink">
          Nifty Price Action Profile
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-sky-ink/65">
          Dedicated agent for <strong>Nifty index · 3m chart · full price action</strong>. Studies
          the only three market scenarios — UP, DOWN, SIDEWAYS — one by one, then trades CE / PE /
          FLAT.
        </p>
        <button
          type="button"
          onClick={() =>
            updateSettings({
              strategyMode: 'nifty_pa_3m',
              strategyMode2: 'none',
              symbol: 'NIFTY',
              exchange: 'NSE',
              chartTimeframe: '3m',
              lotSize: 65,
              brokeragePerLot: 175,
              paLessonFocus: 'all',
              paLeftBars: 5,
              paRightBars: 5,
            })
          }
          className="mt-4 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
        >
          Activate Nifty PA Profile (3m)
        </button>
      </section>
    );
  }

  const scenarioIcon =
    profile?.scenario === 'UP' ? (
      <TrendingUp className="h-5 w-5 text-emerald-600" />
    ) : profile?.scenario === 'DOWN' ? (
      <TrendingDown className="h-5 w-5 text-rose-600" />
    ) : (
      <Minus className="h-5 w-5 text-amber-600" />
    );

  const scenarioTone =
    profile?.scenario === 'UP'
      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
      : profile?.scenario === 'DOWN'
        ? 'border-rose-200 bg-rose-50/90 text-rose-950'
        : 'border-amber-200 bg-amber-50/90 text-amber-950';

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Active profile
          </p>
          <h3 className="mt-1 font-display text-[16px] font-semibold text-sky-ink">
            Nifty Index · 3m Price Action
          </h3>
          <p className="mt-1 max-w-xl text-[12px] text-sky-ink/55">
            Chart locked to Nifty 3m. Agent reads structure step by step, then chooses CE, PE, or
            FLAT.
          </p>
        </div>
        <BookOpen className="h-5 w-5 text-sky-mid" />
      </div>

      <div className="mt-4">
        <p className="text-[12px] font-semibold text-sky-ink/70">Train one scenario at a time</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PA_LESSON_OPTIONS.map((opt) => {
            const on = (settings.paLessonFocus || 'all') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.desc}
                onClick={() => updateSettings({ paLessonFocus: opt.id as PaLessonFocus })}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  on
                    ? 'bg-sky-deep text-white'
                    : 'border border-[#cfe0ee] bg-white text-sky-ink/70 hover:border-sky-mid'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-sky-ink/45">
          {PA_LESSON_OPTIONS.find((o) => o.id === (settings.paLessonFocus || 'all'))?.desc}
        </p>
      </div>

      {profile ? (
        <div className="mt-5 space-y-4">
          <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${scenarioTone}`}>
            {scenarioIcon}
            <div>
              <p className="text-[13px] font-semibold">
                Now: {profile.scenario}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed opacity-90">
                {profile.scenarioPlain}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-sky-ink">Step-by-step analysis</p>
            <ol className="mt-2 space-y-2">
              {profile.steps.map((s) => (
                <li
                  key={s.step}
                  className="flex gap-3 rounded-xl border border-[#eef3f8] bg-sky-soft/20 px-3 py-2.5"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      s.status === 'action'
                        ? 'bg-sky-deep text-white'
                        : s.status === 'warn'
                          ? 'bg-amber-100 text-amber-800'
                          : s.status === 'wait'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {s.step}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-sky-ink">{s.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-sky-ink/60">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="rounded-xl border border-[#cfe0ee] bg-sky-soft/40 px-3 py-2 text-[11px] text-sky-ink/70">
            <strong>Learning note:</strong> {profile.learningNote}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-sky-ink/50">
          Click <strong>Scan live</strong> to load Nifty 3m candles and run the first analysis.
        </p>
      )}
    </section>
  );
}
