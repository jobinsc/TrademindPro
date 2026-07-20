'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LineChart, Sparkles } from 'lucide-react';
import { usePaperTradeSettings } from '@/hooks/usePaperTradeSettings';
import { usePaperTrading } from '@/hooks/usePaperTrading';
import { useNejoic } from '@/hooks/useNejoic';
import { useJimbo } from '@/hooks/useJimbo';
import type { ExecutionMode, PaperResultsColumns } from '@/lib/paper-trade-settings';
import { NEJOIC_NAME } from '@/lib/nejoic';
import { JIMBO_NAME } from '@/lib/jimbo';
import { normalizeStrategyIds } from '@/lib/nejoic-options';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

const RESULT_COLS: { key: keyof PaperResultsColumns; label: string }[] = [
  { key: 'strategy', label: 'Strategy' },
  { key: 'timeframe', label: 'Timeframe' },
  { key: 'lots', label: 'Lots / qty' },
  { key: 'entryExit', label: 'Entry → Exit' },
  { key: 'brokerage', label: 'Brokerage' },
  { key: 'stopTarget', label: 'SL / Target (pts)' },
  { key: 'trailing', label: 'Trailing SL' },
  { key: 'grossPnl', label: 'Gross P&L' },
  { key: 'netPnl', label: 'Net P&L' },
  { key: 'duration', label: 'Duration' },
  { key: 'note', label: 'Note' },
];

