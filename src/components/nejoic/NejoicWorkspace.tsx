'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bot,
  Play,
  Send,
  Square,
  Target,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNejoic } from '@/hooks/useNejoic';
import { NEJOIC_NAME } from '@/lib/nejoic';
import { formatCurrency } from '@/lib/utils';

export default function NejoicWorkspace() {
  const {
    ready,
    settings,
    candles,
    spot,
    signal,
    trades,
    events,
    chat,
    feedSource,
    feedLabel,
    dayPnl,
    analyse,
    setWatching,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
  } = useNejoic();
  const [prompt, setPrompt] = useState('');

  const chartData = useMemo(() => {
    const labelMap = new Map(
      (signal?.labels || []).map((l) => [l.index, l.label] as const)
    );
    return candles.map((c, i) => ({
      t: new Date(c.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      close: c.close,
      high: c.high,
      low: c.low,
      label: labelMap.get(i) || undefined,
      support: signal?.support ?? undefined,
      resistance: signal?.resistance ?? undefined,
    }));
  }, [candles, signal]);

  const openTrade = trades.find((t) => t.status === 'open');
  const locked =
    settings.status === 'target_hit' || settings.status === 'stopped_loss';

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Waking {NEJOIC_NAME}…
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
            {NEJOIC_NAME}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
            Price-action only (HH / HL / LH / LL from your Pine). No indicators. Nifty options with
            +₹{settings.dailyProfitTarget} / -₹{settings.dailyMaxLoss} hard daily rules.
          </p>
          <Link
            href="/app/nejoic/settings"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
          >
            Nejoic Settings
          </Link>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              locked
                ? settings.status === 'target_hit'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-600'
                : settings.autoTrade
                  ? 'bg-sky-soft text-sky-deep'
                  : 'bg-white text-sky-ink/60 ring-1 ring-[#cfe0ee]'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            {settings.status.replace('_', ' ').toUpperCase()}
            {settings.autoTrade ? ' · AUTO' : ''}
          </span>
          <p className="text-[11px] text-sky-ink/45">
            {feedSource === 'live' ? 'Live Nifty feed' : 'Paper mode · sim chart fallback'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900/80">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <p>
          <strong>Method:</strong> plain-chart price action only (your HH/HL/LH/LL Pine, lb=5 rb=5).
          No RSI/EMA/MACD. Nejoic takes CE mainly after <em>Higher Low</em> in uptrend, PE after{' '}
          <em>Lower High</em> in downtrend. Hard stops: +₹{settings.dailyProfitTarget} / -₹
          {settings.dailyMaxLoss}. Feed: <em>{feedLabel}</em>. Auto stays paper until live orders.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Nifty spot
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {spot.toFixed(2)}
          </p>
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
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            Target +{formatCurrency(settings.dailyProfitTarget)} · Max -{formatCurrency(settings.dailyMaxLoss)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
            Signal
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-sky-ink">
            {signal?.bias ?? '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-sky-ink/45">
            {signal ? `${signal.confidence}% · ${signal.strike}` : 'Analyse chart'}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Nifty chart{' '}
                <span
                  className={`text-[11px] font-semibold ${
                    feedSource === 'live' ? 'text-emerald-600' : 'text-sky-ink/40'
                  }`}
                >
                  · {feedSource === 'live' ? 'LIVE' : 'SIM'}
                </span>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWatching(settings.status === 'idle')}
                className="rounded-xl border border-[#cfe0ee] px-3 py-1.5 text-[12px] font-semibold text-sky-deep hover:bg-sky-soft"
              >
                {settings.status === 'idle' ? 'Start watching' : 'Pause chart'}
              </button>
              <button
                type="button"
                onClick={() => analyse()}
                className="rounded-xl bg-sky-deep px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-ink"
              >
                Analyse chart
              </button>
            </div>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e8f0f6" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#7a93a8' }} minTickGap={40} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: '#7a93a8' }}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #cfe0ee',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    typeof value === 'number' ? value.toFixed(2) : value,
                    name,
                  ]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as { label?: string } | undefined;
                    return row?.label ? `${label} · ${row.label}` : String(label);
                  }}
                />
                {signal?.support != null && (
                  <ReferenceLine
                    y={signal.support}
                    stroke="#16a34a"
                    strokeDasharray="4 4"
                    label={{ value: 'Sup', fill: '#16a34a', fontSize: 10 }}
                  />
                )}
                {signal?.resistance != null && (
                  <ReferenceLine
                    y={signal.resistance}
                    stroke="#e11d48"
                    strokeDasharray="4 4"
                    label={{ value: 'Res', fill: '#e11d48', fontSize: 10 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#1a6ba8"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props as {
                      cx?: number;
                      cy?: number;
                      payload?: { label?: string };
                    };
                    if (cx == null || cy == null || !payload?.label) return null;
                    const bull = payload.label === 'HH' || payload.label === 'HL';
                    return (
                      <g key={`${cx}-${cy}-${payload.label}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={bull ? '#16a34a' : '#e11d48'}
                          stroke="#fff"
                          strokeWidth={1}
                        />
                        <text
                          x={cx}
                          y={cy - 8}
                          textAnchor="middle"
                          fontSize={9}
                          fontWeight={700}
                          fill={bull ? '#16a34a' : '#e11d48'}
                        >
                          {payload.label}
                        </text>
                      </g>
                    );
                  }}
                  name="Nifty"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {signal && (
            <div className="mt-4 rounded-xl bg-sky-soft/70 px-4 py-3 text-sm text-sky-ink/75">
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-white px-2 py-0.5 text-sky-ink ring-1 ring-[#cfe0ee]">
                  PA · lb={settings.leftBars ?? 5}/rb={settings.rightBars ?? 5}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-sky-ink ring-1 ring-[#cfe0ee]">
                  {signal.lastLabel ?? '—'} · {signal.setup}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-sky-ink ring-1 ring-[#cfe0ee]">
                  Trend{' '}
                  {signal.trend === 1 ? 'BULL' : signal.trend === -1 ? 'BEAR' : 'FLAT'}
                </span>
              </div>
              <p className="mt-2 font-semibold text-sky-ink">
                {signal.bias === 'FLAT'
                  ? 'Stay flat — waiting for HL (CE) or LH (PE)'
                  : `Idea: BUY NIFTY ${signal.strike} ${signal.bias} @ ~₹${signal.premium}`}
              </p>
              <p className="mt-1 text-[13px]">{signal.structureText}</p>
              <p className="mt-1 text-[13px] text-sky-ink/65">{signal.reason}</p>
              {signal.labels.length > 0 && (
                <p className="mt-2 text-[12px] text-sky-ink/50">
                  Labels:{' '}
                  {signal.labels
                    .slice(-6)
                    .map((l) => l.label)
                    .join(' → ')}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={locked || !signal || signal.bias === 'FLAT' || Boolean(openTrade)}
              onClick={() => takeSignal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Target className="h-4 w-4" />
              Take paper trade
            </button>
            <button
              type="button"
              disabled={!openTrade}
              onClick={() => closeOpen()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-4 py-2 text-sm font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
            >
              <Square className="h-4 w-4" />
              Close open
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setAutoTrade(!settings.autoTrade)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
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
                  Arm auto (paper)
                </>
              )}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-1 flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Ask {NEJOIC_NAME}
              </h2>
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
              style={{ minHeight: 220, maxHeight: 280 }}
            >
              {chat.length === 0 ? (
                <p className="py-8 text-center text-sm text-sky-ink/45">
                  Ask “analyse chart” or “suggest a Nifty option trade”.
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
                placeholder="Ask Nejoic…"
                className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl bg-sky-deep px-3 py-2 text-sm font-semibold text-white"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Analyse structure', 'Suggest trade', 'Check my risk'].map((c) => (
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
            <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-[12px] text-sky-ink/60">
              {events.length === 0 ? (
                <p>No events yet.</p>
              ) : (
                [...events].reverse().map((e) => (
                  <p key={e.id}>
                    <span className="text-sky-ink/35">
                      {new Date(e.at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
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
          Nejoic trades (paper)
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
                      NIFTY {t.strike} {t.option} × {t.lots}
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
