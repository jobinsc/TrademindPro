'use client';

import Link from 'next/link';
import { Clock, ExternalLink, OctagonX, Play, Radar, Square, Zap } from 'lucide-react';
import { ModuleRunButton } from '@/components/ui/ModuleTabShell';
import { BlinkSettingsPanel } from '@/components/blink/BlinkSettingsPanel';
import { BlinkTradingLabPanel } from '@/components/blink/BlinkTradingLabPanel';
import { BlinkStrategyChat } from '@/components/blink/BlinkStrategyChat';
import { BlinkNiftyPaProfilePanel } from '@/components/blink/BlinkNiftyPaProfilePanel';
import { BlinkNiftyStudyLabPanel } from '@/components/blink/BlinkNiftyStudyLabPanel';
import { BlinkAtmMovementLab } from '@/components/blink/BlinkAtmMovementLab';
import { BlinkProReplayPanel } from '@/components/blink/BlinkProReplayPanel';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, blinkTradeBadge, blinkUnderlyingLabel, type BlinkTrade } from '@/lib/blink';
import { formatCurrency } from '@/lib/utils';
import FullStopBar from '@/components/trading/FullStopBar';
import InfoBubble from '@/components/ui/InfoBubble';

export default function BlinkWorkspace() {
  const {
    ready,
    settings,
    signal,
    spot,
    trades,
    marketOpen,
    upstoxConnected,
    openLiveLtp,
    lastQuoteAt,
    scanning,
    dayPnl,
    analyse,
    setAutoTrade,
    takeSignal,
    closeOpen,
  } = useBlink();

  const openTrade = trades.find((t) => t.status === 'open');
  const locked =
    settings.status === 'target_hit' || settings.status === 'stopped_loss';

  function toggleAuto() {
    setAutoTrade(!settings.autoTrade);
  }

  function forceStop(exitTrade: boolean) {
    setAutoTrade(false);
    if (exitTrade && openTrade) void closeOpen();
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Waking {BLINK_NAME}…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Scalping · Control deck
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              {BLINK_NAME}
            </h1>
            <InfoBubble title="Live scalping">
              <p>
                Analyses <strong>{blinkUnderlyingLabel(settings.symbol || 'NIFTY')}</strong> charts.
                Nifty index uses real Upstox option LTP for entry/exit. Nifty 50 stocks use live
                stock candles — backtest simulates option premium.
              </p>
              <p className="mt-2">Connect Upstox in Terminal before auto-trade on Nifty.</p>
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/app/blink/results"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe0ee] bg-white px-4 py-2 text-sm font-semibold text-sky-deep hover:bg-sky-soft"
          >
            Results &amp; log
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              marketOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {marketOpen ? 'SESSION OPEN' : 'SESSION CLOSED'}
          </span>
          <span
            className={`text-[11px] font-semibold ${
              upstoxConnected ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            Upstox {upstoxConnected ? 'connected · live LTP' : 'not connected'}
          </span>
        </div>
      </div>

      <div className="mt-5">
        <FullStopBar />
      </div>

      <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">Run controls</h2>
        <p className="mt-1 text-[12px] text-sky-ink/55">
          Start/stop auto scalp. Exits use live option LTP + your SL/TGT settings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ModuleRunButton variant="start" onClick={() => void analyse()} disabled={scanning}>
            <Radar className="h-4 w-4" />
            {scanning ? 'Scanning…' : 'Scan live'}
          </ModuleRunButton>
          <ModuleRunButton
            variant="start"
            onClick={toggleAuto}
            disabled={settings.autoTrade || locked || !upstoxConnected}
          >
            <Play className="h-4 w-4" />
            Start auto
          </ModuleRunButton>
          <ModuleRunButton variant="stop" onClick={toggleAuto} disabled={!settings.autoTrade}>
            <Square className="h-4 w-4" />
            Stop auto
          </ModuleRunButton>
          <ModuleRunButton variant="force" onClick={() => forceStop(false)}>
            <OctagonX className="h-4 w-4" />
            Force stop
          </ModuleRunButton>
          <ModuleRunButton variant="force" onClick={() => forceStop(true)}>
            <OctagonX className="h-4 w-4" />
            Force stop + exit
          </ModuleRunButton>
        </div>
        {!upstoxConnected ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Link href="/app/terminal" className="font-semibold underline">
              Connect Upstox
            </Link>{' '}
            in Terminal for live Nifty option prices. Without it, Blink cannot open or close scalps
            with real LTP.
          </p>
        ) : null}
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Nifty" value={spot.toFixed(0)} hint="Live spot" />
        <Stat
          label="Today P&L"
          value={formatCurrency(dayPnl)}
          hint={`Tgt +${settings.dailyProfitTarget}`}
          tone={dayPnl >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Auto"
          value={settings.autoTrade ? 'ON' : 'OFF'}
          hint={settings.status}
        />
        <Stat
          label="Open LTP"
          value={openLiveLtp != null ? `₹${openLiveLtp}` : '—'}
          hint={lastQuoteAt ? `Updated ${lastQuoteAt.slice(11, 19)}` : 'No quote yet'}
        />
      </div>

      <BlinkProReplayPanel />
      <BlinkNiftyStudyLabPanel />
      <BlinkAtmMovementLab />
      <BlinkNiftyPaProfilePanel />

      <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Live signal</h2>
        </div>
        {signal ? (
          <div className="mt-3 grid gap-2 text-sm text-sky-ink/80 sm:grid-cols-2">
            <p>
              <strong>Bias:</strong> {signal.bias} · {signal.confidence}%
            </p>
            <p>
              <strong>Strike:</strong> {signal.strike}
              {signal.premium > 0 ? ` · ₹${signal.premium} LTP` : ' · waiting LTP'}
            </p>
            <p>
              <strong>Setup:</strong> {signal.setup}
            </p>
            {signal.cci != null ? (
              <p>
                <strong>CCI:</strong> {signal.cci}
              </p>
            ) : null}
            {signal.paLabel ? (
              <p>
                <strong>Structure:</strong> {signal.paLabel}
                {signal.paTrend ? ` · ${signal.paTrend} trend` : ''}
                {signal.support != null ? ` · Sup ${signal.support.toFixed(0)}` : ''}
                {signal.resistance != null ? ` · Res ${signal.resistance.toFixed(0)}` : ''}
              </p>
            ) : signal.emaFast > 0 ? (
              <p>
                <strong>EMA:</strong> {signal.emaFast} / {signal.emaSlow} · RSI {signal.rsi}
              </p>
            ) : null}
            <p className="sm:col-span-2 text-sky-ink/60">{signal.reason}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-sky-ink/50">Run live scan to get a scalp read.</p>
        )}
        {openTrade ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-soft/50 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sky-ink">
                Open: {openTrade.option} {openTrade.strike} @ ₹{openTrade.entryPremium}
              </p>
              <TradeBadge trade={openTrade} />
            </div>
            <p className="mt-1 text-sky-ink/70">
              Live LTP: {openLiveLtp != null ? `₹${openLiveLtp}` : 'fetching…'} · Move{' '}
              {openLiveLtp != null
                ? `${(openLiveLtp - openTrade.entryPremium).toFixed(2)} pts`
                : '—'}
            </p>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void takeSignal()}
            disabled={!!openTrade || locked || !upstoxConnected}
            className="rounded-xl bg-sky-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Take scalp (live LTP)
          </button>
          {openTrade ? (
            <button
              type="button"
              onClick={() => void closeOpen()}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
            >
              Close at live LTP
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">Scalp settings</h2>
        <p className="mt-1 text-[12px] text-sky-ink/55">
          SL/TGT in option premium points. Saved locally for Blink only.
        </p>
        <div className="mt-4">
          <BlinkSettingsPanel embedded />
        </div>
        <BlinkTradingLabPanel />
      </section>

      <BlinkStrategyChat />
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

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-600' : 'text-sky-ink'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-sky-ink/45">{hint}</p> : null}
    </div>
  );
}
