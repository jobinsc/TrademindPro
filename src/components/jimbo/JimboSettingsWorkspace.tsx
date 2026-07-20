'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Save } from 'lucide-react';
import { useJimbo } from '@/hooks/useJimbo';
import {
  defaultJimboSettings,
  JIMBO_NAME,
  JIMBO_UNIVERSE,
  styleToSetup,
  type JimboSettings,
} from '@/lib/jimbo';
import {
  NEJOIC_ANALYSIS_STYLES,
  NEJOIC_STRATEGIES,
  NEJOIC_TIMEFRAMES,
  normalizeStrategyIds,
  type NejoicAnalysisStyle,
  type NejoicStrategyId,
  type NejoicTimeframeId,
} from '@/lib/nejoic-options';
import {
  STRATEGY_QUICK_PRESETS,
  StrategyGroupedMulti,
} from '@/components/ui/StrategyPicker';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import { NEJOIC_NAME } from '@/lib/nejoic';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export function JimboSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { ready, settings, updateSettings } = useJimbo();
  const [form, setForm] = useState<JimboSettings>(defaultJimboSettings());
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState('');
  const hydratedAt = useRef<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const stamp = settings.updatedAt || '';
    if (dirty.current) return;
    if (hydratedAt.current === stamp && hydratedAt.current !== null) return;

    const merged = { ...defaultJimboSettings(), ...settings };
    merged.strategyIds = normalizeStrategyIds(merged.strategyIds, merged.strategyId);
    setForm(merged);
    hydratedAt.current = stamp;
  }, [ready, settings]);

  function markDirty() {
    dirty.current = true;
  }

  if (!ready) {
    if (embedded) return null;
    return (
      <div className="mx-auto max-w-[800px] px-5 py-16 text-center text-sm text-sky-ink/50">
        Loading {JIMBO_NAME} settings…
      </div>
    );
  }

  function setNum<K extends keyof JimboSettings>(key: K, value: string) {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    markDirty();
    setForm((f) => ({ ...f, [key]: n }));
  }

  function toggleWatchTf(id: NejoicTimeframeId) {
    markDirty();
    setForm((f) => {
      const cur = f.watchTimeframes || [];
      if (cur.includes(id)) {
        return { ...f, watchTimeframes: cur.filter((x) => x !== id) };
      }
      return { ...f, watchTimeframes: [...cur, id] };
    });
  }

  function changeSelected(ids: NejoicStrategyId[]) {
    const strategyIds = normalizeStrategyIds(ids, ids[0]);
    const strategyId = strategyIds[0];
    const stamp = new Date().toISOString();
    dirty.current = false;
    hydratedAt.current = stamp;
    setForm((f) => ({ ...f, strategyIds, strategyId, updatedAt: stamp }));
    updateSettings({ strategyIds, strategyId });
    setHint(`${strategyIds.length} strategies ON · saved`);
    window.setTimeout(() => setHint(''), 1600);
  }

  function applyStrategyPreset(strategyIds: NejoicStrategyId[], strategyId: NejoicStrategyId) {
    const stamp = new Date().toISOString();
    dirty.current = false;
    hydratedAt.current = stamp;
    setForm((f) => ({ ...f, strategyIds, strategyId, updatedAt: stamp }));
    updateSettings({ strategyIds, strategyId });
    setHint(`${strategyIds.length} strategies ON · saved`);
    window.setTimeout(() => setHint(''), 1600);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const analysisStyle = form.analysisStyle || 'strict';
    const strategyIds = normalizeStrategyIds(form.strategyIds, form.strategyId);
    dirty.current = false;
    updateSettings({
      dailyProfitTarget: Math.max(100, form.dailyProfitTarget),
      dailyMaxLoss: Math.max(100, form.dailyMaxLoss),
      lotSize: Math.max(1, Math.floor(form.lotSize)),
      maxLotsPerTrade: Math.min(5, Math.max(1, Math.floor(form.maxLotsPerTrade))),
      brokeragePerLot: Math.max(0, Math.round(Number(form.brokeragePerLot) || 175)),
      leftBars: Math.min(20, Math.max(1, Math.floor(form.leftBars))),
      rightBars: Math.min(20, Math.max(1, Math.floor(form.rightBars))),
      minConfidence: Math.min(95, Math.max(50, Math.floor(form.minConfidence))),
      strategyId: strategyIds[0],
      strategyIds,
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
      orbMinutes: Math.min(60, Math.max(5, Math.floor(form.orbMinutes || 15))),
      respectLunchHour: form.respectLunchHour !== false,
      tradeOnlyMarketHours: form.tradeOnlyMarketHours !== false,
      tradeOnlyWhenMarketOpen: form.tradeOnlyWhenMarketOpen !== false,
      ignoreDailyLimits: Boolean(form.ignoreDailyLimits),
      askMode: form.askMode,
      targetPoints: Math.max(1, Number(form.targetPoints) || 40),
      stopLossPoints: Math.max(1, Number(form.stopLossPoints) || 25),
      trailingStopPoints: Math.max(0, Number(form.trailingStopPoints) || 0),
      trailingActivatePoints: Math.max(0, Number(form.trailingActivatePoints) || 0),
      cciPeriod: Math.min(50, Math.max(5, Math.floor(form.cciPeriod))),
      maxLiquidityRank: Math.min(
        JIMBO_UNIVERSE.length,
        Math.max(1, Math.floor(form.maxLiquidityRank))
      ),
      requirePaConfirm: form.requirePaConfirm,
      mode: 'paper',
    });
    setSaved(true);
  }

  const selected = normalizeStrategyIds(form.strategyIds, form.strategyId);
  const showPa = selected.some((id) => id === 'price_action_hhll' || id === 'swing_hl');
  const showEma = selected.includes('ema_cross');
  const showRsi = selected.includes('rsi_bounce');
  const showBreak = selected.includes('breakout');
  const showOrb = selected.includes('orb');

  return (
    <form onSubmit={handleSave} className={embedded ? 'space-y-5' : 'mt-8 space-y-5'}>
      {/* 1. Strategy */}
      <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              1. Strategies — turn ON / OFF what Jimbo may use
            </h2>
            <p className="mt-1 text-[12px] text-sky-ink/50">
              Same strategy library as Nejoic. Tap any card to toggle — saves instantly. Jimbo scans
              liquid stock options and picks the strongest clear side among strategies that are ON.
            </p>
            {hint ? (
              <p className="mt-1 text-[12px] font-semibold text-emerald-600">{hint}</p>
            ) : null}
          </div>
          <p className="rounded-full bg-sky-soft px-3 py-1 text-[11px] font-semibold text-sky-deep">
            {selected.length} of {NEJOIC_STRATEGIES.length} ON
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              applyStrategyPreset(
                NEJOIC_STRATEGIES.map((s) => s.id),
                'price_action_hhll'
              )
            }
            className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-ink/70 ring-1 ring-[#cfe0ee] hover:bg-sky-soft/50"
          >
            Turn all ON
          </button>
          {(Object.values(STRATEGY_QUICK_PRESETS) as { label: string; ids: CatalogStrategyId[] }[]).map(
            (preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  applyStrategyPreset(
                    preset.ids.length ? preset.ids : selected,
                    preset.ids[0] || 'price_action_hhll'
                  )
                }
                className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-ink/70 ring-1 ring-[#cfe0ee] hover:bg-sky-soft/50"
              >
                {preset.label}
              </button>
            )
          )}
        </div>

        <div className="mt-4">
          <StrategyGroupedMulti
            selected={selected}
            onChangeSelected={changeSelected}
            onBlocked={(msg) => {
              setHint(msg);
              window.setTimeout(() => setHint(''), 2200);
            }}
          />
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
                onClick={() => {
                  markDirty();
                  setForm((f) => ({
                    ...f,
                    analysisStyle: s.id as NejoicAnalysisStyle,
                    setupStyle: styleToSetup(s.id),
                  }));
                }}
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
          Main = used for scans & auto paper. Extra = also watched in the report.
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
                onClick={() => {
                  markDirty();
                  setForm((f) => ({
                    ...f,
                    primaryTimeframe: t.id as NejoicTimeframeId,
                  }));
                }}
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
          4. Numbers for selected strategies
        </h2>
        <p className="mt-1 text-[12px] text-sky-ink/50">
          Only fields for strategies you ticked above.
        </p>

        {showPa && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Price Action (Long + Short)
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
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

        {showOrb && (
          <div className="mt-4">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                ORB minutes (from 09:15 IST)
              </span>
              <input
                type="number"
                min={5}
                max={60}
                className={inputClass}
                value={form.orbMinutes ?? 15}
                onChange={(e) => setNum('orbMinutes', e.target.value)}
              />
            </label>
          </div>
        )}

        {!showPa && !showEma && !showRsi && !showBreak && !showOrb && (
          <p className="mt-4 text-sm text-sky-ink/50">
            VWAP / MACD need no extra knobs. Select Price Action, EMA, RSI, Breakout, or ORB above
            to tune numbers.
          </p>
        )}
      </section>

      {/* 5. Stock engine — Jimbo-specific */}
      <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          5. Stock engine — CCI, liquidity &amp; universe
        </h2>
        <p className="mt-1 text-[12px] text-sky-ink/50">
          Jimbo scans liquid F&amp;O names. CCI zero-cross above 0 → ATM CE · below 0 → ATM PE (after
          PA when required).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              CCI period
            </span>
            <input
              type="number"
              className={inputClass}
              value={form.cciPeriod}
              onChange={(e) => setNum('cciPeriod', e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Max liquidity rank (1 = most liquid, up to {JIMBO_UNIVERSE.length})
            </span>
            <input
              type="number"
              className={inputClass}
              value={form.maxLiquidityRank}
              onChange={(e) => setNum('maxLiquidityRank', e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-sky-ink/45">
              Example: 10 = only top 10 most liquid F&amp;O names
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.requirePaConfirm}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({ ...f, requirePaConfirm: e.target.checked }));
              }}
              className="h-4 w-4 accent-sky-deep"
            />
            <span>
              <strong className="text-sky-ink">Require price-action confirm</strong>
              <span className="mt-0.5 block text-[12px] text-sky-ink/50">
                After CCI zero-cross, wait for PA before CE/PE
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* 6. Risk + size */}
      <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          6. Daily risk &amp; lot size (paper)
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
        <p className="mt-3 text-[12px] text-sky-ink/50">
          Paper results for {JIMBO_NAME} trades appear under{' '}
          <Link href="/app/paper-trading" className="font-semibold text-sky-deep hover:underline">
            Paper Trading
          </Link>
          .
        </p>
      </section>

      {/* 7. Paper execution */}
      <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          7. Paper execution — SL / target / trailing (stocks)
        </h2>
        <p className="mt-1 text-[12px] text-sky-ink/50">
          Used when {JIMBO_NAME} opens or closes paper trades. Configure once here — Paper hub only
          picks {NEJOIC_NAME} vs {JIMBO_NAME}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Brokerage ₹ / lot
            </span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.brokeragePerLot}
              onChange={(e) => setNum('brokeragePerLot', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Target (premium points)
            </span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.targetPoints}
              onChange={(e) => setNum('targetPoints', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Stop-loss (points)
            </span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.stopLossPoints}
              onChange={(e) => setNum('stopLossPoints', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Trailing SL (0 = off)
            </span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.trailingStopPoints}
              onChange={(e) => setNum('trailingStopPoints', e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Activate trailing after profit (points)
            </span>
            <input
              type="number"
              min={0}
              className={`${inputClass} max-w-xs`}
              value={form.trailingActivatePoints}
              onChange={(e) => setNum('trailingActivatePoints', e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* 8. Ask mode + session */}
      <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          8. Ask mode &amp; session filters
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              When you ask Jimbo
            </span>
            <select
              className={inputClass}
              value={form.askMode}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({
                  ...f,
                  askMode: e.target.value as JimboSettings['askMode'],
                }));
              }}
            >
              <option value="nejoic_math">Jimbo does the maths (scans + chat)</option>
              <option value="rules">Only my fixed rules (short replies)</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={form.respectLunchHour !== false}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({ ...f, respectLunchHour: e.target.checked }));
              }}
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">Wait in lunch hour (12:00–1:30 PM)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={form.tradeOnlyMarketHours !== false}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({ ...f, tradeOnlyMarketHours: e.target.checked }));
              }}
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">Paper trades only in market hours</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={form.tradeOnlyWhenMarketOpen}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({ ...f, tradeOnlyWhenMarketOpen: e.target.checked }));
              }}
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">
              Block new trades when NSE is closed (manual + auto)
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3">
            <input
              type="checkbox"
              checked={Boolean(form.ignoreDailyLimits)}
              onChange={(e) => {
                markDirty();
                setForm((f) => ({ ...f, ignoreDailyLimits: e.target.checked }));
              }}
              className="mt-0.5 h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">
              <strong className="font-semibold">Paper study mode</strong> — ignore daily
              profit/loss locks. Keep scanning &amp; paper trading until market close (for learning
              only).
            </span>
          </label>
        </div>
      </section>

      <div className="rounded-2xl border border-dashed border-[#cfe0ee] bg-sky-soft/30 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Bell className="h-4 w-4 text-sky-deep" />
          <p className="text-sm font-semibold text-sky-ink">Telegram bot delivery</p>
        </div>
        <p className="mt-1 text-[12px] text-sky-ink/55">
          Telegram is separate:{' '}
          <Link href="/app/telegram" className="font-semibold text-sky-deep hover:underline">
            AI Agents → Telegram Bot
          </Link>
          . Paper qty / SL / target are configured above in section 7.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
        >
          <Save className="h-4 w-4" />
          Save Jimbo settings
        </button>
        {saved && <span className="text-sm font-semibold text-emerald-600">Saved</span>}
      </div>
    </form>
  );
}
