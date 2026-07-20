'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Pause, Play, Save, Send } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useTelegramBot } from '@/hooks/useTelegramBot';
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
import type { TelegramInstrument, TelegramMessageStyle } from '@/lib/telegram-bot-settings';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export default function TelegramBotWorkspace() {
  const { ready, settings, update } = useTelegramBot();
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState('');

  const selected = useMemo(
    () => normalizeStrategyIds(settings.strategyIds, settings.strategyIds[0]),
    [settings.strategyIds]
  );

  if (!ready) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading Telegram bot…
      </div>
    );
  }

  function flash(msg: string) {
    setHint(msg);
    setSaved(true);
    window.setTimeout(() => {
      setHint('');
      setSaved(false);
    }, 1800);
  }

  function changeSelected(ids: NejoicStrategyId[]) {
    update({ strategyIds: normalizeStrategyIds(ids, ids[0]) });
    flash(`${ids.length} strategies ON for Telegram`);
  }

  function saveAll(e: React.FormEvent) {
    e.preventDefault();
    update({
      instrument: settings.instrument,
      timeframe: settings.timeframe,
      heartbeatMinutes: settings.heartbeatMinutes,
      messageStyle: settings.messageStyle,
      includeStudies: settings.includeStudies,
      analysisStyle: settings.analysisStyle,
      minConfidence: settings.minConfidence,
      leftBars: settings.leftBars,
      rightBars: settings.rightBars,
      emaFast: settings.emaFast,
      emaSlow: settings.emaSlow,
      rsiPeriod: settings.rsiPeriod,
      rsiOversold: settings.rsiOversold,
      rsiOverbought: settings.rsiOverbought,
      breakoutLookback: settings.breakoutLookback,
      orbMinutes: settings.orbMinutes,
      strategyIds: selected,
    });
    flash('Telegram settings saved');
  }

  const tgOn = settings.enabled;

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            AI Agent System · Telegram only
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Telegram Bot
            </h1>
            <InfoBubble title="Telegram-only settings">
              Everything here controls <strong>Telegram messages only</strong> — instrument,
              timeframe, message style, and which strategies the pulse checks. Nejoic paper trading
              and Paper Trading settings are separate.
            </InfoBubble>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] text-sky-ink/55">
            Keep the <Link href="/app/nejoic" className="font-semibold text-sky-deep hover:underline">Nejoic</Link>{' '}
            tab open while Messages are ON so heartbeats can send.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe0ee] bg-sky-soft/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-sky-ink">Messages {tgOn ? 'ON' : 'OFF'}</p>
          <p className="text-[11px] text-sky-ink/50">
            {tgOn
              ? 'Live Pulse uses the strategies & timeframe below'
              : 'Nothing will be sent until you start messages'}
          </p>
          {hint ? <p className="mt-1 text-[12px] font-semibold text-emerald-600">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            update({ enabled: !tgOn });
            flash(!tgOn ? 'Telegram messages ON' : 'Telegram messages OFF');
          }}
          className={`inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white ${
            tgOn ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {tgOn ? (
            <>
              <Pause className="h-4 w-4" />
              Stop messages
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start messages
            </>
          )}
        </button>
      </div>

      <form onSubmit={saveAll} className="mt-6 space-y-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-deep" />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              1. Delivery — instrument, timeframe, style
            </h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Instrument
              </span>
              <select
                className={inputClass}
                value={settings.instrument}
                onChange={(e) =>
                  update({ instrument: e.target.value as TelegramInstrument })
                }
              >
                <option value="AUTO">AUTO — desk (Nifty / Gold / BTC)</option>
                <option value="NIFTY">Nifty only</option>
                <option value="GOLD">Gold only</option>
                <option value="BTC">BTC only</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Timeframe
              </span>
              <select
                className={inputClass}
                value={settings.timeframe}
                onChange={(e) =>
                  update({ timeframe: e.target.value as NejoicTimeframeId })
                }
              >
                {NEJOIC_TIMEFRAMES.map((tf) => (
                  <option key={tf.id} value={tf.id}>
                    {tf.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Message style
              </span>
              <select
                className={inputClass}
                value={settings.messageStyle}
                onChange={(e) =>
                  update({ messageStyle: e.target.value as TelegramMessageStyle })
                }
              >
                <option value="full">Full report (levels + plan)</option>
                <option value="compact">Compact (decision + levels)</option>
                <option value="signal_only">Signal only (CE / PE / WAIT)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Heartbeat (minutes)
              </span>
              <input
                type="number"
                min={3}
                max={60}
                className={inputClass}
                value={settings.heartbeatMinutes}
                onChange={(e) =>
                  update({
                    heartbeatMinutes: Math.max(3, Math.min(60, Number(e.target.value) || 15)),
                  })
                }
              />
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={settings.includeStudies}
              onChange={(e) => update({ includeStudies: e.target.checked })}
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">
              Append study parameters block to every message
            </span>
          </label>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            2. Strategies Telegram may check
          </h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Only strategies marked ON are used for Telegram Live Pulse analysis. This does not
            change Nejoic paper trading or Paper Trading settings.
          </p>
          <p className="mt-2 text-[11px] font-semibold text-sky-deep">
            {selected.length} of {NEJOIC_STRATEGIES.length} ON for Telegram
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                update({ strategyIds: NEJOIC_STRATEGIES.map((s) => s.id) });
                flash('All strategies ON for Telegram');
              }}
              className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-ink/70 ring-1 ring-[#cfe0ee] hover:bg-sky-soft/50"
            >
              Turn all ON
            </button>
            {(Object.values(STRATEGY_QUICK_PRESETS) as { label: string; ids: CatalogStrategyId[] }[]).map(
              (preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    update({ strategyIds: preset.ids });
                    flash(preset.label);
                  }}
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
              onBlocked={(msg) => flash(msg)}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            3. Analysis style (Telegram pulse only)
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {NEJOIC_ANALYSIS_STYLES.map((s) => {
              const on = settings.analysisStyle === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => update({ analysisStyle: s.id as NejoicAnalysisStyle })}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    on
                      ? 'border-sky-deep bg-sky-soft/80 ring-2 ring-sky-mid/40'
                      : 'border-[#cfe0ee]'
                  }`}
                >
                  <p className="text-sm font-semibold text-sky-ink">{s.name}</p>
                  <p className="mt-1 text-[12px] text-sky-ink/55">{s.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Min confidence %
              </span>
              <input
                type="number"
                className={inputClass}
                value={settings.minConfidence}
                onChange={(e) =>
                  update({
                    minConfidence: Math.min(95, Math.max(50, Number(e.target.value) || 70)),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                HH/LL left / right bars
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  className={inputClass}
                  value={settings.leftBars}
                  onChange={(e) => update({ leftBars: Math.max(1, Number(e.target.value) || 5) })}
                />
                <input
                  type="number"
                  className={inputClass}
                  value={settings.rightBars}
                  onChange={(e) => update({ rightBars: Math.max(1, Number(e.target.value) || 5) })}
                />
              </div>
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Save className="h-4 w-4" />
            Save Telegram settings
          </button>
          {saved && <span className="text-sm font-semibold text-emerald-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
