'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Cable,
  Circle,
  ListOrdered,
  Shield,
  Unplug,
  Wallet,
} from 'lucide-react';
import { useBroker } from '@/hooks/useBroker';
import { BROKER_OPTIONS, type BrokerId } from '@/lib/broker';
import { formatCurrency } from '@/lib/utils';

export default function TerminalWorkspace() {
  const {
    ready,
    connection,
    snapshot,
    selectBroker,
    saveCredentials,
    connect,
    disconnect,
  } = useBroker();

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!ready) return;
    setApiKey(connection.apiKey);
    setApiSecret(connection.apiSecret);
    setClientId(connection.clientId);
  }, [ready, connection.brokerId, connection.apiKey, connection.apiSecret, connection.clientId]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    saveCredentials({ apiKey, apiSecret, clientId });
    setSavedMsg('Credentials saved on this device');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  function handleConnect() {
    setError('');
    saveCredentials({ apiKey, apiSecret, clientId });
    const result = connect();
    if (!result.ok) setError(result.error);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading terminal…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 2 · Terminal
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Broker Terminal
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Connect your broker keys here. Live orders and positions will plug in next — this screen
            is the control center.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee]">
          <Circle
            className={`h-2.5 w-2.5 fill-current ${
              connection.connected ? 'text-emerald-500' : 'text-rose-400'
            }`}
          />
          {connection.connected ? `${connection.label} connected` : 'Broker offline'}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wallet} label="Available" value={formatCurrency(snapshot.available)} />
        <Stat label="Margin used" value={`${snapshot.marginUsedPct}%`} />
        <Stat
          label="Day P&L"
          value={formatCurrency(snapshot.dayPnl)}
          tone={snapshot.dayPnl > 0 ? 'up' : snapshot.dayPnl < 0 ? 'down' : 'flat'}
        />
        <Stat
          icon={ListOrdered}
          label="Open positions"
          value={String(snapshot.openPositions)}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Connect broker
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-sky-ink/45">
            Keys stay on this browser only (demo). Real API login comes later.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {BROKER_OPTIONS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => selectBroker(b.id as BrokerId)}
                className={`rounded-xl px-3 py-2.5 text-left transition ring-1 ${
                  connection.brokerId === b.id
                    ? 'bg-sky-mist ring-sky-mid/40'
                    : 'bg-sky-soft/50 ring-transparent hover:bg-sky-soft'
                }`}
              >
                <p className="text-sm font-semibold text-sky-ink">{b.name}</p>
                <p className="text-[11px] text-sky-ink/45">{b.blurb}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleSave} className="mt-5 space-y-3">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            {savedMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {savedMsg}
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                API Key
              </span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={inputClass}
                placeholder="Your API key"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                API Secret
              </span>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className={inputClass}
                placeholder="Your API secret"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                Client / User ID
              </span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={inputClass}
                placeholder="Client ID"
                autoComplete="off"
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                className="rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
              >
                Save keys
              </button>
              {!connection.connected ? (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
                >
                  <Cable className="h-4 w-4" />
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={disconnect}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
                >
                  <Unplug className="h-4 w-4" />
                  Disconnect
                </button>
              )}
            </div>
          </form>
        </section>

        <div className="space-y-4 lg:col-span-3">
          <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Open positions
            </h2>
            <p className="mt-1 text-[12px] text-sky-ink/45">
              {connection.connected
                ? 'Connected — waiting for live position feed (next integration step).'
                : 'Connect a broker to load live positions.'}
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-[#b8d4e8] bg-sky-soft/40 px-4 py-10 text-center">
              <p className="text-sm font-medium text-sky-ink/60">No open positions</p>
              <Link
                href="/app/positions"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-deep hover:underline"
              >
                Positions &amp; orders page
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Quick order
            </h2>
            <p className="mt-1 text-[12px] text-sky-ink/45">
              Order ticket UI ready — live placement needs SEBI-compliant broker API wiring.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                disabled
                placeholder="Symbol (e.g. RELIANCE)"
                className={`${inputClass} opacity-60`}
              />
              <select disabled className={`${inputClass} opacity-60`}>
                <option>BUY</option>
                <option>SELL</option>
              </select>
              <input disabled placeholder="Qty" className={`${inputClass} opacity-60`} />
              <select disabled className={`${inputClass} opacity-60`}>
                <option>Market</option>
                <option>Limit</option>
                <option>SL</option>
                <option>SL-M</option>
              </select>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 w-full rounded-xl bg-sky-deep/40 py-2.5 text-sm font-semibold text-white"
            >
              Place order (coming with live API)
            </button>
          </section>

          <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-[#cfe0ee] bg-sky-soft/80 px-4 py-3.5">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-sky-deep" strokeWidth={1.75} />
            <p className="text-[13px] leading-relaxed text-sky-ink/65">
              Never share API secrets. Auto-trading in India needs proper broker approvals. We will
              connect one broker (Upstox or Zerodha) for real data in a later step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'flat',
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-sky-mid">
        {Icon && <Icon className="h-4 w-4" strokeWidth={1.75} />}
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
          {label}
        </p>
      </div>
      <p
        className={`mt-2 font-display text-xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2 disabled:cursor-not-allowed';
