'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME } from '@/lib/blink';
import type { BacktestRun } from '@/lib/backtest';
import { todayISO } from '@/lib/trades';

type TuneRow = {
  sl: number;
  tg: number;
  netPnl: number;
  winRate: number;
  profitFactor: number;
  trades: number;
};

const SL_GRID = [5, 8, 10, 12, 15];
const TG_GRID = [3, 5, 8, 10, 12];

/** Map Blink signal engine → catalog backtest strategy */
function blinkStrategyForBacktest(mode: string): { id: string; label: string } {
  switch (mode) {
    case 'cci_zero':
      return { id: 'cci_zero', label: 'CCI zero-line' };
    case 'hhll_pa':
    case 'cci_hhll_combo':
      return { id: 'hhll_lonesome', label: 'HH/LL Lonesome (5/5)' };
    default:
      return { id: 'ema_cross', label: 'EMA 9/21 cross' };
  }
}

export function BlinkBacktestTunePanel() {
  const { settings, updateSettings } = useBlink();
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<TuneRow[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function runTune() {
    setRunning(true);
    setError('');
    setRows([]);
    const toDate = todayISO();
    const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const out: TuneRow[] = [];

    try {
      const strat = blinkStrategyForBacktest(settings.strategyMode);
      let i = 0;
      const total = SL_GRID.length * TG_GRID.length;
      for (const sl of SL_GRID) {
        for (const tg of TG_GRID) {
          i += 1;
          setProgress(`Testing ${strat.label} · SL ${sl} / Tgt ${tg} (${i}/${total})…`);
          const res = await fetch('/api/market/backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              strategyId: strat.id,
              strategyName: `${BLINK_NAME} · ${strat.label}`,
              symbol: 'NIFTY',
              timeframe: '1m',
              fromDate,
              toDate,
              initialCapital: 100000,
              stopLossPoints: sl,
              targetPoints: tg,
            }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            run?: BacktestRun;
          };
          if (!res.ok || !data.ok || !data.run) {
            throw new Error(data.error || `Backtest failed SL ${sl} Tgt ${tg}`);
          }
          out.push({
            sl,
            tg,
            netPnl: data.run.netPnl,
            winRate: data.run.winRate,
            profitFactor: data.run.profitFactor,
            trades: data.run.totalTrades,
          });
        }
      }
      out.sort((a, b) => {
        if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
        return b.netPnl - a.netPnl;
      });
      setRows(out);
      setProgress('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tune failed');
      setProgress('');
    } finally {
      setRunning(false);
    }
  }

  function applyRow(row: TuneRow) {
    updateSettings({
      stopLossPoints: row.sl,
      targetPoints: row.tg,
    });
  }

  const best = rows[0];

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-sky-soft/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-sky-ink">
            SL / Target tuning
          </h3>
          <p className="mt-1 max-w-xl text-[12px] text-sky-ink/55">
            Grid-search on Nifty 1m (last ~30 days) using your selected{' '}
            <strong>Signal engine</strong> above. Uses index <em>spot points</em> as a rough proxy
            (not option premium ₹). If every row is red, the entries — not just SL/Tgt — need
            work. Prefer rows where Tgt ≥ SL and PF &gt; 1.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runTune()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          {running ? 'Running…' : 'Run tune'}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-sky-ink/45">
        Current Blink: SL {settings.stopLossPoints} · Tgt {settings.targetPoints} premium pts
      </p>

      {progress ? <p className="mt-2 text-sm text-sky-mid">{progress}</p> : null}
      {error ? (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {best ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            best.netPnl >= 0 && best.profitFactor >= 1
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
              : 'border-amber-200 bg-amber-50/80 text-amber-950'
          }`}
        >
          {best.netPnl >= 0 && best.profitFactor >= 1 ? (
            <>
              Best grid: SL <strong>{best.sl}</strong> / Tgt <strong>{best.tg}</strong> · PF{' '}
              {best.profitFactor.toFixed(2)} · Win {best.winRate.toFixed(0)}% · {best.trades}{' '}
              trades
            </>
          ) : (
            <>
              No profitable combo in this grid — best was still negative: SL{' '}
              <strong>{best.sl}</strong> / Tgt <strong>{best.tg}</strong> · PF{' '}
              {best.profitFactor.toFixed(2)} · Win {best.winRate.toFixed(0)}%. Try{' '}
              <strong>CCI + HH/LL</strong> engine, or target ≥ stop (e.g. SL 5 / Tgt 8).
            </>
          )}
          <button
            type="button"
            onClick={() => applyRow(best)}
            className="ml-3 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
          >
            Apply to Blink
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#dbe8f2] text-sky-ink/50">
                <th className="py-2 pr-3">SL</th>
                <th className="py-2 pr-3">Tgt</th>
                <th className="py-2 pr-3">Net P&L</th>
                <th className="py-2 pr-3">Win%</th>
                <th className="py-2 pr-3">PF</th>
                <th className="py-2 pr-3">Trades</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={`${r.sl}-${r.tg}`} className="border-b border-[#eef3f8] text-sky-ink/80">
                  <td className="py-2 pr-3">{r.sl}</td>
                  <td className="py-2 pr-3">{r.tg}</td>
                  <td className="py-2 pr-3">₹{Math.round(r.netPnl)}</td>
                  <td className="py-2 pr-3">{r.winRate.toFixed(0)}%</td>
                  <td className="py-2 pr-3">{r.profitFactor.toFixed(2)}</td>
                  <td className="py-2 pr-3">{r.trades}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => applyRow(r)}
                      className="text-sky-deep font-semibold hover:underline"
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