export default function PaperTradeSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { ready, settings, update, updateResultsColumns } = usePaperTradeSettings();
  const { setCapital } = usePaperTrading();
  const {
    settings: nejoicSettings,
    setAutoTrade: setNejoicAuto,
    updateSettings: updateNejoic,
  } = useNejoic();
  const {
    settings: jimboSettings,
    setAutoTrade: setJimboAuto,
    updateSettings: updateJimbo,
  } = useJimbo();
  const [hint, setHint] = useState('');
  const [capitalDraft, setCapitalDraft] = useState<number | null>(null);

  if (!ready) return null;

  const nejoicStrats = normalizeStrategyIds(
    nejoicSettings.strategyIds,
    nejoicSettings.strategyId
  );
  const jimboStrats = normalizeStrategyIds(
    jimboSettings.strategyIds,
    jimboSettings.strategyId
  );
  const bothAuto = nejoicSettings.autoTrade && jimboSettings.autoTrade;

  function flash(msg: string) {
    setHint(msg);
    window.setTimeout(() => setHint(''), 1600);
  }

  function startNejoic() {
    setNejoicAuto(true);
    flash(`${NEJOIC_NAME} auto ON`);
  }

  function stopNejoic() {
    setNejoicAuto(false);
    flash(`${NEJOIC_NAME} stopped`);
  }

  function startJimbo() {
    setJimboAuto(true);
    flash(`${JIMBO_NAME} auto ON`);
  }

  function stopJimbo() {
    setJimboAuto(false);
    flash(`${JIMBO_NAME} stopped`);
  }

  function setExecution(agent: 'nejoic' | 'jimbo', mode: ExecutionMode) {
    if (agent === 'nejoic') updateNejoic({ mode });
    else updateJimbo({ mode });
    flash(`${agent === 'nejoic' ? NEJOIC_NAME : JIMBO_NAME} → ${mode} mode`);
  }

  return (
    <section className={embedded ? '' : 'mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5'}>
      {!embedded ? (
        <div className="mb-4">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Paper hub</h2>
          <p className="mt-1 max-w-2xl text-[12px] text-sky-ink/55">
            Run <strong>{NEJOIC_NAME}</strong> (Nifty), <strong>{JIMBO_NAME}</strong> (stocks), or{' '}
            <strong>both at once</strong>. Manual trades always work alongside auto. Strategy, risk,
            and SL/target live in each agent&apos;s Settings.
          </p>
        </div>
      ) : null}
      {hint ? <p className="mb-3 text-[12px] font-semibold text-emerald-600">{hint}</p> : null}

      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
        Auto brains — start or stop each one separately
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-4 transition ${
            nejoicSettings.autoTrade
              ? 'border-sky-deep bg-sky-soft/80 ring-2 ring-sky-mid/30'
              : 'border-[#cfe0ee] bg-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-deep" />
            <span className="font-semibold text-sky-ink">{NEJOIC_NAME} · Nifty</span>
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                nejoicSettings.autoTrade
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {nejoicSettings.autoTrade ? 'AUTO ON' : 'AUTO OFF'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startNejoic}
              disabled={nejoicSettings.autoTrade}
              className="rounded-full bg-sky-deep px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              Start
            </button>
            <button
              type="button"
              onClick={stopNejoic}
              disabled={!nejoicSettings.autoTrade}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Stop
            </button>
          </div>
          <p className="mt-2 text-[12px] text-sky-ink/55">
            {nejoicStrats.length} strategies · {nejoicSettings.primaryTimeframe} · SL{' '}
            {nejoicSettings.stopLossPoints} / Tgt {nejoicSettings.targetPoints}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/40">
              Execution
            </span>
            {(['paper', 'live'] as const).map((mode) => (
              <button
                key={`n-${mode}`}
                type="button"
                onClick={() => setExecution('nejoic', mode)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${
                  nejoicSettings.mode === mode
                    ? mode === 'live'
                      ? 'bg-amber-600 text-white'
                      : 'bg-sky-deep text-white'
                    : 'bg-white text-sky-ink/55 ring-1 ring-[#cfe0ee]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <Link
            href="/app/nejoic"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-deep hover:underline"
          >
            Configure in {NEJOIC_NAME}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div
          className={`rounded-xl border p-4 transition ${
            jimboSettings.autoTrade
              ? 'border-sky-deep bg-sky-soft/80 ring-2 ring-sky-mid/30'
              : 'border-[#cfe0ee] bg-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-sky-deep" />
            <span className="font-semibold text-sky-ink">{JIMBO_NAME} · Stocks</span>
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                jimboSettings.autoTrade
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {jimboSettings.autoTrade ? 'AUTO ON' : 'AUTO OFF'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startJimbo}
              disabled={jimboSettings.autoTrade}
              className="rounded-full bg-sky-deep px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              Start
            </button>
            <button
              type="button"
              onClick={stopJimbo}
              disabled={!jimboSettings.autoTrade}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Stop
            </button>
          </div>
          <p className="mt-2 text-[12px] text-sky-ink/55">
            {jimboStrats.length} strategies · {jimboSettings.primaryTimeframe} · CCI(
            {jimboSettings.cciPeriod}) · Top {jimboSettings.maxLiquidityRank} · SL{' '}
            {jimboSettings.stopLossPoints} / Tgt {jimboSettings.targetPoints}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/40">
              Execution
            </span>
            {(['paper', 'live'] as const).map((mode) => (
              <button
                key={`j-${mode}`}
                type="button"
                onClick={() => setExecution('jimbo', mode)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${
                  jimboSettings.mode === mode
                    ? mode === 'live'
                      ? 'bg-amber-600 text-white'
                      : 'bg-sky-deep text-white'
                    : 'bg-white text-sky-ink/55 ring-1 ring-[#cfe0ee]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <Link
            href="/app/jimbo"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-deep hover:underline"
          >
            Configure in {JIMBO_NAME}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {(nejoicSettings.mode === 'live' || jimboSettings.mode === 'live') && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[12px] text-amber-900">
          <strong>Live mode</strong> selected — broker order routing is not fully connected yet.
          Auto will arm but orders stay blocked until live execution is enabled. Paper mode is safe
          for learning.
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
            Paper capital ₹
          </span>
          <input
            type="number"
            min={1000}
            step={1000}
            className={inputClass}
            value={capitalDraft ?? settings.startingCapital}
            onChange={(e) => setCapitalDraft(Number(e.target.value) || 100000)}
            onBlur={() => {
              const amount = Math.max(1000, Math.round(capitalDraft ?? settings.startingCapital));
              setCapitalDraft(null);
              update({ startingCapital: amount });
              const result = setCapital(amount);
              if (!result.ok) flash(result.error);
              else flash('Paper capital updated');
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
            Manual trade default
          </span>
          <select
            className={inputClass}
            value={settings.defaultInstrument}
            onChange={(e) =>
              update({
                defaultInstrument: e.target.value as 'NIFTY' | 'BANKNIFTY' | 'STOCK',
              })
            }
          >
            <option value="NIFTY">Nifty options</option>
            <option value="BANKNIFTY">Bank Nifty options</option>
            <option value="STOCK">Stocks</option>
          </select>
        </label>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
        <input
          type="checkbox"
          checked={settings.allowManualWithAuto !== false}
          onChange={(e) => update({ allowManualWithAuto: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
        />
        <span className="text-sm text-sky-ink">
          <strong className="font-semibold">Allow manual trades while auto is running</strong>
          <span className="mt-0.5 block text-[12px] text-sky-ink/50">
            Use <strong>New paper trade</strong> anytime — manual, Nejoic auto, and Jimbo auto can
            all run together.
          </span>
        </span>
      </label>

      <div className="mt-4 rounded-xl border border-dashed border-[#cfe0ee] bg-sky-soft/30 px-3 py-3 text-[12px] text-sky-ink/65">
        {bothAuto ? (
          <>
            Both brains running — <strong>{NEJOIC_NAME}</strong> on Nifty +{' '}
            <strong>{JIMBO_NAME}</strong> on liquid stocks.
          </>
        ) : nejoicSettings.autoTrade ? (
          <>
            <strong>{NEJOIC_NAME}</strong> auto ON · {jimboSettings.autoTrade ? '' : `${JIMBO_NAME} OFF`}
          </>
        ) : jimboSettings.autoTrade ? (
          <>
            <strong>{JIMBO_NAME}</strong> auto ON · {NEJOIC_NAME} OFF
          </>
        ) : (
          <>No auto brain running — use Start on each card below, or add manual trades.</>
        )}
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
          Show in results table
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RESULT_COLS.map((c) => {
            const on = settings.showInResults[c.key];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => updateResultsColumns({ [c.key]: !on })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  on
                    ? 'bg-sky-deep text-white'
                    : 'bg-white text-sky-ink/50 ring-1 ring-[#cfe0ee]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
