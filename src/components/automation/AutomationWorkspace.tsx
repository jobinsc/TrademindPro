'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Circle, OctagonX, Pause, Shield, Zap } from 'lucide-react';
import { useAutomation } from '@/hooks/useAutomation';
import { useStrategies } from '@/hooks/useStrategies';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useBroker } from '@/hooks/useBroker';

export default function AutomationWorkspace() {
  const { ready, config, events, setStatus, update } = useAutomation();
  const { strategies, ready: stratReady } = useStrategies();
  const { settings } = useRiskSettings();
  const { connection } = useBroker();
  const [strategyId, setStrategyId] = useState('');

  useEffect(() => {
    if (config.strategyId) setStrategyId(config.strategyId);
    else if (strategies[0]) setStrategyId(strategies[0].id);
  }, [config.strategyId, strategies]);

  if (!ready || !stratReady) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading automation…
      </div>
    );
  }

  const blockedByRisk = settings.emergencyStop;
  const statusColor =
    config.status === 'running'
      ? 'text-emerald-500'
      : config.status === 'ready'
        ? 'text-amber-500'
        : 'text-sky-ink/40';

  function makeReady() {
    if (blockedByRisk) {
      alert('Emergency stop is ON in Risk Management. Release it first.');
      return;
    }
    if (!strategyId) {
      alert('Select a strategy first');
      return;
    }
    update(
      { strategyId, status: 'ready' },
      `Strategy set to Ready (${config.paperMode ? 'paper' : 'live'} mode)`
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 4 · Automation
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Auto Execution
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Set a strategy to Ready, run in paper mode first, and keep risk limits on. Live broker
            orders stay disabled until API wiring + compliance.
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee] ${statusColor}`}
        >
          <Circle className="h-2.5 w-2.5 fill-current" />
          {config.status.toUpperCase()}
        </div>
      </div>

      {blockedByRisk && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Risk emergency stop is ON — automation cannot go Ready.{' '}
          <Link href="/app/risk" className="font-semibold underline">
            Open Risk
          </Link>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-[#16384f] px-4 py-3 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatus('paused', 'Automation paused')}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-1">
              <Pause className="h-3.5 w-3.5" /> Pause
            </span>
          </button>
          <button
            type="button"
            onClick={makeReady}
            className="rounded-lg bg-sky-mid px-3 py-1.5 text-xs font-semibold hover:bg-[#4a96cb]"
          >
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Ready
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (config.status === 'ready' || config.status === 'running') {
                setStatus('running', 'Automation marked running (demo — no live orders)');
              } else {
                alert('Set strategy to Ready first');
              }
            }}
            className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Run (demo)
          </button>
          <button
            type="button"
            onClick={() => setStatus('paused', 'Halt — automation force paused')}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#16384f] hover:bg-amber-300"
          >
            <span className="inline-flex items-center gap-1">
              <OctagonX className="h-3.5 w-3.5" /> Halt
            </span>
          </button>
          <span className="ml-auto text-xs text-white/60">
            Broker: {connection.connected ? connection.label : 'offline'}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="space-y-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-2">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Config</h2>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
              Strategy
            </span>
            {strategies.length === 0 ? (
              <p className="text-sm text-sky-ink/55">
                <Link href="/app/strategies" className="font-semibold text-sky-deep hover:underline">
                  Create a strategy
                </Link>{' '}
                first
              </p>
            ) : (
              <select
                value={strategyId}
                onChange={(e) => {
                  setStrategyId(e.target.value);
                  update({ strategyId: e.target.value }, `Strategy selected`);
                }}
                className={inputClass}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={config.paperMode}
              onChange={(e) =>
                update(
                  { paperMode: e.target.checked },
                  e.target.checked
                    ? 'Switched to paper mode'
                    : 'Switched to live mode flag (orders still demo)'
                )
              }
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">Paper mode (recommended)</span>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={config.respectRiskLimits}
              onChange={(e) =>
                update(
                  { respectRiskLimits: e.target.checked },
                  e.target.checked
                    ? 'Risk limits enabled'
                    : 'Risk limits disabled (not recommended)'
                )
              }
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">Respect Risk Management limits</span>
          </label>

          <div className="flex items-start gap-2 rounded-xl bg-sky-soft/80 px-3 py-3 text-[12px] text-sky-ink/65">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-sky-deep" />
            Live broker order placement is not enabled yet. Ready / Run only updates status and
            logs.
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-3">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Event feed</h2>
          {events.length === 0 ? (
            <p className="mt-6 text-sm text-sky-ink/50">
              No events yet — set Ready or Pause to generate logs.
            </p>
          ) : (
            <ul className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 rounded-xl bg-sky-soft/60 px-3 py-2 text-sm">
                  <span className="shrink-0 font-mono text-[11px] text-sky-ink/40">{e.time}</span>
                  <span className="text-sky-ink/75">{e.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-5 text-[12px] text-sky-ink/45">
        Related:{' '}
        <Link href="/app/ai" className="font-semibold text-sky-deep hover:underline">
          AI Agents
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';
