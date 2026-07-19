'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { useNejoic } from '@/hooks/useNejoic';
import { defaultNejoicSettings, NEJOIC_NAME, type NejoicSettings } from '@/lib/nejoic';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

export default function NejoicSettingsWorkspace() {
  const { ready, settings, updateSettings } = useNejoic();
  const [form, setForm] = useState<NejoicSettings>(defaultNejoicSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setForm({ ...defaultNejoicSettings(), ...settings });
  }, [ready, settings]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16 text-center text-sm text-sky-ink/50">
        Loading {NEJOIC_NAME} settings…
      </div>
    );
  }

  function setNum<K extends keyof NejoicSettings>(key: K, value: string) {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setForm((f) => ({ ...f, [key]: n }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateSettings({
      dailyProfitTarget: Math.max(100, form.dailyProfitTarget),
      dailyMaxLoss: Math.max(100, form.dailyMaxLoss),
      lotSize: Math.max(1, Math.floor(form.lotSize)),
      maxLotsPerTrade: Math.min(5, Math.max(1, Math.floor(form.maxLotsPerTrade))),
      leftBars: Math.min(20, Math.max(1, Math.floor(form.leftBars))),
      rightBars: Math.min(20, Math.max(1, Math.floor(form.rightBars))),
      minConfidence: Math.min(95, Math.max(50, Math.floor(form.minConfidence))),
      setupStyle: form.setupStyle,
      mode: 'paper',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-7 md:px-8 md:py-9">
      <Link
        href="/app/nejoic"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {NEJOIC_NAME}
      </Link>

      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft text-sky-deep">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Heart agent · unique config
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            {NEJOIC_NAME} Settings
          </h1>
          <p className="mt-2 text-sm text-sky-ink/60">
            Nifty options · plain-chart HH/HL/LH/LL only. Separate from Jimbo.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-8 space-y-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Daily risk (Nifty)</h2>
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
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">
            Price action (your Pine)
          </h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            Left / Right bars = pivot confirmation — same as TradingView lb / rb.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Left bars
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.leftBars}
                onChange={(e) => setNum('leftBars', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Right bars
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.rightBars}
                onChange={(e) => setNum('rightBars', e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Setup style
              </span>
              <select
                className={inputClass}
                value={form.setupStyle}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    setupStyle: e.target.value as NejoicSettings['setupStyle'],
                  }))
                }
              >
                <option value="strict_hl_lh">Strict — only HL→CE / LH→PE</option>
                <option value="balanced">Balanced — allow HH/LL continuation ideas</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
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
          </div>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Nifty options size</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Lot size
              </span>
              <input
                type="number"
                className={inputClass}
                value={form.lotSize}
                onChange={(e) => setNum('lotSize', e.target.value)}
              />
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
          </div>
          <p className="mt-3 text-[12px] text-sky-ink/45">
            Mode stays paper until live broker orders are enabled for Nejoic.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
          >
            <Save className="h-4 w-4" />
            Save Nejoic settings
          </button>
          {saved && (
            <span className="text-sm font-semibold text-emerald-600">Saved</span>
          )}
          <Link href="/app/jimbo/settings" className="text-sm font-semibold text-sky-ink/45 hover:text-sky-deep">
            Open Jimbo settings →
          </Link>
        </div>
      </form>
    </div>
  );
}
