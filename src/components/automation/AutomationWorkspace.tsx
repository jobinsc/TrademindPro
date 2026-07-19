'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Circle, Play, Shield, Square } from 'lucide-react';
import { useAutomation } from '@/hooks/useAutomation';
import { useStrategies } from '@/hooks/useStrategies';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useBroker } from '@/hooks/useBroker';
import InfoBubble from '@/components/ui/InfoBubble';
import FullStopBar from '@/components/trading/FullStopBar';
import type { Strategy } from '@/lib/strategies';

function statusLabel(status: string) {
  if (status === 'running') return 'RUNNING';
  if (status === 'ready') return 'ON';
  if (status === 'paused') return 'STOPPED';
  return status.toUpperCase();
}

function strategyStatusLabel(status: Strategy['status']) {
  if (status === 'ready' || status === 'live') return 'On';
  if (status === 'paused') return 'Stopped';
  return 'Draft';
}

export default function AutomationWorkspace() {
  const { ready, config, events, setStatus, update } = useAutomation();
  const { strategies, ready: stratReady, update: updateStrategy } = useStrategies();
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
        Loading…
      </div>
    );
  }

  const blockedByRisk = settings.emergencyStop;
  const isOn = config.status === 'running' || config.status === 'ready';
  const statusColor = isOn
    ? 'text-emerald-500'
    : config.status === 'paused'
      ? 'text-rose-500'
      : 'text-sky-ink/40';

  function startAll() {
    if (blockedByRisk) {
      alert('FULL STOP / emergency stop is ON in Risk. Turn it off first.');
      return;
    }
    if (!strategyId) {
      alert('Pick a strategy first');
      return;
    }
    const s = strategies.find((x) => x.id === strategyId);
    if (s && (s.status === 'draft' || s.status === 'paused')) {
      updateStrategy(s.id, { ...s, status: 'ready' });
    }
    update(
      { strategyId, status: 'running' },
      `Started (${config.paperMode ? 'paper' : 'live'} mode)`
    );
  }

  function stopAll() {
    setStatus('paused', 'Stopped');
  }

  function startStrategy(s: Strategy) {
    if (blockedByRisk) {
      alert('FULL STOP is ON — turn it off in Risk first.');
      return;
    }
    updateStrategy(s.id, { ...s, status: 'ready' });
    update(
      { strategyId: s.id, status: 'running' },
      `Started strategy: ${s.name}`
    );
    setStrategyId(s.id);
  }

  function stopStrategy(s: Strategy) {
    updateStrategy(s.id, { ...s, status: 'paused' });
    if (config.strategyId === s.id) {
      setStatus('paused', `Stopped strategy: ${s.name}`);
    } else {
      update({}, `Stopped strategy: ${s.name}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 4 · Start / Stop
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Start / Stop
            </h1>
            <InfoBubble title="About Start / Stop">
              Start or stop auto trading. Use paper mode first. If anything goes wrong, hit FULL STOP.
            </InfoBubble>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee] ${statusColor}`}
        >
          <Circle className="h-2.5 w-2.5 fill-current" />
          {statusLabel(config.status)}
        </div>
      </div>

      <div className="mt-5">
        <FullStopBar />
      </div>

      {blockedByRisk && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          FULL STOP / emergency stop is ON — you cannot start until you turn it off.{' '}
          <Link href="/app/risk" className="font-semibold underline">
            Open Risk
          </Link>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-[#16384f] px-4 py-3 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startAll}
            disabled={blockedByRisk}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1.5">
              <Play className="h-4 w-4" /> Start
            </span>
          </button>
          <button
            type="button"
            onClick={stopAll}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400"
          >
            <span className="inline-flex items-center gap-1.5">
              <Square className="h-4 w-4" /> Stop
            </span>
          </button>
          <span className="ml-auto text-xs text-white/60">
            Broker: {connection.connected ? connection.label : 'offline'}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="space-y-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-2">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Settings</h2>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
              Main strategy
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
                    {s.name} ({strategyStatusLabel(s.status)})
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
            Live broker orders are not enabled yet. Start / Stop only updates status and logs.
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-3">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Each strategy — Start / Stop
          </h2>
          {strategies.length === 0 ? (
            <p className="mt-4 text-sm text-sky-ink/50">No strategies yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {strategies.map((s) => {
                const on = s.status === 'ready' || s.status === 'live';
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-soft/60 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sky-ink">{s.name}</p>
                      <p className="text-[11px] text-sky-ink/45">
                        {s.market} · {s.timeframe} · {strategyStatusLabel(s.status)}
                        {config.strategyId === s.id && isOn ? ' · active' : ''}
                      </p>
                    </div>
                    {on ? (
                      <button
                        type="button"
                        onClick={() => stopStrategy(s)}
                        className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-600"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startStrategy(s)}
                        disabled={blockedByRisk}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        Start
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-6 font-display text-[15px] font-semibold text-sky-ink">Event feed</h2>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-sky-ink/50">No events yet — press Start or Stop.</p>
          ) : (
            <ul className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
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
