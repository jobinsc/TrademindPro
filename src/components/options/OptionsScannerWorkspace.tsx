'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CandlestickChart, OctagonX, Play, Square } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import { useOptionsScannerSettings } from '@/hooks/useOptionsScannerSettings';
import {
  UNDERLYINGS,
  avgIv,
  buildDemoChain,
  calcMaxPain,
  calcPcr,
} from '@/lib/options';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import { SortableTh, useSortable } from '@/components/ui/sortable';

export default function OptionsScannerWorkspace() {
  const { ready, settings, update } = useOptionsScannerSettings();
  const [underlyingId, setUnderlyingId] = useState(UNDERLYINGS[0].id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const autoTimer = useRef<number | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    setUnderlyingId(settings.underlyingId);
  }, [ready, settings.underlyingId]);

  useEffect(() => {
    if (!ready || !settings.autoRefreshSec) {
      if (autoTimer.current) window.clearInterval(autoTimer.current);
      return;
    }
    autoTimer.current = window.setInterval(() => {
      if (!stopRef.current) setRefreshKey((k) => k + 1);
    }, settings.autoRefreshSec * 1000);
    return () => {
      if (autoTimer.current) window.clearInterval(autoTimer.current);
    };
  }, [ready, settings.autoRefreshSec]);

  const underlying = UNDERLYINGS.find((u) => u.id === underlyingId) || UNDERLYINGS[0];

  const chain = useMemo(() => buildDemoChain(underlying), [underlying, refreshKey]);
  const filteredChain = useMemo(() => {
    const half = settings.strikeRange;
    const mid = Math.floor(chain.length / 2);
    const sliced = chain.slice(Math.max(0, mid - half), Math.min(chain.length, mid + half + 1));
    return sliced.filter(
      (r) =>
        r.ceOi >= settings.minOi &&
        r.peOi >= settings.minOi &&
        r.ceIv >= settings.minIv &&
        r.peIv >= settings.minIv
    );
  }, [chain, settings.minOi, settings.minIv, settings.strikeRange]);

  const pcr = useMemo(() => calcPcr(filteredChain.length ? filteredChain : chain), [filteredChain, chain]);
  const maxPain = useMemo(() => calcMaxPain(filteredChain.length ? filteredChain : chain), [filteredChain, chain]);
  const iv = useMemo(() => avgIv(filteredChain.length ? filteredChain : chain), [filteredChain, chain]);
  const atm = (filteredChain.length ? filteredChain : chain)[Math.floor((filteredChain.length || chain.length) / 2)]?.strike;

  async function handleRefresh() {
    setRefreshing(true);
    stopRef.current = false;
    await new Promise((r) => window.setTimeout(r, 400));
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  }

  function handleStopRefresh() {
    stopRef.current = true;
    setRefreshing(false);
    update({ autoRefreshSec: 0 });
  }

  function handleForceStop() {
    stopRef.current = true;
    setRefreshing(false);
    if (autoTimer.current) window.clearInterval(autoTimer.current);
    update({ autoRefreshSec: 0 });
  }

  const { sorted: displayChain, sort, toggle } = useSortable(
    filteredChain.length ? filteredChain : chain,
    (row, key) => {
      switch (key) {
        case 'ceLtp':
          return row.ceLtp;
        case 'ceOi':
          return row.ceOi;
        case 'ceOiChange':
          return row.ceOiChange;
        case 'ceIv':
          return row.ceIv;
        case 'strike':
          return row.strike;
        case 'peIv':
          return row.peIv;
        case 'peOiChange':
          return row.peOiChange;
        case 'peOi':
          return row.peOi;
        case 'peLtp':
          return row.peLtp;
        default:
          return 0;
      }
    },
    { key: 'strike', dir: 'asc' }
  );

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50">
        Loading options scanner…
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 3 · Options
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Options Scanner
            </h1>
            <InfoBubble title="About Options Scanner">
              Options chain, PCR, max pain, and IV — demo data for now. Live NSE F&amp;O feed comes
              later.
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleSettingsButton
            open={settings.settingsOpen}
            onToggle={() => update({ settingsOpen: !settings.settingsOpen })}
          />
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee]">
            <CandlestickChart className="h-3.5 w-3.5 text-sky-deep" strokeWidth={1.75} />
            Expiry {underlying.expiry}
          </div>
        </div>
      </div>

      <ModuleSettingsPanel
        open={settings.settingsOpen}
        title="Options scanner settings"
        description="Underlying, OI/IV filters, strike range, and auto-refresh — isolated to this tab."
        controls={
          <>
            <ModuleRunButton variant="start" onClick={() => void handleRefresh()} disabled={refreshing}>
              <Play className="h-4 w-4" />
              {refreshing ? 'Refreshing…' : 'Refresh chain'}
            </ModuleRunButton>
            <ModuleRunButton variant="stop" onClick={handleStopRefresh} disabled={!refreshing && !settings.autoRefreshSec}>
              <Square className="h-4 w-4" />
              Stop refresh
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={handleForceStop}>
              <OctagonX className="h-4 w-4" />
              Force stop
            </ModuleRunButton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Default underlying
            </span>
            <select
              value={underlyingId}
              onChange={(e) => {
                setUnderlyingId(e.target.value);
                update({ underlyingId: e.target.value });
              }}
              className={inputClass}
            >
              {UNDERLYINGS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Min OI (CE & PE)
            </span>
            <input
              type="number"
              min={0}
              value={settings.minOi}
              onChange={(e) => update({ minOi: Number(e.target.value) || 0 })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Min IV %
            </span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={settings.minIv}
              onChange={(e) => update({ minIv: Number(e.target.value) || 0 })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Strike range (± rows)
            </span>
            <input
              type="number"
              min={3}
              max={30}
              value={settings.strikeRange}
              onChange={(e) => update({ strikeRange: Number(e.target.value) || 10 })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Auto-refresh (seconds, 0 = off)
            </span>
            <input
              type="number"
              min={0}
              step={5}
              value={settings.autoRefreshSec}
              onChange={(e) => update({ autoRefreshSec: Number(e.target.value) || 0 })}
              className={inputClass}
            />
          </label>
        </div>
      </ModuleSettingsPanel>

      <div className="mt-6 flex flex-wrap gap-2">
        {UNDERLYINGS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              setUnderlyingId(u.id);
              update({ underlyingId: u.id });
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              underlyingId === u.id
                ? 'bg-sky-deep text-white'
                : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee] hover:text-sky-ink'
            }`}
          >
            {u.symbol}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Spot" value={formatCurrency(underlying.spot)} />
        <Stat
          label="Change"
          value={formatPercent(underlying.changePct)}
          tone={underlying.changePct >= 0 ? 'up' : 'down'}
        />
        <Stat label="PCR (OI)" value={pcr.toFixed(2)} />
        <Stat label="Max pain" value={formatNumber(maxPain)} />
        <Stat label="Avg IV" value={`${iv}%`} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        <div className="border-b border-[#e8f2fa] px-4 py-3">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Options chain · {underlying.name}
          </h2>
          <p className="text-[12px] text-sky-ink/45">
            CE (calls) left · PE (puts) right · ATM near {atm != null ? formatNumber(atm) : '—'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e8f2fa] bg-sky-soft/60">
                <SortableTh
                  label="CE LTP"
                  className="px-3 py-2.5"
                  active={sort.key === 'ceLtp'}
                  dir={sort.dir}
                  onClick={() => toggle('ceLtp')}
                />
                <SortableTh
                  label="CE OI"
                  className="px-3 py-2.5"
                  active={sort.key === 'ceOi'}
                  dir={sort.dir}
                  onClick={() => toggle('ceOi')}
                />
                <SortableTh
                  label="OI Chg"
                  className="px-3 py-2.5"
                  active={sort.key === 'ceOiChange'}
                  dir={sort.dir}
                  onClick={() => toggle('ceOiChange')}
                />
                <SortableTh
                  label="CE IV"
                  className="px-3 py-2.5"
                  active={sort.key === 'ceIv'}
                  dir={sort.dir}
                  onClick={() => toggle('ceIv')}
                />
                <SortableTh
                  label="Strike"
                  className="px-3 py-2.5 text-center"
                  active={sort.key === 'strike'}
                  dir={sort.dir}
                  onClick={() => toggle('strike')}
                />
                <SortableTh
                  label="PE IV"
                  className="px-3 py-2.5"
                  active={sort.key === 'peIv'}
                  dir={sort.dir}
                  onClick={() => toggle('peIv')}
                />
                <SortableTh
                  label="OI Chg"
                  className="px-3 py-2.5"
                  active={sort.key === 'peOiChange'}
                  dir={sort.dir}
                  onClick={() => toggle('peOiChange')}
                />
                <SortableTh
                  label="PE OI"
                  className="px-3 py-2.5"
                  active={sort.key === 'peOi'}
                  dir={sort.dir}
                  onClick={() => toggle('peOi')}
                />
                <SortableTh
                  label="PE LTP"
                  className="px-3 py-2.5"
                  active={sort.key === 'peLtp'}
                  dir={sort.dir}
                  onClick={() => toggle('peLtp')}
                />
              </tr>
            </thead>
            <tbody>
              {displayChain.map((row) => {
                const isAtm = row.strike === atm;
                return (
                  <tr
                    key={row.strike}
                    className={`border-b border-[#e8f2fa] last:border-0 ${
                      isAtm ? 'bg-sky-mist/50' : 'hover:bg-sky-soft/40'
                    }`}
                  >
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/80">
                      {row.ceLtp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/65">
                      {formatCompact(row.ceOi)}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums font-medium ${
                        row.ceOiChange >= 0 ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {formatCompact(row.ceOiChange)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/65">
                      {row.ceIv.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-sky-ink">
                      {formatNumber(row.strike)}
                      {isAtm && (
                        <span className="ml-1 text-[9px] font-bold uppercase text-sky-deep">
                          ATM
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/65">
                      {row.peIv.toFixed(1)}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums font-medium ${
                        row.peOiChange >= 0 ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {formatCompact(row.peOiChange)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/65">
                      {formatCompact(row.peOi)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-sky-ink/80">
                      {row.peLtp.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Insight
          title="PCR read"
          text={
            pcr > 1.1
              ? 'PCR above 1 — relatively more put OI (often cautious / support bias in popular view).'
              : pcr < 0.9
                ? 'PCR below 1 — relatively more call OI (often bullish positioning in popular view).'
                : 'PCR near 1 — balanced put/call open interest.'
          }
        />
        <Insight
          title="Max pain"
          text={`Estimated max pain near ${formatNumber(maxPain)}. Spot is ${formatCurrency(underlying.spot)}.`}
        />
        <Insight
          title="Next"
          text="Unusual options activity and Greeks viewer will expand here after live F&O data."
        />
      </div>

      <p className="mt-5 text-[12px] text-sky-ink/45">
        Demo chain only — not for live trading decisions.{' '}
        <Link href="/app/scanner" className="font-semibold text-sky-deep hover:underline">
          Stock Scanner
          <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs}`;
}

function Stat({
  label,
  value,
  tone = 'flat',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p
        className={`mt-1.5 font-display text-xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-500' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Insight({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
      <p className="font-display text-sm font-semibold text-sky-ink">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-sky-ink/60">{text}</p>
    </div>
  );
}
