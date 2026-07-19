'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LineChart, Save } from 'lucide-react';
import { useJimbo } from '@/hooks/useJimbo';
import {
  defaultJimboSettings,
  JIMBO_NAME,
  JIMBO_UNIVERSE,
  type JimboSettings,
} from '@/lib/jimbo';
import { getReturnPath } from '@/lib/nav-return';
import BackToLink from '@/components/ui/BackToLink';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export default function JimboSettingsWorkspace() {
  const router = useRouter();
  const { ready, settings, updateSettings } = useJimbo();
  const [form, setForm] = useState<JimboSettings>(defaultJimboSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setForm({ ...defaultJimboSettings(), ...settings });
  }, [ready, settings]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16 text-center text-sm text-sky-ink/50">
        Loading {JIMBO_NAME} settings…
      </div>
    );
  }

  function setNum<K extends keyof JimboSettings>(key: K, value: string) {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setForm((f) => ({ ...f, [key]: n }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateSettings({
      dailyProfitTarget: Math.max(100, form.dailyProfitTarget),
      dailyMaxLoss: Math.max(100, form.dailyMaxLoss),
      cciPeriod: Math.min(50, Math.max(5, Math.floor(form.cciPeriod))),
      maxLiquidityRank: Math.min(
        JIMBO_UNIVERSE.length,
        Math.max(1, Math.floor(form.maxLiquidityRank))
      ),
      minConfidence: Math.min(95, Math.max(50, Math.floor(form.minConfidence))),
      requirePaConfirm: form.requirePaConfirm,
      tradeOnlyWhenMarketOpen: form.tradeOnlyWhenMarketOpen,
      maxLotsPerTrade: Math.min(3, Math.max(1, Math.floor(form.maxLotsPerTrade))),
      mode: 'paper',
    });
    setSaved(true);
    const from = new URLSearchParams(window.location.search).get('from');
    const back = getReturnPath('/app/jimbo', from);
    setTimeout(() => router.push(back), 450);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-7 md:px-8 md:py-9">
      <BackToLink fallback="/app/jimbo" label={`Back to ${JIMBO_NAME}`} />

      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft text-sky-deep">
          <LineChart className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Heart agent · unique config
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            {JIMBO_NAME} Settings
          </h1>
          <p className="mt-2 text-sm text-sky-ink/60">
            Liquid stock options · CCI zero-cross + PA. Separate from Nejoic.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Daily risk (stocks)
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Profit target (₹)
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.dailyProfitTarget}
                onChange={(e) => setNum('dailyProfitTarget', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Max loss (₹)
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.dailyMaxLoss}
                onChange={(e) => setNum('dailyMaxLoss', e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">CCI engine</h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Cross above 0 → ATM CE · Cross below 0 → ATM PE (after PA when required).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                CCI period
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.cciPeriod}
                onChange={(e) => setNum('cciPeriod', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Min confidence (%)
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.minConfidence}
                onChange={(e) => setNum('minConfidence', e.target.value)}
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.requirePaConfirm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requirePaConfirm: e.target.checked }))
                }
                className="h-4 w-4 accent-sky-deep"
              />
              <span>
                <strong className="text-sky-ink">Require price-action confirm</strong>
                <span className="mt-0.5 block text-[12px] text-sky-ink/50">
                  After CCI zero-cross, wait for PA before CE/PE
                </span>
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Liquidity &amp; session
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Max liquidity rank (1 = most liquid, up to {JIMBO_UNIVERSE.length})
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.maxLiquidityRank}
                onChange={(e) => setNum('maxLiquidityRank', e.target.value)}
              />
              <span className="mt-1 block text-[11px] text-sky-ink/45">
                Example: 10 = only top 10 most liquid F&O names
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Max lots / trade
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.maxLotsPerTrade}
                onChange={(e) => setNum('maxLotsPerTrade', e.target.value)}
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.tradeOnlyWhenMarketOpen}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tradeOnlyWhenMarketOpen: e.target.checked }))
                }
                className="h-4 w-4 accent-sky-deep"
              />
              <span>
                <strong className="text-sky-ink">Trade only when NSE is open</strong>
                <span className="mt-0.5 block text-[12px] text-sky-ink/50">
                  09:15–15:30 IST · scans still allowed when closed
                </span>
              </span>
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Save className="h-4 w-4" />
            Save Jimbo settings
          </button>
          {saved && (
            <span className="text-sm font-semibold text-emerald-600">Saved</span>
          )}
          <Link
            href="/app/nejoic/settings?from=%2Fapp%2Fjimbo%2Fsettings"
            className="text-sm font-semibold text-sky-ink/45 hover:text-sky-deep"
          >
            Open Nejoic settings →
          </Link>
        </div>
      </form>
    </div>
  );
}
