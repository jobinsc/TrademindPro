'use client';

import { useEffect, useState } from 'react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, BLINK_STRATEGY_MODES, BLINK_TIMEFRAMES, defaultBlinkSettings } from '@/lib/blink';
import { BLINK_STRATEGY_GROUPS, BLINK_STRATEGY_ENTRIES } from '@/lib/blink-strategies';
import { TRADE_WINDOW_PRESETS } from '@/lib/option-sim';

type Form = ReturnType<typeof defaultBlinkSettings>;

export function BlinkSettingsPanel({ embedded }: { embedded?: boolean }) {
  const { settings, updateSettings } = useBlink();
  const [form, setForm] = useState<Form>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function setNum<K extends keyof Form>(key: K, raw: string) {
    setForm((f) => ({ ...f, [key]: Number(raw) || 0 }));
  }

  function save() {
    updateSettings({
      strategyMode: form.strategyMode,
      dailyProfitTarget: Math.max(100, Number(form.dailyProfitTarget) || 1500),
      dailyMaxLoss: Math.max(100, Number(form.dailyMaxLoss) || 1000),
      maxLotsPerTrade: Math.max(1, Math.min(3, Number(form.maxLotsPerTrade) || 1)),
      minConfidence: Math.max(50, Math.min(95, Number(form.minConfidence) || 68)),
      emaFast: Math.max(3, Number(form.emaFast) || 9),
      emaSlow: Math.max(5, Number(form.emaSlow) || 21),
      rsiPeriod: Math.max(3, Number(form.rsiPeriod) || 7),
      cciPeriod: Math.max(5, Math.min(50, Number(form.cciPeriod) || 20)),
      cciOversold: Math.min(0, Number(form.cciOversold) || -100),
      cciOverbought: Math.max(0, Number(form.cciOverbought) || 100),
      paLeftBars: Math.max(1, Math.min(15, Number(form.paLeftBars) || 5)),
      paRightBars: Math.max(1, Math.min(15, Number(form.paRightBars) || 5)),
      strikeMoneyness: form.strikeMoneyness,
      tradeWindowStart: form.tradeWindowStart,
      tradeWindowEnd: form.tradeWindowEnd,
      chartTimeframe: form.chartTimeframe,
      targetPoints: Math.max(1, Number(form.targetPoints) || 5),
      stopLossPoints: Math.max(1, Number(form.stopLossPoints) || 8),
      trailingStopPoints: Math.max(0, Number(form.trailingStopPoints) || 0),
      trailingActivatePoints: Math.max(0, Number(form.trailingActivatePoints) || 4),
      maxHoldSeconds: Math.max(30, Number(form.maxHoldSeconds) || 180),
      maxTradesPerDay: Math.max(1, Number(form.maxTradesPerDay) || 25),
      brokeragePerLot: Math.max(0, Number(form.brokeragePerLot) || 175),
      tradeOnlyMarketHours: form.tradeOnlyMarketHours,
    });
  }

  const field =
    'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

  return (
    <div className={embedded ? '' : 'space-y-4'}>
      <label className="block text-[12px] font-semibold text-sky-ink/70">
        Signal engine
        <select
          className={`${field} mt-1`}
          value={form.strategyMode}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              strategyMode: e.target.value as Form['strategyMode'],
            }))
          }
        >
          {BLINK_STRATEGY_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {BLINK_STRATEGY_ENTRIES.filter((s) => s.group === group).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="mt-1 block text-[11px] font-normal text-sky-ink/45">
          {BLINK_STRATEGY_ENTRIES.find((m) => m.id === form.strategyMode)?.desc ??
            BLINK_STRATEGY_MODES.find((m) => m.id === form.strategyMode)?.desc}
        </span>
        <span className="mt-1 block text-[10px] font-normal text-sky-ink/35">
          {BLINK_STRATEGY_ENTRIES.length} strategies — pick one, Save, then Run backtest to see daily
          P&amp;L.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Daily target ₹
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.dailyProfitTarget}
            onChange={(e) => setNum('dailyProfitTarget', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Max loss ₹
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.dailyMaxLoss}
            onChange={(e) => setNum('dailyMaxLoss', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Max trades / day
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.maxTradesPerDay}
            onChange={(e) => setNum('maxTradesPerDay', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Target pts (premium)
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.targetPoints}
            onChange={(e) => setNum('targetPoints', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Stop-loss pts
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.stopLossPoints}
            onChange={(e) => setNum('stopLossPoints', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Max hold (seconds)
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.maxHoldSeconds}
            onChange={(e) => setNum('maxHoldSeconds', e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Min confidence %
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.minConfidence}
            onChange={(e) => setNum('minConfidence', e.target.value)}
          />
        </label>
        {(form.strategyMode === 'cci_zero' || form.strategyMode === 'cci_hhll_combo') && (
          <>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              CCI period
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.cciPeriod}
                onChange={(e) => setNum('cciPeriod', e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              CCI oversold
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.cciOversold}
                onChange={(e) => setNum('cciOversold', e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              CCI overbought
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.cciOverbought}
                onChange={(e) => setNum('cciOverbought', e.target.value)}
              />
            </label>
          </>
        )}
        {(form.strategyMode === 'hhll_pa' || form.strategyMode === 'cci_hhll_combo') && (
          <>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              HH/LL left bars
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.paLeftBars}
                onChange={(e) => setNum('paLeftBars', e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              HH/LL right bars
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.paRightBars}
                onChange={(e) => setNum('paRightBars', e.target.value)}
              />
            </label>
          </>
        )}
        {form.strategyMode === 'ema_rsi' && (
          <>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              EMA fast
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.emaFast}
                onChange={(e) => setNum('emaFast', e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-semibold text-sky-ink/70">
              EMA slow
              <input
                type="number"
                className={`${field} mt-1`}
                value={form.emaSlow}
                onChange={(e) => setNum('emaSlow', e.target.value)}
              />
            </label>
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Chart interval (signals)
          <select
            className={`${field} mt-1`}
            value={form.chartTimeframe}
            onChange={(e) => setForm((f) => ({ ...f, chartTimeframe: e.target.value }))}
          >
            {BLINK_TIMEFRAMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Strike vs spot (live)
          <select
            className={`${field} mt-1`}
            value={form.strikeMoneyness}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                strikeMoneyness: e.target.value as Form['strikeMoneyness'],
              }))
            }
          >
            <option value="atm">ATM</option>
            <option value="itm">ITM (more delta, costlier)</option>
            <option value="otm">OTM (cheaper, more risk)</option>
          </select>
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Scalp from (IST)
          <input
            type="time"
            className={`${field} mt-1`}
            value={form.tradeWindowStart}
            onChange={(e) => setForm((f) => ({ ...f, tradeWindowStart: e.target.value }))}
          />
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Scalp until (IST)
          <input
            type="time"
            className={`${field} mt-1`}
            value={form.tradeWindowEnd}
            onChange={(e) => setForm((f) => ({ ...f, tradeWindowEnd: e.target.value }))}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TRADE_WINDOW_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                tradeWindowStart: p.start,
                tradeWindowEnd: p.end,
              }))
            }
            className="rounded-full border border-[#cfe0ee] bg-white px-2.5 py-1 text-[10px] font-semibold text-sky-ink/70 hover:border-sky-mid"
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-sky-ink/80">
        <input
          type="checkbox"
          checked={form.tradeOnlyMarketHours}
          onChange={(e) => setForm((f) => ({ ...f, tradeOnlyMarketHours: e.target.checked }))}
        />
        Trade only in India cash session (09:15–15:30 IST)
      </label>
      <button
        type="button"
        onClick={save}
        className="mt-4 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
      >
        Save {BLINK_NAME} settings
      </button>
    </div>
  );
}
