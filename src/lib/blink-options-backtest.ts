import type { Candle } from '@/lib/nejoic';
import { runCatalogSignal } from '@/lib/backtest-signals';
import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import {
  inTradeWindow,
  istMinutesFromOpen,
  modelEntryPremium,
  pickOptionStrike,
  premiumStep,
  type OptionMoneyness,
} from '@/lib/option-sim';

export type OptionsBacktestInput = {
  strategyId: string;
  fromDate: string;
  toDate: string;
  stopLossPremium: number;
  targetPremium: number;
  lots: number;
  lotSize: number;
  brokeragePerLot: number;
  initialCapital: number;
  strikeMoneyness: OptionMoneyness;
  tradeWindowStart: string;
  tradeWindowEnd: string;
  minConfidence?: number;
  maxTradesPerDay?: number;
  dailyMaxLoss?: number;
  dailyProfitTarget?: number;
};

export type OptionsBacktestTrade = {
  entryAt: string;
  exitAt: string;
  side: 'CE' | 'PE';
  strike: number;
  entryPremium: number;
  exitPremium: number;
  pnl: number;
  setup: string;
};

export type OptionsBacktestResult = {
  totalTrades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdown: number;
  trades: OptionsBacktestTrade[];
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function initDayStats() {
  return { trades: 0, pnl: 0 };
}

/**
 * Walk Nifty 1m candles with synthetic option premium (delta model).
 * SL/TGT in premium points; P&L in ₹ with lots × lotSize − brokerage.
 */
export function runOptionsPremiumBacktest(
  candles: Candle[],
  input: OptionsBacktestInput
): OptionsBacktestResult {
  const capital = Math.max(1000, input.initialCapital || 100_000);
  const minConf = input.minConfidence ?? 60;
  const sl = Math.max(1, input.stopLossPremium);
  const tg = Math.max(1, input.targetPremium);
  const mult = input.lots * input.lotSize;
  const brokerage = input.brokeragePerLot * input.lots;
  const maxTradesDay = Math.max(1, input.maxTradesPerDay ?? 99);
  const maxLossDay = Math.max(0, input.dailyMaxLoss ?? 0);
  const profitTargetDay = Math.max(0, input.dailyProfitTarget ?? 0);

  const dayStats = new Map<string, { trades: number; pnl: number }>();
  const getDay = (iso: string) => {
    const k = dayKey(iso);
    if (!dayStats.has(k)) dayStats.set(k, initDayStats());
    return dayStats.get(k)!;
  };

  const canOpenOnDay = (iso: string) => {
    const d = getDay(iso);
    if (d.trades >= maxTradesDay) return false;
    if (maxLossDay > 0 && d.pnl <= -maxLossDay) return false;
    if (profitTargetDay > 0 && d.pnl >= profitTargetDay) return false;
    return true;
  };

  const series = candles.filter((c) => {
    const d = dayKey(c.t);
    if (d < input.fromDate || d > input.toDate) return false;
    return inTradeWindow(c.t, input.tradeWindowStart, input.tradeWindowEnd);
  });

  type Pos = {
    side: 'CE' | 'PE';
    strike: number;
    entryPremium: number;
    premium: number;
    peak: number;
    lastSpot: number;
    entryAt: string;
    setup: string;
  };

  let cash = capital;
  let pos: Pos | null = null;
  const trades: OptionsBacktestTrade[] = [];
  let peak = capital;
  let maxDrawdown = 0;

  const closePos = (exitPremium: number, exitAt: string) => {
    if (!pos) return;
    const gross = (exitPremium - pos.entryPremium) * mult;
    const pnl = Math.round((gross - brokerage) * 100) / 100;
    cash += pnl;
    trades.push({
      entryAt: pos.entryAt,
      exitAt,
      side: pos.side,
      strike: pos.strike,
      entryPremium: pos.entryPremium,
      exitPremium,
      pnl,
      setup: pos.setup,
    });
    const d = getDay(exitAt);
    d.pnl = Math.round((d.pnl + pnl) * 100) / 100;
    pos = null;
    if (cash > peak) peak = cash;
    maxDrawdown = Math.max(maxDrawdown, peak - cash);
  };

  const start = Math.min(60, Math.max(20, Math.floor(series.length * 0.12)));

  for (let i = start; i < series.length; i++) {
    const window = series.slice(0, i + 1);
    const bar = series[i];
    const spot = bar.close;

    if (pos) {
      pos.premium = premiumStep(pos.premium, pos.lastSpot, spot, pos.strike, pos.side);
      pos.lastSpot = spot;
      pos.peak = Math.max(pos.peak, pos.premium);
      const move = pos.premium - pos.entryPremium;

      if (move <= -sl) {
        closePos(pos.entryPremium - sl, bar.t);
      } else if (move >= tg) {
        closePos(pos.entryPremium + tg, bar.t);
      } else {
        const sig = runCatalogSignal(input.strategyId as CatalogStrategyId, window);
        if (sig && sig.confidence >= minConf) {
          if (pos.side === 'CE' && sig.bias === 'PE') closePos(pos.premium, bar.t);
          else if (pos.side === 'PE' && sig.bias === 'CE') closePos(pos.premium, bar.t);
        }
      }
    }

    if (!pos) {
      if (!canOpenOnDay(bar.t)) continue;
      const sig = runCatalogSignal(input.strategyId as CatalogStrategyId, window);
      if (
        sig &&
        (sig.bias === 'CE' || sig.bias === 'PE') &&
        sig.confidence >= minConf
      ) {
        const strike = pickOptionStrike(spot, sig.bias, input.strikeMoneyness);
        const mins = istMinutesFromOpen(bar.t);
        const entryPremium = modelEntryPremium(spot, strike, sig.bias, mins);
        getDay(bar.t).trades += 1;
        pos = {
          side: sig.bias,
          strike,
          entryPremium,
          premium: entryPremium,
          peak: entryPremium,
          lastSpot: spot,
          entryAt: bar.t,
          setup: sig.setup,
        };
      }
    }
  }

  if (pos && series.length) {
    closePos(pos.premium, series[series.length - 1].t);
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = Math.round((cash - capital) * 100) / 100;
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99 : 0;

  return {
    totalTrades: trades.length,
    winRate: Math.round(winRate * 10) / 10,
    netPnl,
    profitFactor,
    maxDrawdown: Math.round(maxDrawdown),
    trades,
  };
}
