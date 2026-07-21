import type { Candle } from '@/lib/nejoic';
import { analyzeBlinkScalp, type BlinkSettings } from '@/lib/blink';
import {
  inTradeWindow,
  istMinutesFromOpen,
  modelEntryPremium,
  pickOptionStrike,
  premiumStep,
  estimateOptionDelta,
  type OptionMoneyness,
} from '@/lib/option-sim';
import { orbStopSpot } from '@/lib/blink-orb';

export type OptionsBacktestInput = {
  symbol: string;
  strikeStep: number;
  blinkSettings: Pick<
    BlinkSettings,
    | 'strategyMode'
    | 'strategyMode2'
    | 'strategyCombine'
    | 'minConfidence'
    | 'emaFast'
    | 'emaSlow'
    | 'rsiPeriod'
    | 'rsiCeMin'
    | 'rsiCeMax'
    | 'rsiPeMin'
    | 'rsiPeMax'
    | 'cciPeriod'
    | 'cciOversold'
    | 'cciOverbought'
    | 'paLeftBars'
    | 'paRightBars'
    | 'strikeMoneyness'
    | 'symbol'
    | 'orbMinutes'
    | 'paLessonFocus'
  >;
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
  const minConf = input.minConfidence ?? input.blinkSettings.minConfidence ?? 60;
  const sl = Math.max(1, input.stopLossPremium);
  const tg = Math.max(1, input.targetPremium);
  const strikeStep = Math.max(0.5, input.strikeStep || 50);
  const settingsWithSymbol = {
    ...input.blinkSettings,
    symbol: input.symbol || input.blinkSettings.symbol || 'NIFTY',
  };
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
    entrySpot: number;
    entryAt: string;
    setup: string;
    /** Structural ORB stop on spot (range low/high) */
    orbStop?: number | null;
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

      // ORB: exit if spot hits the other side of the opening range
      if (pos.orbStop != null) {
        const hitOrbSl =
          (pos.side === 'CE' && spot <= pos.orbStop) ||
          (pos.side === 'PE' && spot >= pos.orbStop);
        if (hitOrbSl) {
          const delta = Math.abs(
            estimateOptionDelta(pos.entrySpot, pos.strike, pos.side)
          );
          const spotMove = Math.abs(pos.entrySpot - pos.orbStop);
          const premLoss = Math.max(
            0.5,
            Math.round(spotMove * Math.max(0.35, delta) * 10) / 10
          );
          closePos(Math.max(0.5, pos.entryPremium - premLoss), bar.t);
          continue;
        }
      }

      if (move <= -sl) {
        closePos(pos.entryPremium - sl, bar.t);
      } else if (move >= tg) {
        closePos(pos.entryPremium + tg, bar.t);
      } else {
        const scalp = analyzeBlinkScalp(window, settingsWithSymbol, spot);
        if (scalp.confidence >= minConf) {
          if (pos.side === 'CE' && scalp.bias === 'PE') closePos(pos.premium, bar.t);
          else if (pos.side === 'PE' && scalp.bias === 'CE') closePos(pos.premium, bar.t);
        }
      }
    }

    if (!pos) {
      if (!canOpenOnDay(bar.t)) continue;
      const scalp = analyzeBlinkScalp(window, settingsWithSymbol, spot);
      if (
        (scalp.bias === 'CE' || scalp.bias === 'PE') &&
        scalp.confidence >= minConf
      ) {
        const strike = pickOptionStrike(spot, scalp.bias, input.strikeMoneyness, strikeStep);
        const mins = istMinutesFromOpen(bar.t);
        const entryPremium = modelEntryPremium(spot, strike, scalp.bias, mins);
        const isOrb = scalp.setup?.startsWith('ORB_BREAK');
        getDay(bar.t).trades += 1;
        pos = {
          side: scalp.bias,
          strike,
          entryPremium,
          premium: entryPremium,
          peak: entryPremium,
          lastSpot: spot,
          entrySpot: spot,
          entryAt: bar.t,
          setup: scalp.setup,
          orbStop:
            isOrb && scalp.orHigh != null && scalp.orLow != null
              ? orbStopSpot(scalp.bias, scalp.orHigh, scalp.orLow)
              : null,
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
