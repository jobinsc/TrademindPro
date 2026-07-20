export type BlinkStrategyGroup =
  | 'Combo'
  | 'Structure'
  | 'Trend'
  | 'Momentum'
  | 'Volatility'
  | 'Intraday'
  | 'Candles';

export type BlinkStrategyEntry = {
  id: string;
  catalogId: string;
  name: string;
  desc: string;
  group: BlinkStrategyGroup;
  customLive?: boolean;
};

/** All strategies Blink can run in live + backtest */
export const BLINK_STRATEGY_ENTRIES = [
  {
    id: 'cci_hhll_combo',
    catalogId: 'hhll_lonesome',
    name: 'CCI + HH/LL (recommended)',
    desc: 'Structure + CCI must agree — fewer bad entries.',
    group: 'Combo',
    customLive: true,
  },
  {
    id: 'hhll_pa',
    catalogId: 'hhll_lonesome',
    name: 'HH/LL structure only',
    desc: 'Higher high / lower low pivots (Lonesome style).',
    group: 'Structure',
    customLive: true,
  },
  {
    id: 'supertrend',
    catalogId: 'supertrend',
    name: 'Supertrend flip',
    desc: 'Buy when Supertrend turns green, sell when red.',
    group: 'Trend',
  },
  {
    id: 'pdh_pdl_break',
    catalogId: 'pdh_pdl_break',
    name: 'Previous day high / low break',
    desc: 'Break yesterday high → CE, break yesterday low → PE.',
    group: 'Intraday',
  },
  {
    id: 'orb',
    catalogId: 'orb',
    name: 'Opening range break (ORB)',
    desc: 'First 15 min range break — classic open drive.',
    group: 'Intraday',
  },
  {
    id: 'breakout',
    catalogId: 'breakout',
    name: '20-bar breakout',
    desc: 'Price breaks recent high/low channel.',
    group: 'Intraday',
  },
  {
    id: 'macd_hist_flip',
    catalogId: 'macd_hist_flip',
    name: 'MACD histogram flip',
    desc: 'Histogram crosses zero — momentum shift.',
    group: 'Momentum',
  },
  {
    id: 'macd_cross',
    catalogId: 'macd_cross',
    name: 'MACD line cross',
    desc: 'MACD crosses signal line.',
    group: 'Momentum',
  },
  {
    id: 'stoch_cross',
    catalogId: 'stoch_cross',
    name: 'Stochastic cross',
    desc: 'Stoch K/D cross in oversold or overbought zone.',
    group: 'Momentum',
  },
  {
    id: 'stoch_rsi',
    catalogId: 'stoch_rsi',
    name: 'Stochastic RSI',
    desc: 'StochRSI extreme cross — sharper momentum turns.',
    group: 'Momentum',
  },
  {
    id: 'rsi_bounce',
    catalogId: 'rsi_bounce',
    name: 'RSI bounce',
    desc: 'RSI leaves oversold/overbought — mean reversion.',
    group: 'Momentum',
  },
  {
    id: 'williams_r',
    catalogId: 'williams_r',
    name: 'Williams %R',
    desc: 'Leaves −80 / −20 zones — similar to Stochastic.',
    group: 'Momentum',
  },
  {
    id: 'cci_zero',
    catalogId: 'cci_zero',
    name: 'CCI zero-line',
    desc: 'CCI crosses above/below zero.',
    group: 'Momentum',
    customLive: true,
  },
  {
    id: 'bollinger_bounce',
    catalogId: 'bollinger_bounce',
    name: 'Bollinger band bounce',
    desc: 'Buy lower band bounce, sell upper band reject.',
    group: 'Volatility',
  },
  {
    id: 'bollinger_squeeze',
    catalogId: 'bollinger_squeeze',
    name: 'Bollinger squeeze break',
    desc: 'Tight bands then breakout — volatility expansion.',
    group: 'Volatility',
  },
  {
    id: 'donchian_break',
    catalogId: 'donchian_break',
    name: 'Donchian channel break',
    desc: 'Break 20-bar high/low — turtle-style.',
    group: 'Volatility',
  },
  {
    id: 'atr_breakout',
    catalogId: 'atr_breakout',
    name: 'ATR expansion break',
    desc: 'Move bigger than 1.5× ATR from prior close.',
    group: 'Volatility',
  },
  {
    id: 'range_mean_reversion',
    catalogId: 'range_mean_reversion',
    name: 'Range fade (mean reversion)',
    desc: 'Buy near range low, sell near range high.',
    group: 'Volatility',
  },
  {
    id: 'support_bounce',
    catalogId: 'support_bounce',
    name: 'Support / resistance bounce',
    desc: 'Bounce from 30-bar support or reject resistance.',
    group: 'Structure',
  },
  {
    id: 'engulfing_reversal',
    catalogId: 'engulfing_reversal',
    name: 'Engulfing candle',
    desc: 'Bullish/bearish engulfing reversal bar.',
    group: 'Candles',
  },
  {
    id: 'pin_bar',
    catalogId: 'pin_bar',
    name: 'Pin bar / hammer',
    desc: 'Long wick rejection candle.',
    group: 'Candles',
  },
  {
    id: 'inside_bar_break',
    catalogId: 'inside_bar_break',
    name: 'Inside bar break',
    desc: 'Mother bar break after inside consolidation.',
    group: 'Candles',
  },
  {
    id: 'ema_ribbon_pullback',
    catalogId: 'ema_ribbon_pullback',
    name: 'EMA pullback',
    desc: 'Trend on 9/21 EMA — enter on pullback to EMA21.',
    group: 'Trend',
  },
  {
    id: 'ema_rsi',
    catalogId: 'ema_cross',
    name: 'EMA + RSI (fast scalp)',
    desc: 'EMA 9/21 cross filtered by RSI zone.',
    group: 'Trend',
    customLive: true,
  },
] as const satisfies readonly BlinkStrategyEntry[];

export type BlinkStrategyMode = (typeof BLINK_STRATEGY_ENTRIES)[number]['id'];

export const BLINK_STRATEGY_MODES = BLINK_STRATEGY_ENTRIES.map((s) => ({
  id: s.id,
  name: s.name,
  desc: s.desc,
  group: s.group,
}));

export const BLINK_STRATEGY_GROUPS: BlinkStrategyGroup[] = [
  'Combo',
  'Structure',
  'Trend',
  'Intraday',
  'Momentum',
  'Volatility',
  'Candles',
];

export function blinkStrategyEntry(mode: string): BlinkStrategyEntry | undefined {
  return BLINK_STRATEGY_ENTRIES.find((s) => s.id === mode);
}

export function blinkStrategyCatalogId(mode: string): string {
  return blinkStrategyEntry(mode)?.catalogId ?? 'hhll_lonesome';
}

export function blinkStrategyDisplayName(mode: string): string {
  return blinkStrategyEntry(mode)?.name ?? mode;
}

export function isBlinkStrategyMode(mode: string): mode is BlinkStrategyMode {
  return BLINK_STRATEGY_ENTRIES.some((s) => s.id === mode);
}
