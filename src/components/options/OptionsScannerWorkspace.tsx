'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CandlestickChart } from 'lucide-react';
import {
  UNDERLYINGS,
  avgIv,
  buildDemoChain,
  calcMaxPain,
  calcPcr,
} from '@/lib/options';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

export default function OptionsScannerWorkspace() {
  const [underlyingId, setUnderlyingId] = useState(UNDERLYINGS[0].id);
  const underlying = UNDERLYINGS.find((u) => u.id === underlyingId) || UNDERLYINGS[0];

  const chain = useMemo(() => buildDemoChain(underlying), [underlying]);
  const pcr = useMemo(() => calcPcr(chain), [chain]);
  const maxPain = useMemo(() => calcMaxPain(chain), [chain]);
  const iv = useMemo(() => avgIv(chain), [chain]);
  const atm = chain[Math.floor(chain.length / 2)]?.strike;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 3 · Options
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            Options Scanner
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Options chain, PCR, max pain, and IV — demo data for now. Live NSE F&amp;O feed comes
            later.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#cfe0ee]">
          <CandlestickChart className="h-3.5 w-3.5 text-sky-deep" strokeWidth={1.75} />
          Expiry {underlying.expiry}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {UNDERLYINGS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setUnderlyingId(u.id)}
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
              <tr className="border-b border-[#e8f2fa] bg-sky-soft/60 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                <th className="px-3 py-2.5 text-emerald-700">CE LTP</th>
                <th className="px-3 py-2.5 text-emerald-700">CE OI</th>
                <th className="px-3 py-2.5 text-emerald-700">OI Chg</th>
                <th className="px-3 py-2.5 text-emerald-700">CE IV</th>
                <th className="px-3 py-2.5 text-center text-sky-ink">Strike</th>
                <th className="px-3 py-2.5 text-rose-600">PE IV</th>
                <th className="px-3 py-2.5 text-rose-600">OI Chg</th>
                <th className="px-3 py-2.5 text-rose-600">PE OI</th>
                <th className="px-3 py-2.5 text-rose-600">PE LTP</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((row) => {
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
