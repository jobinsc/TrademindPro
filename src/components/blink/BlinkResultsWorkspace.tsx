'use client';

import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, blinkTradeBadge, summarizeBlink, todayKey, type BlinkTrade } from '@/lib/blink';
import { formatCurrency } from '@/lib/utils';

export default function BlinkResultsWorkspace() {
  const { ready, settings, trades, events, dayPnl, ask } = useBlink();
  const [prompt, setPrompt] = useState('');

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading {BLINK_NAME} results…
      </div>
    );
  }

  const stats = summarizeBlink(trades);
  const todayTrades = trades.filter((t) => t.at.slice(0, 10) === todayKey());
  const liveTrades = trades.filter((t) => t.premiumSource === 'upstox').length;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Scalping · Results
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            {BLINK_NAME} book
          </h1>
        </div>
        <Link
          href="/app/blink"
          className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ee] bg-white px-4 py-2 text-sm font-semibold text-sky-deep hover:bg-sky-soft"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to control
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Today P&L" value={formatCurrency(dayPnl)} highlight={dayPnl > 0 ? true : dayPnl < 0 ? false : undefined} />
        <Metric label="Win rate" value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.closed} closed`} />
        <Metric
          label="Profit factor"
          value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
          sub={`Avg W ${stats.avgWin.toFixed(0)} / L ${stats.avgLoss.toFixed(0)}`}
        />
        <Metric label="Scalps today" value={String(todayTrades.length)} sub={`Max ${settings.maxTradesPerDay}`} />
        <Metric label="Live LTP trades" value={String(liveTrades)} sub={`of ${trades.length} total`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Scalp book</h2>
          <p className="mt-1 text-[12px] text-sky-ink/50">
            All entries/exits at Upstox live LTP when connected.
          </p>
          <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto text-sm">
            {trades.length === 0 ? (
              <li className="text-sky-ink/50">No scalps yet — start from control deck.</li>
            ) : (
              [...trades].reverse().map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-[#e8eef3] px-3 py-2.5 text-sky-ink/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-sky-ink">
                      NIFTY {t.strike} {t.option}
                    </span>
                    <div className="flex items-center gap-2">
                      <TradeBadge trade={t} />
                      <span
                        className={`text-[11px] font-semibold uppercase ${
                          t.status === 'open' ? 'text-amber-600' : 'text-sky-ink/45'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1">
                    Entry ₹{t.entryPremium}
                    {t.exitPremium != null ? ` → Exit ₹${t.exitPremium}` : ''}
                  </p>
                  {t.pnl != null ? (
                    <p className={t.pnl >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                      Net P&L ₹{t.pnl}
                      {t.brokerage != null ? ` (brok ₹${t.brokerage})` : ''}
                    </p>
                  ) : openMove(t) ? (
                    <p className="text-sky-ink/55">{openMove(t)}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-sky-ink/40">
                    {t.at.slice(11, 19)}
                    {t.exitAt ? ` → ${t.exitAt.slice(11, 19)}` : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Event log</h2>
          <ul className="mt-3 max-h-[360px] space-y-1 overflow-y-auto text-[12px] text-sky-ink/70">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="border-b border-[#f0f4f8] py-1.5 last:border-0">
                <span className="text-sky-ink/40">{e.at.slice(11, 19)}</span> {e.text}
              </li>
            ))}
          </ul>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!prompt.trim()) return;
              ask(prompt.trim());
              setPrompt('');
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask Blink about results or risk…"
              className="flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-sky-mist px-3 py-2 text-sky-deep"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>

    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          highlight === true ? 'text-emerald-600' : highlight === false ? 'text-rose-600' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-sky-ink/45">{sub}</p> : null}
    </div>
  );
}

function TradeBadge({ trade }: { trade: BlinkTrade }) {
  const badge = blinkTradeBadge(trade);
  const cls =
    badge.tone === 'live'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : badge.tone === 'warn'
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : 'bg-sky-100 text-sky-ink/60 border-[#dbe8f2]';
  return (
    <span
      title={badge.title}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {badge.label}
    </span>
  );
}

function openMove(t: { status: string; entryPremium: number; peakPremium?: number | null }) {
  if (t.status !== 'open') return null;
  const peak = t.peakPremium ?? t.entryPremium;
  return `Peak +${(peak - t.entryPremium).toFixed(2)} pts vs entry`;
}
