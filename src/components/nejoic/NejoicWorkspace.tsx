'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  OctagonX,
  Play,
  Send,
  Square,
  Target,
  Zap,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import {
  ModuleRunButton,
  ModuleSettingsButton,
  ModuleSettingsPanel,
} from '@/components/ui/ModuleTabShell';
import { NejoicSettingsPanel } from '@/components/nejoic/NejoicSettingsWorkspace';
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
import { deskLabel, getActiveDesk } from '@/lib/market-desk';
import { NEJOIC_NAME } from '@/lib/nejoic';
import { formatCurrency } from '@/lib/utils';
import FullStopBar from '@/components/trading/FullStopBar';
import { getBrokeragePerLot } from '@/lib/brokerage';

function statusLabel(status: string, autoOn: boolean) {
  if (status === 'armed' || status === 'trading') return autoOn ? 'ON' : 'OFF';
  if (status === 'target_hit') return 'TARGET HIT';
  if (status === 'stopped_loss') return 'MAX LOSS';
  if (status === 'watching' || status === 'idle') return autoOn ? 'ON' : 'OFF';
  return status.replace('_', ' ').toUpperCase();
}

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
    dayPnl,
    analyse,
    setWatching,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
    requestPulse,
    fullStop,
    updateSettings,
  } = useNejoic();
  const [prompt, setPrompt] = useState('');
  const brokPerLot = settings.brokeragePerLot || getBrokeragePerLot();

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
  const settingsOpen = settings.settingsOpen ?? false;

  function toggleAuto() {
    setAutoTrade(!settings.autoTrade);
  }

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              {NEJOIC_NAME}
            </h1>
            <InfoBubble title="How Nejoic works">
              <p>
                <strong>India desk</strong> Mon–Fri 09:15–15:30 IST: Nifty CE/PE paper only.
              </p>
              <p className="mt-2">
                <strong>After hours</strong> (weekday outside cash): <strong>Gold only</strong> on{' '}
                <strong>15m</strong> — Telegram reports Gold only.
              </p>
              <p className="mt-2">
                <strong>Weekend</strong> Sat–Sun: <strong>BTC only</strong> — no other instruments.
              </p>
              <p className="mt-2">
                Paper rules: daily +₹{settings.dailyProfitTarget} / -₹{settings.dailyMaxLoss}. Telegram
                messages are configured under <strong>AI Agents → Telegram Bot</strong> (separate).
              </p>
            </InfoBubble>
          </div>
          <p className="mt-2 text-[12px] font-semibold text-sky-deep">{deskLabel(getActiveDesk())}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/app/telegram"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] bg-white px-3 py-1.5 text-sm font-semibold text-sky-deep hover:bg-sky-soft/40"
            >
              Telegram Bot
            </Link>
            <Link
              href="/app/paper-trading"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] bg-white px-3 py-1.5 text-sm font-semibold text-sky-deep hover:bg-sky-soft/40"
            >
              Paper trading
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ModuleSettingsButton
            open={settingsOpen}
            onToggle={() => updateSettings({ settingsOpen: !settingsOpen })}
          />
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
            {statusLabel(settings.status, settings.autoTrade)}
          </span>
          <p className="text-[11px] text-sky-ink/45">
            {getActiveDesk() === 'INDIA'
              ? 'India cash desk · Nifty'
              : getActiveDesk() === 'GOLD'
                ? 'After hours · Gold 15m only'
                : 'Weekend · BTC 15m only'}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <FullStopBar />
      </div>

      <ModuleSettingsPanel
        open={settingsOpen}
        title={`${NEJOIC_NAME} settings`}
        description="Strategies, analysis, timeframes, risk, SL/target, and session filters — saved for Nejoic (Nifty) only."
        controls={
          <>
            <ModuleRunButton variant="start" onClick={toggleAuto} disabled={settings.autoTrade || locked}>
              <Play className="h-4 w-4" />
              Start auto
            </ModuleRunButton>
            <ModuleRunButton variant="stop" onClick={toggleAuto} disabled={!settings.autoTrade}>
              <Square className="h-4 w-4" />
              Stop auto
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={() => fullStop(false)}>
              <OctagonX className="h-4 w-4" />
              Force stop
            </ModuleRunButton>
            <ModuleRunButton variant="force" onClick={() => fullStop(true)}>
              <OctagonX className="h-4 w-4" />
              Force stop + exit
            </ModuleRunButton>
          </>
        }
      >
        <NejoicSettingsPanel embedded />
      </ModuleSettingsPanel>

      {!settingsOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#cfe0ee] bg-sky-soft/30 px-4 py-3 text-sm text-sky-ink/70">
          <span>
            Auto {settings.autoTrade ? 'ON' : 'OFF'} · {settings.strategyIds?.length ?? 0} strategies ·{' '}
            {settings.primaryTimeframe} · Target +{formatCurrency(settings.dailyProfitTarget)}
          </span>
          <ModuleRunButton variant="start" onClick={toggleAuto} disabled={settings.autoTrade || locked}>
            <Play className="h-4 w-4" />
            Quick start
          </ModuleRunButton>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-[#cfe0ee] bg-sky-soft/50 px-4 py-3 text-[12px] text-sky-ink/75">
        <p className="font-semibold text-sky-ink">Monday open checklist</p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5">
          <li>
            Desk now: <strong>{deskLabel(getActiveDesk())}</strong>
            {getActiveDesk() === 'INDIA' ? ' — Nifty paper allowed' : ' — switches to Nifty at 09:15 IST'}
          </li>
          <li>
            Auto: {settings.autoTrade ? 'ON ✓' : 'OFF — use Paper Trading → Start auto'}
            {' · '}
            Brokerage ₹{brokPerLot}/lot (Paper Trading settings)
          </li>
          <li>
            All paper settings &amp; results →{' '}
            <Link href="/app/paper-trading" className="font-semibold text-sky-deep hover:underline">
              Paper Trading
            </Link>
            . Telegram →{' '}
            <Link href="/app/telegram" className="font-semibold text-sky-deep hover:underline">
              Telegram Bot
            </Link>
          </li>
          <li>
            Broker:{' '}
            <Link href="/app/terminal" className="font-semibold text-sky-deep hover:underline">
              Terminal → Login with Upstox
            </Link>{' '}
            (once after ~3:30 AM IST)
          </li>
        </ul>
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
                Nifty chart
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
                  formatter={(value) =>
                    typeof value === 'number' ? value.toFixed(2) : String(value ?? '')
                  }
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
              onClick={() => void takeSignal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Target className="h-4 w-4" />
              Take paper trade
            </button>
            <button
              type="button"
              disabled={!openTrade}
              onClick={() => void closeOpen()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0ee] px-4 py-2 text-sm font-semibold text-sky-ink hover:bg-sky-soft disabled:opacity-40"
            >
              <Square className="h-4 w-4" />
              Exit trade
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
                  Stop
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Start
                </>
              )}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-1 flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Ask {NEJOIC_NAME}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void requestPulse()}
                  className="rounded-lg bg-sky-deep px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-ink"
                >
                  Pulse
                </button>
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
            </div>
            <div
              className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl bg-sky-soft/50 p-3"
              style={{ minHeight: 220, maxHeight: 280 }}
            >
              {chat.length === 0 ? (
                <p className="py-8 text-center text-sm text-sky-ink/45">
                  Tap <strong>Pulse</strong>, or type <strong>5</strong> / <strong>15m</strong> /{' '}
                  <strong>pulse</strong> for a live report.
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
                void ask(prompt);
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
                  onClick={() => void ask(c)}
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
          Nejoic trades (paper) — net P&amp;L after{' '}
          <strong>₹{brokPerLot}/lot brokerage</strong>. LTP from Upstox when connected.
        </h2>
        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-sky-ink/45">No trades yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-sky-ink/40">
                <tr>
                  <th className="pb-2 font-semibold">Time</th>
                  <th className="pb-2 font-semibold">Contract</th>
                  <th className="pb-2 font-semibold">Entry</th>
                  <th className="pb-2 font-semibold">Exit</th>
                  <th className="pb-2 font-semibold">Brok</th>
                  <th className="pb-2 font-semibold">Net P&amp;L</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Action</th>
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
                    <td className="py-2.5 text-sky-ink/50">
                      {t.status === 'closed'
                        ? formatCurrency(t.brokerage ?? t.lots * brokPerLot)
                        : '—'}
                    </td>
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
                    <td className="py-2.5">
                      {t.status === 'open' ? (
                        <button
                          type="button"
                          onClick={() => void closeOpen()}
                          className="rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-600"
                        >
                          Exit
                        </button>
                      ) : (
                        <span className="text-sky-ink/30">—</span>
                      )}
                    </td>
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
