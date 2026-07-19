'use client';

import { CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { calcPnL, isOpenTrade, tradeStyleLabel, type Trade } from '@/lib/trades';
import { cn, formatCurrency } from '@/lib/utils';
import { SymbolChartLink } from '@/components/chart/SymbolChartLink';

export default function TradeTable({
  trades,
  onEdit,
  onClose,
  onDelete,
}: {
  trades: Trade[];
  onEdit: (trade: Trade) => void;
  onClose: (trade: Trade) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e8f2fa] bg-sky-soft/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
              <th className="px-3 py-3">Entry</th>
              <th className="px-3 py-3">Symbol</th>
              <th className="px-3 py-3">Style</th>
              <th className="px-3 py-3">Side</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Entry / Exit</th>
              <th className="px-3 py-3">Live</th>
              <th className="px-3 py-3">MTM</th>
              <th className="px-3 py-3">Signal</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">P&L</th>
              <th className="px-3 py-3">Strategy</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const open = isOpenTrade(trade);
              const pnl = calcPnL(trade);
              const live = trade.live;
              const mtm = open ? live?.unrealized ?? null : pnl;
              return (
                <tr
                  key={trade.id}
                  className="border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/40"
                >
                  <td className="px-3 py-3 text-sky-ink/70">
                    <p>{trade.tradeDate}</p>
                    {!open && trade.exitDate && (
                      <p className="text-[11px] text-sky-ink/40">Exit {trade.exitDate}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <SymbolChartLink symbol={trade.symbol} exchange="NSE" className="font-semibold">
                      {trade.symbol}
                    </SymbolChartLink>
                    <p className="text-[11px] text-sky-ink/40">{trade.segment}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-sky-soft px-2 py-0.5 text-[11px] font-bold text-sky-deep">
                      {tradeStyleLabel(trade.style)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        trade.side === 'BUY'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-sky-ink/80">{trade.qty}</td>
                  <td className="px-3 py-3 tabular-nums text-sky-ink/70">
                    {trade.entryPrice.toFixed(2)}
                    {open ? (
                      <span className="text-sky-ink/40"> → open</span>
                    ) : (
                      <> → {trade.exitPrice!.toFixed(2)}</>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {live?.ltp != null ? (
                      <div>
                        <p className="font-semibold text-sky-ink">{live.ltp.toFixed(2)}</p>
                        {live.changePct != null && (
                          <p
                            className={cn(
                              'text-[11px] font-bold',
                              live.changePct >= 0 ? 'text-emerald-600' : 'text-rose-500'
                            )}
                          >
                            {live.changePct >= 0 ? '+' : ''}
                            {live.changePct.toFixed(2)}%
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sky-ink/35">…</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums">
                    {mtm == null ? (
                      <span className="text-sky-ink/35">—</span>
                    ) : (
                      <span
                        className={
                          mtm > 0
                            ? 'text-emerald-600'
                            : mtm < 0
                              ? 'text-rose-500'
                              : 'text-sky-ink'
                        }
                      >
                        {formatCurrency(mtm)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {live && live.setup !== 'PENDING' ? (
                      <div className="max-w-[140px]">
                        <p
                          className={cn(
                            'text-[11px] font-bold',
                            live.bias === 'CE'
                              ? 'text-emerald-700'
                              : live.bias === 'PE'
                                ? 'text-rose-600'
                                : 'text-sky-ink/60'
                          )}
                        >
                          {live.bias === 'CE' ? 'BULL' : live.bias === 'PE' ? 'BEAR' : 'FLAT'} ·{' '}
                          {live.confidence}%
                        </p>
                        <p
                          className="truncate text-[11px] font-medium text-sky-ink/55"
                          title={live.structureText || live.setup}
                        >
                          {live.pattern !== '—' && live.pattern !== '…'
                            ? live.pattern
                            : live.setup}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-sky-ink/35">Scanning…</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {open ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        OPEN
                      </span>
                    ) : (
                      <span className="rounded-md bg-sky-mist px-2 py-0.5 text-[11px] font-bold text-sky-deep">
                        CLOSED
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums">
                    {pnl === null ? (
                      <span className="text-sky-ink/35">—</span>
                    ) : (
                      <span
                        className={
                          pnl > 0
                            ? 'text-emerald-600'
                            : pnl < 0
                              ? 'text-rose-500'
                              : 'text-sky-ink'
                        }
                      >
                        {formatCurrency(pnl)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sky-ink/65">{trade.strategy}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      {open && (
                        <button
                          type="button"
                          onClick={() => onClose(trade)}
                          className="rounded-lg p-2 text-sky-ink/45 hover:bg-emerald-50 hover:text-emerald-600"
                          title="Close trade (add exit)"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEdit(trade)}
                        className="rounded-lg p-2 text-sky-ink/45 hover:bg-sky-mist hover:text-sky-deep"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(trade.id)}
                        className="rounded-lg p-2 text-sky-ink/45 hover:bg-rose-50 hover:text-rose-500"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
