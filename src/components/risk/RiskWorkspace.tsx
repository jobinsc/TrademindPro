'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  OctagonX,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useBroker } from '@/hooks/useBroker';
import {
  defaultRiskSettings,
  evaluateRisk,
  suggestedPositionSize,
  type RiskSettings,
} from '@/lib/risk';
import { formatCurrency } from '@/lib/utils';

export default function RiskWorkspace() {
  const { settings, ready, save, toggleEmergency, resetDefaults } = useRiskSettings();
  const { snapshot, connection } = useBroker();
  const [form, setForm] = useState<RiskSettings>(defaultRiskSettings());
  const [hydrated, setHydrated] = useState(false);
  const [stopDistance, setStopDistance] = useState(10);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!ready) return;
    setForm(settings);
    setHydrated(true);
  }, [ready, settings]);

  const live = {
    dayPnl: snapshot.dayPnl,
    openPositions: snapshot.openPositions,
    marginUsedPct: snapshot.marginUsedPct,
  };

  const checks = useMemo(() => evaluateRisk(form, live), [
    form,
    live.dayPnl,
    live.openPositions,
    live.marginUsedPct,
  ]);

  const size = useMemo(
    () => suggestedPositionSize(form, stopDistance),
    [form, stopDistance]
  );

  const allOk = checks.every((c) => c.ok) && !form.emergencyStop;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    save(form);
    setSavedMsg('Risk settings saved');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  if (!ready || !hydrated) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading risk controls…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 4 · Risk
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Risk Management
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Set hard limits that protect capital. These rules will gate automation when live trading
            is connected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            toggleEmergency();
            setForm((prev) => ({ ...prev, emergencyStop: !prev.emergencyStop }));
          }}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition ${
            form.emergencyStop
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-rose-500 hover:bg-rose-600'
          }`}
        >
          <OctagonX className="h-4 w-4" />
          {form.emergencyStop ? 'Release emergency stop' : 'Emergency stop all'}
        </button>
      </div>

      {form.emergencyStop && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-800">
            Emergency stop is <strong>ON</strong>. New orders / automation should stay blocked until
            you release it.
          </p>
        </div>
      )}

      {savedMsg && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {savedMsg}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-3"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">Risk limits</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trading capital (₹)">
              <input
                type="number"
                min={0}
                value={form.capital || ''}
                onChange={(e) => setForm({ ...form, capital: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Risk % per trade">
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={form.riskPercentPerTrade || ''}
                onChange={(e) =>
                  setForm({ ...form, riskPercentPerTrade: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max loss per trade (₹)">
              <input
                type="number"
                min={0}
                value={form.maxLossPerTrade || ''}
                onChange={(e) =>
                  setForm({ ...form, maxLossPerTrade: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max loss per day (₹)">
              <input
                type="number"
                min={0}
                value={form.maxLossPerDay || ''}
                onChange={(e) => setForm({ ...form, maxLossPerDay: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Max open positions">
              <input
                type="number"
                min={1}
                max={50}
                value={form.maxOpenPositions || ''}
                onChange={(e) =>
                  setForm({ ...form, maxOpenPositions: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max margin use (%)">
              <input
                type="number"
                min={1}
                max={100}
                value={form.maxMarginUtilization || ''}
                onChange={(e) =>
                  setForm({ ...form, maxMarginUtilization: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={form.autoDisableOnDayLoss}
              onChange={(e) =>
                setForm({ ...form, autoDisableOnDayLoss: e.target.checked })
              }
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">
              Auto-disable trading if daily loss limit is hit
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
            <input
              type="checkbox"
              checked={form.trailingSlEnabled}
              onChange={(e) => setForm({ ...form, trailingSlEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
            />
            <span className="text-sm text-sky-ink">Enable trailing stop-loss automation</span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Save settings
            </button>
            <button
              type="button"
              onClick={() => {
                const defaults = defaultRiskSettings();
                resetDefaults();
                setForm(defaults);
              }}
              className="rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
            >
              Reset defaults
            </button>
          </div>
        </form>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
            <div className="flex items-center gap-2">
              {allOk ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
              )}
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Risk now</h2>
            </div>
            <p className="mt-1 text-[12px] text-sky-ink/45">
              Broker: {connection.connected ? connection.label : 'Offline'} · Day P&L{' '}
              {formatCurrency(live.dayPnl)}
            </p>
            <ul className="mt-4 space-y-2">
              {checks.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-xl px-3 py-2.5 text-sm ${
                    c.ok ? 'bg-sky-soft/70' : 'bg-rose-50'
                  }`}
                >
                  <p className={`font-semibold ${c.ok ? 'text-sky-ink' : 'text-rose-700'}`}>
                    {c.label}
                  </p>
                  <p className={`mt-0.5 text-[12px] ${c.ok ? 'text-sky-ink/55' : 'text-rose-600'}`}>
                    {c.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Position size calculator
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-sky-ink/45">
              Based on capital, risk %, and stop distance
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                Stop distance (₹ per share)
              </span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={stopDistance || ''}
                onChange={(e) => setStopDistance(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <div className="mt-4 rounded-xl bg-sky-soft px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
                Suggested qty
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">{size}</p>
              <p className="mt-1 text-[12px] text-sky-ink/55">
                Risk amount ≈{' '}
                {formatCurrency(
                  Math.min(
                    form.maxLossPerTrade,
                    (form.capital * form.riskPercentPerTrade) / 100
                  )
                )}
              </p>
            </div>
          </section>
        </div>
      </div>

      <p className="mt-5 text-[12px] text-sky-ink/45">
        These limits will connect to Auto Execution next.{' '}
        <Link href="/app/terminal" className="font-semibold text-sky-deep hover:underline">
          Broker Terminal
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 focus:ring-2';
