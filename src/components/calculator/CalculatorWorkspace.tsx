'use client';

import { useMemo, useState } from 'react';
import {
  Calculator,
  IndianRupee,
  Percent,
  Scale,
  Target,
  TrendingUp,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none focus:ring-2 focus:ring-sky-mid/30';

type Tab = 'position' | 'pnl' | 'option' | 'rr' | 'points';

function n(v: string) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function CalculatorWorkspace() {
  const [tab, setTab] = useState<Tab>('position');

  // Position size
  const [capital, setCapital] = useState('100000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('24500');
  const [stop, setStop] = useState('24400');

  // Stock / futures P&L
  const [pnlEntry, setPnlEntry] = useState('100');
  const [pnlExit, setPnlExit] = useState('110');
  const [qty, setQty] = useState('100');
  const [side, setSide] = useState<'long' | 'short'>('long');

  // Option P&L (Nifty style)
  const [optEntry, setOptEntry] = useState('120');
  const [optExit, setOptExit] = useState('150');
  const [lots, setLots] = useState('1');
  const [lotSize, setLotSize] = useState('25');

  // R:R
  const [rrEntry, setRrEntry] = useState('24500');
  const [rrStop, setRrStop] = useState('24400');
  const [rrTarget, setRrTarget] = useState('24700');

  // Points ↔ money
  const [points, setPoints] = useState('50');
  const [pointValue, setPointValue] = useState('25'); // ₹ per point per lot for index options often lot size

  const position = useMemo(() => {
    const cap = n(capital);
    const risk = (cap * n(riskPct)) / 100;
    const riskPerUnit = Math.abs(n(entry) - n(stop));
    const size = riskPerUnit > 0 ? Math.floor(risk / riskPerUnit) : 0;
    return { risk, riskPerUnit, size };
  }, [capital, riskPct, entry, stop]);

  const stockPnl = useMemo(() => {
    const e = n(pnlEntry);
    const x = n(pnlExit);
    const q = n(qty);
    const diff = side === 'long' ? x - e : e - x;
    return Math.round(diff * q * 100) / 100;
  }, [pnlEntry, pnlExit, qty, side]);

  const optionPnl = useMemo(() => {
    const pts = n(optExit) - n(optEntry);
    const value = pts * n(lotSize) * n(lots);
    return Math.round(value * 100) / 100;
  }, [optEntry, optExit, lots, lotSize]);

  const rr = useMemo(() => {
    const risk = Math.abs(n(rrEntry) - n(rrStop));
    const reward = Math.abs(n(rrTarget) - n(rrEntry));
    const ratio = risk > 0 ? reward / risk : 0;
    return { risk, reward, ratio: Math.round(ratio * 100) / 100 };
  }, [rrEntry, rrStop, rrTarget]);

  const pointsMoney = useMemo(() => {
    return Math.round(n(points) * n(pointValue) * 100) / 100;
  }, [points, pointValue]);

  const tabs: { id: Tab; label: string; icon: typeof Calculator }[] = [
    { id: 'position', label: 'Position size', icon: Scale },
    { id: 'pnl', label: 'Stock P&L', icon: TrendingUp },
    { id: 'option', label: 'Option P&L', icon: Target },
    { id: 'rr', label: 'Risk : Reward', icon: Percent },
    { id: 'points', label: 'Points → ₹', icon: IndianRupee },
  ];

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-soft text-sky-deep">
          <Calculator className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Trading Calculator
            </h1>
            <InfoBubble title="About calculator">
              Quick maths for position size, stock/option P&amp;L, risk:reward, and points to
              rupees. Paper-friendly — no orders are placed.
            </InfoBubble>
          </div>
          <p className="mt-1 text-sm text-sky-ink/55">All trading maths in one place</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                on
                  ? 'bg-sky-deep text-white'
                  : 'bg-white text-sky-ink/65 ring-1 ring-[#cfe0ee] hover:bg-sky-soft/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
        {tab === 'position' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capital (₹)" value={capital} onChange={setCapital} />
            <Field label="Risk % per trade" value={riskPct} onChange={setRiskPct} />
            <Field label="Entry price" value={entry} onChange={setEntry} />
            <Field label="Stop-loss price" value={stop} onChange={setStop} />
            <Result
              className="sm:col-span-2"
              lines={[
                `Money you risk: ₹${position.risk.toLocaleString('en-IN')}`,
                `Risk per share/unit: ₹${position.riskPerUnit.toFixed(2)}`,
                `Suggested quantity: ${position.size.toLocaleString('en-IN')}`,
              ]}
            />
          </div>
        )}

        {tab === 'pnl' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
                Side
              </span>
              <select
                className={inputClass}
                value={side}
                onChange={(e) => setSide(e.target.value as 'long' | 'short')}
              >
                <option value="long">Buy / Long</option>
                <option value="short">Sell / Short</option>
              </select>
            </label>
            <Field label="Entry" value={pnlEntry} onChange={setPnlEntry} />
            <Field label="Exit" value={pnlExit} onChange={setPnlExit} />
            <Field label="Quantity" value={qty} onChange={setQty} />
            <Result
              className="sm:col-span-2"
              lines={[
                `P&L: ₹${stockPnl.toLocaleString('en-IN')}`,
                stockPnl >= 0 ? 'Profit' : 'Loss',
              ]}
              good={stockPnl >= 0}
            />
          </div>
        )}

        {tab === 'option' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Entry premium (₹)" value={optEntry} onChange={setOptEntry} />
            <Field label="Exit premium (₹)" value={optExit} onChange={setOptExit} />
            <Field label="Lots" value={lots} onChange={setLots} />
            <Field label="Lot size (e.g. Nifty 25)" value={lotSize} onChange={setLotSize} />
            <Result
              className="sm:col-span-2"
              lines={[
                `Points: ${(n(optExit) - n(optEntry)).toFixed(2)}`,
                `P&L: ₹${optionPnl.toLocaleString('en-IN')}`,
                `Formula: (exit − entry) × lot size × lots`,
              ]}
              good={optionPnl >= 0}
            />
          </div>
        )}

        {tab === 'rr' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Entry" value={rrEntry} onChange={setRrEntry} />
            <Field label="Stop-loss" value={rrStop} onChange={setRrStop} />
            <Field label="Target" value={rrTarget} onChange={setRrTarget} />
            <Result
              className="sm:col-span-2"
              lines={[
                `Risk: ${rr.risk.toFixed(2)} pts`,
                `Reward: ${rr.reward.toFixed(2)} pts`,
                `Risk : Reward = 1 : ${rr.ratio}`,
              ]}
            />
          </div>
        )}

        {tab === 'points' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Points moved" value={points} onChange={setPoints} />
            <Field
              label="₹ per point (often = lot size)"
              value={pointValue}
              onChange={setPointValue}
            />
            <Result
              className="sm:col-span-2"
              lines={[`Money = ₹${pointsMoney.toLocaleString('en-IN')}`]}
              good={pointsMoney >= 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sky-ink/45">
        {label}
      </span>
      <input
        type="number"
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Result({
  lines,
  className = '',
  good,
}: {
  lines: string[];
  className?: string;
  good?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-sky-soft/80 px-4 py-3 text-sm text-sky-ink ring-1 ring-[#cfe0ee] ${className}`}
    >
      {lines.map((line) => (
        <p
          key={line}
          className={`font-semibold ${
            good === undefined ? '' : good ? 'text-emerald-700' : 'text-rose-600'
          }`}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
