'use client';

import { useEffect, useState } from 'react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, BLINK_NIFTY50_STOCKS, BLINK_NIFTY_INDEX, BLINK_STRATEGY_MODES, BLINK_TIMEFRAMES, defaultBlinkSettings } from '@/lib/blink';
import { blinkUnderlying, blinkDefaultLotSize, blinkTradeQty, blinkFoLotSize, blinkDefaultBrokerage } from '@/lib/blink-universe';
import { activeBlinkStrategies } from '@/lib/blink-multi-strategy';
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
    const meta = blinkUnderlying(form.symbol || 'NIFTY');
    const lot = Math.max(1, Number(form.lotSize) || blinkDefaultLotSize(meta.symbol));
    const brokDefault = blinkDefaultBrokerage(meta.symbol, lot);
    const rawBrok = Number(form.brokeragePerLot);
    // Don't keep Nifty ₹175 brokerage on qty-1 stock trades
    const brokerage =
      meta.kind === 'stock' && rawBrok >= 100
        ? brokDefault
        : meta.kind === 'index' && rawBrok > 0 && rawBrok < 50
          ? brokDefault
          : Math.max(0, rawBrok || brokDefault);

    updateSettings({
      symbol: meta.symbol,
      exchange: 'NSE',
      lotSize: lot,
      strategyMode: form.strategyMode,
      strategyMode2: form.strategyMode2 || 'none',
      strategyCombine: form.strategyCombine,
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
      paLessonFocus: form.paLessonFocus || 'all',
      orbMinutes: Math.max(5, Math.min(60, Number(form.orbMinutes) || 5)),
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
      brokeragePerLot: brokerage,
      tradeOnlyMarketHours: form.tradeOnlyMarketHours,
    });
  }

  const field =
    'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

  const activeModes = activeBlinkStrategies(form);
  const needsCci = activeModes.some((m) => m === 'cci_zero' || m === 'cci_hhll_combo');
  const needsHhll = activeModes.some(
    (m) => m === 'hhll_pa' || m === 'cci_hhll_combo' || m === 'nifty_pa_3m'
  );
  const needsEma = activeModes.includes('ema_rsi');
  const needsOrb = activeModes.includes('orb');
  const secondOn = form.strategyMode2 && form.strategyMode2 !== 'none';
  const stockSelected = form.symbol && form.symbol !== 'NIFTY';

  return (
    <div className={embedded ? '' : 'space-y-4'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Underlying to analyse / backtest
          <select
            className={`${field} mt-1`}
            value={form.symbol || 'NIFTY'}
            onChange={(e) => {
              const sym = e.target.value;
              const meta = blinkUnderlying(sym);
              setForm((f) => ({
                ...f,
                symbol: meta.symbol,
                exchange: 'NSE',
                lotSize: blinkDefaultLotSize(meta.symbol),
                maxLotsPerTrade: 1,
                brokeragePerLot: blinkDefaultBrokerage(meta.symbol, blinkDefaultLotSize(meta.symbol)),
              }));
            }}
          >
            <option value={BLINK_NIFTY_INDEX.symbol}>{BLINK_NIFTY_INDEX.name}</option>
            <optgroup label="Nifty 50 stocks">
              {BLINK_NIFTY50_STOCKS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} — {s.name}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-sky-ink/45">
            Same strategies run on index or any Nifty 50 stock chart. Lot size auto-fills for
            backtest.
          </span>
        </label>
        <div className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-[11px] text-sky-ink/70">
          <p className="font-semibold text-sky-ink">Live vs backtest</p>
          <p className="mt-1 leading-relaxed">
            {stockSelected ? (
              <>
                <strong>{form.symbol}</strong> — Scan live uses real stock candles. Backtest uses
                simulated option premium. Live option LTP is{' '}
                <strong>Nifty index only</strong> for now.
              </>
            ) : (
              <>
                <strong>Nifty index</strong> — Scan live + backtest with real/simulated option
                premium (Upstox LTP when connected).
              </>
            )}
          </p>
        </div>
      </div>

      <label className="block text-[12px] font-semibold text-sky-ink/70">
        Signal engine
        <select
          className={`${field} mt-1`}
          value={form.strategyMode}
          onChange={(e) =>
            setForm((f) => {
              const nextMode = e.target.value as Form['strategyMode'];
              const next = {
                ...f,
                strategyMode: nextMode,
                strategyMode2:
                  f.strategyMode2 === nextMode ? 'none' : f.strategyMode2,
              };
              if (nextMode === 'nifty_pa_3m') {
                return {
                  ...next,
                  symbol: 'NIFTY',
                  exchange: 'NSE' as const,
                  chartTimeframe: '3m',
                  lotSize: 65,
                  strategyMode2: 'none' as const,
                };
              }
              return next;
            })
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
      </label>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Second strategy (optional)
          <select
            className={`${field} mt-1`}
            value={form.strategyMode2 || 'none'}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                strategyMode2: e.target.value as Form['strategyMode2'],
              }))
            }
          >
            <option value="none">None — use primary only</option>
            {BLINK_STRATEGY_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {BLINK_STRATEGY_ENTRIES.filter(
                  (s) => s.group === group && s.id !== form.strategyMode
                ).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-sky-ink/45">
            Run a second signal engine alongside the first for fewer or stronger entries.
          </span>
        </label>
        {secondOn ? (
          <label className="block text-[12px] font-semibold text-sky-ink/70">
            When both are on
            <select
              className={`${field} mt-1`}
              value={form.strategyCombine}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  strategyCombine: e.target.value as Form['strategyCombine'],
                }))
              }
            >
              <option value="all">Both must agree (fewer, safer trades)</option>
              <option value="any">Either can fire (more trades)</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-sky-ink/45">
              {form.strategyCombine === 'all'
                ? 'CE or PE only when both strategies say the same side.'
                : 'Takes the stronger signal when either strategy fires.'}
            </span>
          </label>
        ) : null}
      </div>
      <span className="mt-1 block text-[10px] font-normal text-sky-ink/35">
        {BLINK_STRATEGY_ENTRIES.length} strategies — pick one or two, Save, then Run backtest to see
        daily P&amp;L.
      </span>

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
          Qty per lot
          <input
            type="number"
            className={`${field} mt-1`}
            value={form.lotSize}
            onChange={(e) => setNum('lotSize', e.target.value)}
          />
          <span className="mt-1 block text-[10px] font-normal text-sky-ink/40">
            Nifty options default <strong>65</strong> · stocks default <strong>1</strong>
            {stockSelected && blinkFoLotSize(form.symbol) > 1
              ? ` · NSE F&O lot is ${blinkFoLotSize(form.symbol)}`
              : ''}
          </span>
        </label>
        <label className="block text-[12px] font-semibold text-sky-ink/70">
          Lots per trade
          <input
            type="number"
            className={`${field} mt-1`}
            min={1}
            max={3}
            value={form.maxLotsPerTrade}
            onChange={(e) => setNum('maxLotsPerTrade', e.target.value)}
          />
          <span className="mt-1 block text-[10px] font-normal text-sky-ink/40">
            Total qty = <strong>{blinkTradeQty(form.symbol || 'NIFTY', form.maxLotsPerTrade)}</strong>{' '}
            units
          </span>
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
        {(needsCci) && (
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
        {needsHhll && (
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
        {needsEma && (
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
        {needsOrb && (
          <label className="block text-[12px] font-semibold text-sky-ink/70 sm:col-span-2">
            ORB range minutes (from 09:15 IST)
            <select
              className={`${field} mt-1`}
              value={form.orbMinutes || 5}
              onChange={(e) =>
                setForm((f) => ({ ...f, orbMinutes: Number(e.target.value) || 5 }))
              }
            >
              <option value={5}>5 minutes (first 5m candle range)</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-sky-ink/45">
              Close above that range high → CE (buy). Stop below range low. First break of the day
              only. Target = your Target pts setting.
            </span>
          </label>
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
