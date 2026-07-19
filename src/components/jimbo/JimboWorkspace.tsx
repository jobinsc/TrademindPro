'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Clock,
  Play,
  Radar,
  Send,
  Square,
  Target,
  Zap,
} from 'lucide-react';
import { useJimbo } from '@/hooks/useJimbo';
import { JIMBO_NAME, JIMBO_UNIVERSE } from '@/lib/jimbo';
import { formatCurrency } from '@/lib/utils';

export default function JimboWorkspace() {
  const {
    ready,
    settings,
    signals,
    lastScanAt,
    trades,
    events,
    chat,
    marketOpen,
    sessionLabel,
    scanning,
    dayPnl,
    scan,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
  } = useJimbo();
  const [prompt, setPrompt] = useState('');

  const actionable = signals.filter((s) => s.bias !== 'FLAT');
  const openTrade = trades.find((t) => t.status === 'open');
  const locked =
    settings.status === 'target_hit' || settings.status === 'stopped_loss';

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Waking {JIMBO_NAME}…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Specialist Agent
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
            {JIMBO_NAME}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Stock options only — liquid Nifty-50 / F&O names. CCI crosses 0 + price action → ATM CE
            (up) or ATM PE (down). Sibling of{' '}
            <Link href="/app/nejoic" className="font-semibold text-sky-deep hover:underline">
              Nejoic
            </Link>{' '}
            (index).
          </p>
          <Link
            href="/app/jimbo/settings"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
          >
            Jimbo Settings
          </Link>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              marketOpen
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          </span>
          <p className="max-w-[220px] text-right text-[11px] text-sky-ink/45">{sessionLabel}</p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#cfe0ee] bg-sky-soft/50 px-4 py-3 text-sm text-sky-ink/70">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-deep" strokeWidth={1.75} />
        <p>
          <strong>Jimbo logic:</strong> CCI({settings.cciPeriod}) rising through 0 → check PA → liquid
          ATM <em>Call</em>. CCI falling through 0 → check PA → liquid ATM <em>Put</em>. Auto only
          while NSE is open. Candles are demo until live stock feed is wired. Hard day limits: +₹
          {settings.dailyProfitTarget} / -₹{settings.dailyMaxLoss}.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Universe
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {JIMBO_UNIVERSE.length}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">Liquid F&O / Nifty-50 focus</p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Today P&amp;L
          </p>
          <p
            className={`mt-1 font-display text-2xl font-semibold ${
              dayPnl > 0 ? 'text-emerald-600' : dayPnl < 0 ? 'text-rose-500' : 'text-sky-ink'
            }`}
          >
            {formatCurrency(dayPnl)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Actionable
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {actionable.length}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            {lastScanAt
              ? `Last scan ${new Date(lastScanAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Not scanned yet'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => scan()}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink disabled:opacity-50"
        >
          <Radar className="h-4 w-4" />
          {scanning ? 'Scanning…' : 'Scan liquid stocks'}
        </button>
        <button
          type="button"
          disabled={locked || !actionable.length || Boolean(openTrade)}
          onClick={() => takeSignal()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          <Target className="h-4 w-4" />
          Take best paper trade
        </button>
        <button
          type="button"
          disabled={!openTrade}
          onClick={() => closeOpen()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-4 py-2.5 text-sm font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
        >
          <Square className="h-4 w-4" />
          Close open
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => setAutoTrade(!settings.autoTrade)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${
            settings.autoTrade ? 'bg-rose-500 hover:bg-rose-600' : 'bg-sky-deep hover:bg-sky-ink'
          }`}
        >
          {settings.autoTrade ? (
            <>
              <Square className="h-4 w-4" />
              Stop auto
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Arm auto (paper, market hours)
            </>
          )}
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              CCI setups (liquid only)
            </h2>
          </div>
          {signals.length === 0 ? (
            <p className="mt-8 text-center text-sm text-sky-ink/45">
              Click Scan to check CCI zero-crosses across the liquid universe.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-sky-ink/40">
                  <tr>
                    <th className="pb-2 font-semibold">Stock</th>
                    <th className="pb-2 font-semibold">CCI</th>
                    <th className="pb-2 font-semibold">Bias</th>
                    <th className="pb-2 font-semibold">ATM</th>
                    <th className="pb-2 font-semibold">Conf</th>
                    <th className="pb-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {signals.slice(0, 12).map((s) => (
                    <tr key={s.id} className="border-t border-[#e8f0f6] align-top">
                      <td className="py-2.5">
                        <p className="font-semibold text-sky-ink">{s.symbol}</p>
                        <p className="text-[11px] text-sky-ink/45">₹{s.spot.toFixed(1)}</p>
                      </td>
                      <td className="py-2.5 text-sky-ink/70">
                        {s.cciPrev} → {s.cciCurr}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            s.bias === 'CE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : s.bias === 'PE'
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-sky-soft text-sky-ink/50'
                          }`}
                        >
                          {s.bias}
                        </span>
                      </td>
                      <td className="py-2.5 text-sky-ink/70">
                        {s.bias === 'FLAT' ? '—' : `${s.strike} · ~₹${s.premium}`}
                      </td>
                      <td className="py-2.5 text-sky-ink/60">{s.confidence}%</td>
                      <td className="py-2.5 text-right">
                        {s.bias !== 'FLAT' && (
                          <button
                            type="button"
                            disabled={locked || Boolean(openTrade)}
                            onClick={() => takeSignal(s)}
                            className="text-[12px] font-semibold text-sky-deep hover:underline disabled:opacity-40"
                          >
                            Trade
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {signals[0] && (
            <p className="mt-3 text-[12px] leading-relaxed text-sky-ink/55">
              {signals[0].reason} {signals[0].paDetail}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-1 flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
                <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                  Ask {JIMBO_NAME}
                </h2>
              </div>
              {chat.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="text-[11px] font-semibold text-sky-ink/40 hover:text-sky-deep"
                >
                  Clear
                </button>
              )}
            </div>
            <div
              className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl bg-sky-soft/50 p-3"
              style={{ minHeight: 200, maxHeight: 280 }}
            >
              {chat.length === 0 ? (
                <p className="py-8 text-center text-sm text-sky-ink/45">
                  Ask about CCI scans or stock option ideas.
                </p>
              ) : (
                chat.map((m) => (
                  <div
                    key={m.id}
                    className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'ml-6 bg-sky-deep text-white'
                        : 'mr-4 bg-white text-sky-ink/80 ring-1 ring-[#cfe0ee]'
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!prompt.trim()) return;
                ask(prompt);
                setPrompt('');
              }}
            >
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask Jimbo…"
                className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
              />
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-sky-deep px-3 py-2 text-white"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Scan', 'Suggest trade', 'Rules'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => ask(c)}
                  className="rounded-full bg-sky-soft px-2.5 py-1 text-[11px] font-semibold text-sky-deep"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Activity</h2>
            </div>
            <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto text-[12px] text-sky-ink/60">
              {events.length === 0 ? (
                <p>No events yet.</p>
              ) : (
                [...events].reverse().map((e) => (
                  <p key={e.id}>
                    <span className="text-sky-ink/35">
                      {new Date(e.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    {e.text}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">
          Jimbo trades (paper stock options)
        </h2>
        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-sky-ink/45">No trades yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-sky-ink/40">
                <tr>
                  <th className="pb-2 font-semibold">Time</th>
                  <th className="pb-2 font-semibold">Contract</th>
                  <th className="pb-2 font-semibold">Entry</th>
                  <th className="pb-2 font-semibold">Exit</th>
                  <th className="pb-2 font-semibold">P&amp;L</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t) => (
                  <tr key={t.id} className="border-t border-[#e8f0f6]">
                    <td className="py-2.5 text-sky-ink/60">
                      {new Date(t.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 font-medium text-sky-ink">
                      {t.symbol} {t.strike} {t.option} × {t.lotSize}
                    </td>
                    <td className="py-2.5">₹{t.entryPremium}</td>
                    <td className="py-2.5">{t.exitPremium != null ? `₹${t.exitPremium}` : '—'}</td>
                    <td
                      className={`py-2.5 font-semibold ${
                        (t.pnl ?? 0) > 0
                          ? 'text-emerald-600'
                          : (t.pnl ?? 0) < 0
                            ? 'text-rose-500'
                            : 'text-sky-ink/50'
                      }`}
                    >
                      {t.pnl != null ? formatCurrency(t.pnl) : '—'}
                    </td>
                    <td className="py-2.5 capitalize text-sky-ink/60">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
