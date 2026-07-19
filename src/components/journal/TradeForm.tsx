'use client';

import { useMemo, useState } from 'react';
import {
  EMOTIONS,
  SEGMENTS,
  STRATEGIES,
  calcPnL,
  todayISO,
  type TradeInput,
  type TradeSide,
  type TradeSegment,
  type TradeEmotion,
} from '@/lib/trades';
import { formatCurrency } from '@/lib/utils';

export default function TradeForm({
  initial,
  onSubmit,
  onCancel,
  mode = 'full',
}: {
  initial: TradeInput;
  onSubmit: (input: TradeInput) => void;
  onCancel: () => void;
  /** "close" = only ask for exit details on an open position */
  mode?: 'full' | 'close';
}) {
  const maxDate = todayISO();
  const alreadyClosed = initial.exitPrice != null && initial.exitPrice > 0;
  const [isClosed, setIsClosed] = useState(mode === 'close' || alreadyClosed);
  const [form, setForm] = useState<TradeInput>(() => ({
    ...initial,
    exitDate: initial.exitDate || (mode === 'close' ? maxDate : initial.exitDate),
  }));

  const previewPnL = useMemo(() => {
    if (!isClosed || !form.exitPrice) return null;
    return calcPnL({ ...form, exitPrice: form.exitPrice });
  }, [form, isClosed]);

  function set<K extends keyof TradeInput>(key: K, value: TradeInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClosedToggle(checked: boolean) {
    setIsClosed(checked);
    if (!checked) {
      setForm((prev) => ({ ...prev, exitPrice: null, exitDate: null }));
    } else {
      setForm((prev) => ({
        ...prev,
        exitDate: prev.exitDate || maxDate,
      }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.symbol.trim()) {
      alert('Please enter a symbol (e.g. RELIANCE)');
      return;
    }
    if (form.qty <= 0 || form.entryPrice <= 0) {
      alert('Qty and entry price must be greater than 0');
      return;
    }
    if (form.tradeDate > maxDate) {
      alert('Entry date cannot be in the future');
      return;
    }

    if (isClosed) {
      if (!form.exitPrice || form.exitPrice <= 0) {
        alert('Enter the exit / sell price to close this trade');
        return;
      }
      if (!form.exitDate) {
        alert('Enter the exit / sell date');
        return;
      }
      if (form.exitDate > maxDate) {
        alert('Exit date cannot be in the future');
        return;
      }
      if (form.exitDate < form.tradeDate) {
        alert('Exit date cannot be before the entry date');
        return;
      }
    }

    onSubmit({
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      exitPrice: isClosed ? form.exitPrice : null,
      exitDate: isClosed ? form.exitDate : null,
    });
  }

  const readOnlyEntry = mode === 'close';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'full' && (
        <p className="rounded-xl bg-sky-soft px-3 py-2.5 text-[13px] leading-relaxed text-sky-ink/65">
          Bought today and still holding? Leave it <strong className="font-semibold text-sky-ink">Open</strong>.
          Add exit only when you sell (profit, stop-loss, or target). You can log the same stock again at a different price anytime.
        </p>
      )}

      {mode === 'close' && (
        <p className="rounded-xl bg-sky-soft px-3 py-2.5 text-[13px] leading-relaxed text-sky-ink/65">
          Closing <strong className="font-semibold text-sky-ink">{form.symbol}</strong> — enter the sell / exit price and date when you exited.
        </p>
      )}

      <Field label="Symbol">
        <input
          value={form.symbol}
          onChange={(e) => set('symbol', e.target.value.toUpperCase())}
          placeholder="RELIANCE"
          className={inputClass}
          required
          readOnly={readOnlyEntry}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Side">
          <select
            value={form.side}
            onChange={(e) => set('side', e.target.value as TradeSide)}
            className={inputClass}
            disabled={readOnlyEntry}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL (short)</option>
          </select>
        </Field>
        <Field label="Segment">
          <select
            value={form.segment}
            onChange={(e) => set('segment', e.target.value as TradeSegment)}
            className={inputClass}
            disabled={readOnlyEntry}
          >
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Entry date">
          <input
            type="date"
            value={form.tradeDate}
            max={maxDate}
            onChange={(e) => set('tradeDate', e.target.value)}
            className={inputClass}
            required
            readOnly={readOnlyEntry}
          />
        </Field>
        <Field label="Qty">
          <input
            type="number"
            min={1}
            step={1}
            value={form.qty || ''}
            onChange={(e) => set('qty', Number(e.target.value))}
            className={inputClass}
            required
            readOnly={readOnlyEntry}
          />
        </Field>
      </div>

      <Field label="Entry price">
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.entryPrice || ''}
          onChange={(e) => set('entryPrice', Number(e.target.value))}
          className={inputClass}
          required
          readOnly={readOnlyEntry}
        />
      </Field>

      {mode === 'full' && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#cfe0ee] bg-white px-3 py-3">
          <input
            type="checkbox"
            checked={isClosed}
            onChange={(e) => handleClosedToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[#cfe0ee] text-sky-deep focus:ring-sky-mid"
          />
          <span>
            <span className="block text-sm font-semibold text-sky-ink">Already sold / closed</span>
            <span className="mt-0.5 block text-[12px] text-sky-ink/55">
              Tick this only if you already exited. Otherwise keep it open and close later.
            </span>
          </span>
        </label>
      )}

      {isClosed && (
        <div className="space-y-4 rounded-xl border border-[#cfe0ee] bg-sky-soft/50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Exit price">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.exitPrice ?? ''}
                onChange={(e) =>
                  set('exitPrice', e.target.value === '' ? null : Number(e.target.value))
                }
                className={inputClass}
                placeholder="Sell price"
                required={isClosed}
              />
            </Field>
            <Field label="Exit date">
              <input
                type="date"
                value={form.exitDate ?? ''}
                min={form.tradeDate}
                max={maxDate}
                onChange={(e) => set('exitDate', e.target.value || null)}
                className={inputClass}
                required={isClosed}
              />
            </Field>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-[#cfe0ee]">
            <span className="text-sky-ink/55">Realized P&L: </span>
            {previewPnL === null ? (
              <span className="font-semibold text-sky-ink/40">—</span>
            ) : (
              <span
                className={`font-semibold ${
                  previewPnL > 0
                    ? 'text-emerald-600'
                    : previewPnL < 0
                      ? 'text-rose-500'
                      : 'text-sky-ink'
                }`}
              >
                {formatCurrency(previewPnL)}
              </span>
            )}
          </div>
        </div>
      )}

      {!isClosed && mode === 'full' && (
        <div className="rounded-xl border border-dashed border-[#b8d4e8] bg-white px-3 py-2.5 text-sm text-sky-ink/55">
          Status: <strong className="font-semibold text-sky-deep">Open</strong> — P&L will show after you close.
        </div>
      )}

      {mode === 'full' && (
        <>
          <Field label="Strategy">
            <select
              value={form.strategy}
              onChange={(e) => set('strategy', e.target.value)}
              className={inputClass}
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tags">
            <input
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="banknifty, morning, setup-A"
              className={inputClass}
            />
          </Field>

          <Field label="Emotion">
            <select
              value={form.emotion}
              onChange={(e) => set('emotion', e.target.value as TradeEmotion)}
              className={inputClass}
            >
              {EMOTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Mistakes">
            <input
              value={form.mistakes}
              onChange={(e) => set('mistakes', e.target.value)}
              placeholder="Early exit, oversized, no SL…"
              className={inputClass}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Why this trade? Waiting for target / SL?"
              className={`${inputClass} resize-none`}
            />
          </Field>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink/70 hover:bg-sky-soft"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
        >
          {mode === 'close' ? 'Close trade' : isClosed ? 'Save closed trade' : 'Save open trade'}
        </button>
      </div>
    </form>
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
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2 disabled:bg-sky-soft disabled:text-sky-ink/70 read-only:bg-sky-soft';
