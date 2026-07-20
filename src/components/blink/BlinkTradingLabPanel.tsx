'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, BLINK_STRATEGY_MODES } from '@/lib/blink';
import type { BlinkUserBacktestReport } from '@/lib/blink-backtest-report';

type BacktestResponse = {
  ok?: boolean;
  error?: string;
  fromDate?: string;
  toDate?: string;
  effectiveDays?: number;
  timeframe?: string;
  report?: BlinkUserBacktestReport;
};

export function BlinkTradingLabPanel() {
  const { settings } = useBlink();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<BlinkUserBacktestReport | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const strategyName =
    BLINK_STRATEGY_MODES.find((m) => m.id === settings.strategyMode)?.name ?? settings.strategyMode;

  async function runBacktest() {
    setRunning(true);
    setError('');
    setReport(null);
    setRange(null);
    setProgress('Running backtest with your exact Blink settings…');

    try {
      const res = await fetch('/api/blink/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyMode: settings.strategyMode,
          stopLossPoints: settings.stopLossPoints,
          targetPoints: settings.targetPoints,
          minConfidence: settings.minConfidence,
          maxTradesPerDay: settings.maxTradesPerDay,
          dailyProfitTarget: settings.dailyProfitTarget,
          dailyMaxLoss: settings.dailyMaxLoss,
          maxLotsPerTrade: settings.maxLotsPerTrade,
          lotSize: settings.lotSize,
          brokeragePerLot: settings.brokeragePerLot,
          tradeWindowStart: settings.tradeWindowStart,
          tradeWindowEnd: settings.tradeWindowEnd,
          strikeMoneyness: settings.strikeMoneyness,
          chartTimeframe: settings.chartTimeframe,
          lookbackDays: 30,
        }),
      });
      const data = (await res.json()) as BacktestResponse;
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error || 'Backtest failed');
      }
      setReport(data.report);
      setRange({ from: data.fromDate ?? '', to: data.toDate ?? '' });
      setProgress('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
      setProgress('');
    } finally {
      setRunning(false);
    }
  }

  const verdictStyle =
    report && report.totals.netPnl > 0
      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
      : report && report.totals.netPnl < 0
        ? 'border-rose-200 bg-rose-50/90 text-rose-950'
        : 'border-amber-200 bg-amber-50/90 text-amber-950';

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-sky-soft/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-sky-ink">
            Backtest your plan
          </h3>
          <p className="mt-1 max-w-xl text-[12px] text-sky-ink/55">
            Tests <strong>only what you set above</strong> in Scalp settings — same strategy, stop,
            target, time window, strike, and chart interval. Shows a <strong>day-by-day</strong>{' '}
            profit/loss report.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runBacktest()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          {running ? 'Running…' : 'Run backtest'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-[#cfe0ee] bg-white px-4 py-3 text-[12px] text-sky-ink/75">
        <p className="font-semibold text-sky-ink">What will be tested (from your settings)</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li>
            Strategy: <strong>{strategyName}</strong>
          </li>
          <li>
            Chart: <strong>{settings.chartTimeframe || '1m'}</strong>
          </li>
          <li>
            Time:{' '}
            <strong>
              {settings.tradeWindowStart}–{settings.tradeWindowEnd} IST
            </strong>
          </li>
          <li>
            Strike: <strong>{(settings.strikeMoneyness || 'atm').toUpperCase()}</strong>
          </li>
          <li>
            Stop / Target:{' '}
            <strong>
              {settings.stopLossPoints} / {settings.targetPoints} premium pts
            </strong>
          </li>
          <li>
            Max trades/day: <strong>{settings.maxTradesPerDay}</strong> · Lots:{' '}
            <strong>{settings.maxLotsPerTrade}</strong>
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-sky-ink/45">
          Change anything above in Scalp settings, click Save, then run backtest again.
        </p>
      </div>

      {progress ? <p className="mt-3 text-sm text-sky-mid">{progress}</p> : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="mt-5 space-y-4">
          {range ? (
            <p className="text-[11px] text-sky-ink/45">
              Period: {range.from} to {range.to} · {report.tested.daysTested} trading days ·{' '}
              {report.tested.timeframeLabel} chart
            </p>
          ) : null}

          <div className={`rounded-xl border px-4 py-4 text-sm ${verdictStyle}`}>
            <p className="text-base font-semibold">{report.plainHeadline}</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed">
              {report.plainBullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="opacity-40">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <StatBox label="Total profit/loss" value={`₹${report.totals.netPnl}`} />
            <StatBox label="Total trades" value={String(report.totals.totalTrades)} />
            <StatBox label="Winning trades" value={`${report.totals.winRate}%`} />
            <StatBox
              label="Green / red days"
              value={`${report.totals.greenDays} / ${report.totals.redDays}`}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#cfe0ee] bg-white">
            <p className="border-b border-[#eef3f8] px-4 py-3 text-[13px] font-semibold text-sky-ink">
              Daily report — what happened each day
            </p>
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#dbe8f2] bg-sky-soft/30 text-sky-ink/55">
                  <th className="px-4 py-2.5">Day</th>
                  <th className="px-4 py-2.5">Trades</th>
                  <th className="px-4 py-2.5">Won</th>
                  <th className="px-4 py-2.5">Lost</th>
                  <th className="px-4 py-2.5">Made / lost ₹</th>
                  <th className="px-4 py-2.5">In simple words</th>
                </tr>
              </thead>
              <tbody>
                {report.dailyRows.map((row) => (
                  <tr key={row.date} className="border-b border-[#eef3f8] text-sky-ink/85">
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium">{row.dayLabel}</td>
                    <td className="px-4 py-2.5">{row.trades}</td>
                    <td className="px-4 py-2.5 text-emerald-700">{row.wins}</td>
                    <td className="px-4 py-2.5 text-rose-600">{row.losses}</td>
                    <td
                      className={`px-4 py-2.5 font-semibold ${
                        row.netPnl > 0
                          ? 'text-emerald-700'
                          : row.netPnl < 0
                            ? 'text-rose-600'
                            : 'text-sky-ink/50'
                      }`}
                    >
                      {row.netPnl > 0 ? '+' : ''}₹{row.netPnl}
                    </td>
                    <td className="px-4 py-2.5 text-sky-ink/65">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sky-soft/40 font-semibold text-sky-ink">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3">{report.totals.totalTrades}</td>
                  <td className="px-4 py-3" colSpan={2} />
                  <td
                    className={`px-4 py-3 ${
                      report.totals.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {report.totals.netPnl >= 0 ? '+' : ''}₹{report.totals.netPnl}
                  </td>
                  <td className="px-4 py-3 text-sky-ink/60">
                    Avg ~₹{report.totals.avgPnlPerDay}/day over {report.tested.daysTested} days
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[11px] text-sky-ink/45">
            Paper simulation only. Live {BLINK_NAME} uses real Upstox option prices — results may
            differ slightly.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-ink/45">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-sky-ink">{value}</p>
    </div>
  );
}
