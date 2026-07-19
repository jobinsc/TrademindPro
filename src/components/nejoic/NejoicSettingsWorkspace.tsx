'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { useNejoic } from '@/hooks/useNejoic';
import {
  defaultNejoicSettings,
  NEJOIC_NAME,
  styleToSetup,
  type NejoicSettings,
} from '@/lib/nejoic';
import {
  NEJOIC_ANALYSIS_STYLES,
  NEJOIC_STRATEGIES,
  NEJOIC_TIMEFRAMES,
  type NejoicAnalysisStyle,
  type NejoicTimeframeId,
} from '@/lib/nejoic-options';
import InfoBubble from '@/components/ui/InfoBubble';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export default function NejoicSettingsWorkspace() {
  const { ready, settings, updateSettings } = useNejoic();
  const [form, setForm] = useState<NejoicSettings>(defaultNejoicSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setForm({ ...defaultNejoicSettings(), ...settings });
  }, [ready, settings]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-[800px] px-5 py-16 text-center text-sm text-sky-ink/50">
        Loading {NEJOIC_NAME} settings…
      </div>
    );
  }

  function setNum<K extends keyof NejoicSettings>(key: K, value: string) {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setForm((f) => ({ ...f, [key]: n }));
  }

  function toggleWatchTf(id: NejoicTimeframeId) {
    setForm((f) => {
      const cur = f.watchTimeframes || [];
      if (cur.includes(id)) {
        return { ...f, watchTimeframes: cur.filter((x) => x !== id) };
      }
      return { ...f, watchTimeframes: [...cur, id] };
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const analysisStyle = form.analysisStyle || 'strict';
    updateSettings({
      dailyProfitTarget: Math.max(100, form.dailyProfitTarget),
      dailyMaxLoss: Math.max(100, form.dailyMaxLoss),
      lotSize: Math.max(1, Math.floor(form.lotSize)),
      maxLotsPerTrade: Math.min(5, Math.max(1, Math.floor(form.maxLotsPerTrade))),
      leftBars: Math.min(20, Math.max(1, Math.floor(form.leftBars))),
      rightBars: Math.min(20, Math.max(1, Math.floor(form.rightBars))),
      minConfidence: Math.min(95, Math.max(50, Math.floor(form.minConfidence))),
      strategyId: form.strategyId,
      analysisStyle,
      setupStyle: styleToSetup(analysisStyle),
      primaryTimeframe: form.primaryTimeframe,
      watchTimeframes: form.watchTimeframes?.length
        ? form.watchTimeframes
        : ['15m', '1D', '1W'],
      emaFast: Math.max(2, Math.floor(form.emaFast)),
      emaSlow: Math.max(3, Math.floor(form.emaSlow)),
      rsiPeriod: Math.max(2, Math.floor(form.rsiPeriod)),
      rsiOversold: Math.min(40, Math.max(10, Math.floor(form.rsiOversold))),
      rsiOverbought: Math.min(90, Math.max(60, Math.floor(form.rsiOverbought))),
      breakoutLookback: Math.min(50, Math.max(5, Math.floor(form.breakoutLookback))),
      respectLunchHour: form.respectLunchHour !== false,
      tradeOnlyMarketHours: form.tradeOnlyMarketHours !== false,
      ignoreDailyLimits: Boolean(form.ignoreDailyLimits),
      askMode: form.askMode,
      telegramNotify: form.telegramNotify !== false,
      mode: 'paper',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const strategy = form.strategyId || 'price_action_hhll';
  const showPa = strategy === 'price_action_hhll' || strategy === 'swing_hl';
  const showEma = strategy === 'ema_cross';
  const showRsi = strategy === 'rsi_bounce';
  const showBreak = strategy === 'breakout';

  return (
    <div className="mx-auto w-full max-w-[800px] px-5 py-7 md:px-8 md:py-9">
      <Link
        href="/app/nejoic"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {NEJOIC_NAME}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft text-sky-deep">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Fix these · Nejoic follows them
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              {NEJOIC_NAME} Settings
            </h1>
            <InfoBubble title="What to fix here">
              Pick a strategy, how strict analysis is, and which timeframes. Nejoic uses these for
              Pulse, paper trades, and Telegram. Paper money only.
            </InfoBubble>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-5">
        {/* 1. Strategy */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            1. Strategy (how Nejoic finds a trade)
          </h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Tap one. This is the main brain for analysis + paper signals.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {NEJOIC_STRATEGIES.map((s) => {
              const on = strategy === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, strategyId: s.id }))}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    on
                      ? 'border-sky-deep bg-sky-soft/80 ring-2 ring-sky-mid/40'
                      : 'border-[#cfe0ee] bg-white hover:bg-sky-soft/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-sky-ink">{s.name}</p>
                  <p className="mt-1 text-[12px] text-sky-ink/55">{s.short}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-sky-deep">
                    You fix: {s.whatYouFix}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Analysis style */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            2. Analysis style (how strict)
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {NEJOIC_ANALYSIS_STYLES.map((s) => {
              const on = (form.analysisStyle || 'strict') === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      analysisStyle: s.id as NejoicAnalysisStyle,
                      setupStyle: styleToSetup(s.id),
                    }))
                  }
                  className={`rounded-xl border px-3 py-3 text-left ${
                    on
                      ? 'border-sky-deep bg-sky-soft/80 ring-2 ring-sky-mid/40'
                      : 'border-[#cfe0ee] hover:bg-sky-soft/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-sky-ink">{s.name}</p>
                  <p className="mt-1 text-[12px] text-sky-ink/55">{s.desc}</p>
                </button>
              );
            })}
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Min confidence % (extra gate)
            </span>
            <input
              type="number"
              className={inputClass}
              value={form.minConfidence}
              onChange={(e) => setNum('minConfidence', e.target.value)}
            />
          </label>
        </section>

        {/* 3. Timeframes */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            3. Timeframes (all of them)
          </h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Main = used for Pulse & auto paper. Extra = also watched in the report.
          </p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
            Main timeframe
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {NEJOIC_TIMEFRAMES.map((t) => {
              const on = form.primaryTimeframe === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      primaryTimeframe: t.id as NejoicTimeframeId,
                    }))
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    on
                      ? 'bg-sky-deep text-white'
                      : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
            Also watch (tick many)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {NEJOIC_TIMEFRAMES.map((t) => {
              const on = (form.watchTimeframes || []).includes(t.id);
              return (
                <button
                  key={`w-${t.id}`}
                  type="button"
                  onClick={() => toggleWatchTf(t.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    on
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Strategy knobs */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            4. Numbers for your strategy
          </h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Only the fields for the strategy you picked above.
          </p>

          {showPa && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Left bars (Pine lb)
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.leftBars}
                  onChange={(e) => setNum('leftBars', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Right bars (Pine rb)
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.rightBars}
                  onChange={(e) => setNum('rightBars', e.target.value)}
                />
              </label>
            </div>
          )}

          {showEma && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Fast EMA
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.emaFast}
                  onChange={(e) => setNum('emaFast', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Slow EMA
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.emaSlow}
                  onChange={(e) => setNum('emaSlow', e.target.value)}
                />
              </label>
            </div>
          )}

          {showRsi && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  RSI period
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.rsiPeriod}
                  onChange={(e) => setNum('rsiPeriod', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Oversold
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.rsiOversold}
                  onChange={(e) => setNum('rsiOversold', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Overbought
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.rsiOverbought}
                  onChange={(e) => setNum('rsiOverbought', e.target.value)}
                />
              </label>
            </div>
          )}

          {showBreak && (
            <div className="mt-4">
              <label className="block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                  Breakout lookback (bars)
                </span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.breakoutLookback}
                  onChange={(e) => setNum('breakoutLookback', e.target.value)}
                />
              </label>
            </div>
          )}
        </section>

        {/* 5. Risk + size */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            5. Daily risk & lot size (paper)
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Profit target (₹)
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.dailyProfitTarget}
                onChange={(e) => setNum('dailyProfitTarget', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Max loss (₹)
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.dailyMaxLoss}
                onChange={(e) => setNum('dailyMaxLoss', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Lot size
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.lotSize}
                onChange={(e) => setNum('lotSize', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Max lots / trade
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.maxLotsPerTrade}
                onChange={(e) => setNum('maxLotsPerTrade', e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* 6. Brain + Telegram */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            6. Ask mode & session filters
          </h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                When you ask Nejoic
              </span>
              <select
                className={inputClass}
                value={form.askMode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    askMode: e.target.value as NejoicSettings['askMode'],
                  }))
                }
              >
                <option value="nejoic_math">Nejoic does the maths (Live Pulse)</option>
                <option value="rules">Only my fixed rules (short replies)</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
              <input
                type="checkbox"
                checked={form.respectLunchHour !== false}
                onChange={(e) => setForm((f) => ({ ...f, respectLunchHour: e.target.checked }))}
                className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
              />
              <span className="text-sm text-sky-ink">Wait in lunch hour (12:00–1:30 PM)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
              <input
                type="checkbox"
                checked={form.tradeOnlyMarketHours !== false}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tradeOnlyMarketHours: e.target.checked }))
                }
                className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
              />
              <span className="text-sm text-sky-ink">Paper trades only in market hours</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3">
              <input
                type="checkbox"
                checked={Boolean(form.ignoreDailyLimits)}
                onChange={(e) => setForm((f) => ({ ...f, ignoreDailyLimits: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
              />
              <span className="text-sm text-sky-ink">
                <strong className="font-semibold">Paper study mode</strong> — ignore daily
                profit/loss locks. Keep analysing & paper trading until market close (for learning
                only).
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
              <input
                type="checkbox"
                checked={form.telegramNotify !== false}
                onChange={(e) => setForm((f) => ({ ...f, telegramNotify: e.target.checked }))}
                className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
              />
              <span className="text-sm text-sky-ink">Telegram alerts (when bot is set up)</span>
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Save className="h-4 w-4" />
            Save Nejoic settings
          </button>
          {saved && <span className="text-sm font-semibold text-emerald-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
