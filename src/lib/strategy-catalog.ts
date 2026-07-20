/**
 * Single source of truth for popular strategies + timeframes
 * used across Strategy Builder, Backtesting, Journal, Nejoic, Alerts.
 */

export type StrategyGroupId =
  | 'price_action'
  | 'candlestick_patterns'
  | 'smc'
  | 'moving_averages'
  | 'momentum'
  | 'volatility'
  | 'intraday'
  | 'structure';

export type CatalogStrategyId =
  | 'price_action_hhll'
  | 'swing_hl'
  | 'inside_bar_break'
  | 'engulfing_reversal'
  | 'pin_bar'
  | 'morning_star'
  | 'evening_star'
  | 'hammer'
  | 'inverted_hammer'
  | 'shooting_star'
  | 'hanging_man'
  | 'doji_reversal'
  | 'three_white_soldiers'
  | 'three_black_crows'
  | 'harami_bull'
  | 'harami_bear'
  | 'tweezer_top'
  | 'tweezer_bottom'
  | 'marubozu_break'
  | 'smc_order_block_bull'
  | 'smc_order_block_bear'
  | 'smc_fvg_bull'
  | 'smc_fvg_bear'
  | 'smc_liquidity_sweep_high'
  | 'smc_liquidity_sweep_low'
  | 'smc_bos_bull'
  | 'smc_bos_bear'
  | 'smc_choch_bull'
  | 'smc_choch_bear'
  | 'smc_breaker_block'
  | 'smc_mitigation_block'
  | 'smc_premium_discount'
  | 'smc_inducement'
  | 'ema_cross'
  | 'ema_20_50'
  | 'sma_50_200'
  | 'ema_ribbon_pullback'
  | 'rsi_bounce'
  | 'stoch_cross'
  | 'stoch_rsi'
  | 'macd_cross'
  | 'macd_hist_flip'
  | 'cci_zero'
  | 'williams_r'
  | 'hhll_lonesome'
  | 'bollinger_bounce'
  | 'bollinger_squeeze'
  | 'donchian_break'
  | 'supertrend'
  | 'atr_breakout'
  | 'breakout'
  | 'orb'
  | 'vwap_reclaim'
  | 'pdh_pdl_break'
  | 'gap_fill'
  | 'support_bounce'
  | 'range_mean_reversion';

export type CatalogStrategy = {
  id: CatalogStrategyId;
  name: string;
  short: string;
  group: StrategyGroupId;
  defaultTimeframe: string;
  /** Can run in backtest engine + Nejoic signal layer */
  executable: boolean;
  /** Show in Nejoic multi-select */
  nejoic: boolean;
  entryRule: string;
  exitRule: string;
  stopLoss: string;
  target: string;
  /** Default stop distance in points (optional — defaults applied) */
  stopLossPoints?: number;
  /** Default target distance in points */
  targetPoints?: number;
  market: 'NSE' | 'BSE' | 'NIFTY' | 'BANKNIFTY';
};

export const STRATEGY_GROUPS: {
  id: StrategyGroupId;
  title: string;
  hint: string;
}[] = [
  {
    id: 'price_action',
    title: 'Price action',
    hint: 'Structure, swings, breakouts — HH/HL, LH/LL, inside bars.',
  },
  {
    id: 'candlestick_patterns',
    title: 'Candlestick patterns',
    hint: 'Classic reversal & continuation candle setups.',
  },
  {
    id: 'smc',
    title: 'SMC techniques',
    hint: 'Smart Money Concepts — order blocks, FVG, liquidity, BOS/CHoCH.',
  },
  {
    id: 'moving_averages',
    title: 'Moving averages',
    hint: 'EMA / SMA crosses and pullbacks.',
  },
  {
    id: 'momentum',
    title: 'Momentum & oscillators',
    hint: 'RSI, Stochastic, MACD, CCI, Williams %R.',
  },
  {
    id: 'volatility',
    title: 'Volatility & channels',
    hint: 'Bollinger, Donchian, Supertrend, ATR.',
  },
  {
    id: 'intraday',
    title: 'Intraday / session',
    hint: 'ORB, VWAP, PDH/PDL, gaps — India cash friendly.',
  },
  {
    id: 'structure',
    title: 'Levels & ranges',
    hint: 'Support / resistance and mean reversion.',
  },
];

export const POPULAR_STRATEGIES: CatalogStrategy[] = [
  {
    id: 'price_action_hhll',
    name: 'Long · HH / HL',
    short: 'Higher High / Higher Low → long bias.',
    group: 'price_action',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when structure prints HH + HL',
    exitRule: 'Exit on LH / LL or opposite swing',
    stopLoss: 'Below last HL',
    target: '1.5R or next resistance',
    market: 'NIFTY',
  },
  {
    id: 'hhll_lonesome',
    name: 'HH/LL · Lonesome (5/5 pivots)',
    short: 'TradingView HH/HL/LH/LL with S/R trend — LonesomeThecolor.blue port.',
    group: 'price_action',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'HL → CE · LH → PE · trend from S/R breaks (lb=5, rb=5)',
    exitRule: 'Opposite structure label or S/R break',
    stopLoss: 'Beyond last HL/LH pivot',
    target: '1.5R or next S/R',
    market: 'NIFTY',
  },
  {
    id: 'swing_hl',
    name: 'Short · LH / LL',
    short: 'Lower High / Lower Low → short bias.',
    group: 'price_action',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Sell / PE when structure prints LH + LL',
    exitRule: 'Exit on HH / HL',
    stopLoss: 'Above last LH',
    target: '1.5R or next support',
    market: 'NIFTY',
  },
  {
    id: 'inside_bar_break',
    name: 'Inside Bar Breakout',
    short: 'Break of mother-bar high/low after compression.',
    group: 'price_action',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter on break of inside-bar mother high/low',
    exitRule: 'Opposite break or target',
    stopLoss: 'Other side of mother bar',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'engulfing_reversal',
    name: 'Engulfing Reversal',
    short: 'Bullish/bearish engulfing at swings.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter with engulfing candle direction',
    exitRule: 'Opposite engulfing or target',
    stopLoss: 'Beyond engulfing wick',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'pin_bar',
    name: 'Pin Bar Rejection',
    short: 'Long wick rejection at extremes.',
    group: 'candlestick_patterns',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Enter in direction of pin-bar body',
    exitRule: 'Target or opposite pin',
    stopLoss: 'Beyond pin wick',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'morning_star',
    name: 'Morning Star',
    short: 'Three-candle bullish reversal at lows.',
    group: 'candlestick_patterns',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy after morning star completes at support',
    exitRule: 'Target or evening star',
    stopLoss: 'Below star low',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'evening_star',
    name: 'Evening Star',
    short: 'Three-candle bearish reversal at highs.',
    group: 'candlestick_patterns',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Sell / PE after evening star at resistance',
    exitRule: 'Target or morning star',
    stopLoss: 'Above star high',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'hammer',
    name: 'Hammer',
    short: 'Bullish hammer at support.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy hammer close above body mid',
    exitRule: 'Opposite pattern or target',
    stopLoss: 'Below hammer wick',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'inverted_hammer',
    name: 'Inverted Hammer',
    short: 'Bullish reversal wick at bottom.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy confirmation above inverted hammer',
    exitRule: 'Target or breakdown',
    stopLoss: 'Below wick low',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'shooting_star',
    name: 'Shooting Star',
    short: 'Bearish rejection at highs.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Sell / PE on shooting star at resistance',
    exitRule: 'Target or bullish engulf',
    stopLoss: 'Above upper wick',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'hanging_man',
    name: 'Hanging Man',
    short: 'Bearish warning after uptrend.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on break below hanging man body',
    exitRule: 'Target or hammer reversal',
    stopLoss: 'Above high',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'doji_reversal',
    name: 'Doji Reversal',
    short: 'Indecision doji at swing extreme.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter on break of doji high/low',
    exitRule: 'Opposite break',
    stopLoss: 'Other side of doji',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'three_white_soldiers',
    name: 'Three White Soldiers',
    short: 'Three strong bullish candles in row.',
    group: 'candlestick_patterns',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy pullback after third soldier',
    exitRule: 'Bearish engulf or target',
    stopLoss: 'Below last soldier open',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'three_black_crows',
    name: 'Three Black Crows',
    short: 'Three bearish candles in row.',
    group: 'candlestick_patterns',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'PE on rally into third crow zone',
    exitRule: 'Bullish reversal or target',
    stopLoss: 'Above crows high',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'harami_bull',
    name: 'Bullish Harami',
    short: 'Small body inside prior bear bar.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy break above harami mother high',
    exitRule: 'Target or bear harami',
    stopLoss: 'Below mother low',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'harami_bear',
    name: 'Bearish Harami',
    short: 'Small body inside prior bull bar.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on break below harami mother low',
    exitRule: 'Target or bull harami',
    stopLoss: 'Above mother high',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'tweezer_top',
    name: 'Tweezer Top',
    short: 'Matching highs — double top candles.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on break below tweezer lows',
    exitRule: 'Target or new high',
    stopLoss: 'Above tweezer highs',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'tweezer_bottom',
    name: 'Tweezer Bottom',
    short: 'Matching lows — double bottom candles.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy break above tweezer highs',
    exitRule: 'Target or new low',
    stopLoss: 'Below tweezer lows',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'marubozu_break',
    name: 'Marubozu Breakout',
    short: 'Full-body candle momentum continuation.',
    group: 'candlestick_patterns',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter in direction of marubozu close',
    exitRule: 'Opposite marubozu or target',
    stopLoss: 'Midpoint of marubozu',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'smc_order_block_bull',
    name: 'Order Block · Bullish',
    short: 'Last down candle before impulsive up move.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy retest of bullish order block',
    exitRule: 'OB invalidation or liquidity target',
    stopLoss: 'Below order block',
    target: 'Next liquidity pool',
    market: 'NIFTY',
  },
  {
    id: 'smc_order_block_bear',
    name: 'Order Block · Bearish',
    short: 'Last up candle before impulsive down move.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on bearish order block retest',
    exitRule: 'OB invalidation or target',
    stopLoss: 'Above order block',
    target: 'Sell-side liquidity',
    market: 'NIFTY',
  },
  {
    id: 'smc_fvg_bull',
    name: 'Fair Value Gap · Bull',
    short: 'Bullish FVG — gap between wicks.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when price fills bullish FVG and holds',
    exitRule: 'FVG fully closed against or target',
    stopLoss: 'Below FVG',
    target: '1.5R or BSL',
    market: 'NIFTY',
  },
  {
    id: 'smc_fvg_bear',
    name: 'Fair Value Gap · Bear',
    short: 'Bearish FVG — gap to be filled.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on bearish FVG fill and rejection',
    exitRule: 'FVG closed against or target',
    stopLoss: 'Above FVG',
    target: '1.5R or SSL',
    market: 'NIFTY',
  },
  {
    id: 'smc_liquidity_sweep_high',
    name: 'Liquidity Sweep · Highs',
    short: 'Stop hunt above highs then reversal.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE after sweep of equal highs / PDH',
    exitRule: 'Target SSL or structure break',
    stopLoss: 'Above sweep wick',
    target: 'Next support / FVG',
    market: 'NIFTY',
  },
  {
    id: 'smc_liquidity_sweep_low',
    name: 'Liquidity Sweep · Lows',
    short: 'Stop hunt below lows then reversal.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy after sweep of equal lows / PDL',
    exitRule: 'Target BSL or structure break',
    stopLoss: 'Below sweep wick',
    target: 'Next resistance / FVG',
    market: 'NIFTY',
  },
  {
    id: 'smc_bos_bull',
    name: 'Break of Structure · Bull',
    short: 'BOS up — continuation of bullish trend.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy on bullish BOS with displacement',
    exitRule: 'CHoCH against or target',
    stopLoss: 'Below last HL',
    target: 'External liquidity high',
    market: 'NIFTY',
  },
  {
    id: 'smc_bos_bear',
    name: 'Break of Structure · Bear',
    short: 'BOS down — continuation of bearish trend.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE on bearish BOS with displacement',
    exitRule: 'CHoCH against or target',
    stopLoss: 'Above last LH',
    target: 'External liquidity low',
    market: 'NIFTY',
  },
  {
    id: 'smc_choch_bull',
    name: 'CHoCH · Bullish',
    short: 'Change of character to bullish.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy after bullish CHoCH + OB retest',
    exitRule: 'Bearish CHoCH or target',
    stopLoss: 'Below CHoCH swing',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'smc_choch_bear',
    name: 'CHoCH · Bearish',
    short: 'Change of character to bearish.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'PE after bearish CHoCH + OB retest',
    exitRule: 'Bullish CHoCH or target',
    stopLoss: 'Above CHoCH swing',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'smc_breaker_block',
    name: 'Breaker Block',
    short: 'Failed order block flip — breaker entry.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter on breaker block retest after failure',
    exitRule: 'Invalidation or liquidity',
    stopLoss: 'Beyond breaker',
    target: 'Opposite liquidity',
    market: 'NIFTY',
  },
  {
    id: 'smc_mitigation_block',
    name: 'Mitigation Block',
    short: 'Mitigate imbalance before continuation.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Trade mitigation of prior inefficiency',
    exitRule: 'Full mitigation against',
    stopLoss: 'Beyond mitigation zone',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'smc_premium_discount',
    name: 'Premium / Discount Array',
    short: 'Buy discount, sell premium of range.',
    group: 'smc',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy below 50% equilibrium; PE above',
    exitRule: 'Opposite array or target',
    stopLoss: 'Beyond array boundary',
    target: 'Equilibrium or opposite array',
    market: 'NIFTY',
  },
  {
    id: 'smc_inducement',
    name: 'Inducement · Trap',
    short: 'False break to induce before real move.',
    group: 'smc',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter after inducement sweep + reversal',
    exitRule: 'Second inducement or target',
    stopLoss: 'Beyond trap wick',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'ema_cross',
    name: 'EMA 9/21 Cross',
    short: 'Fast EMA crosses Slow EMA.',
    group: 'moving_averages',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when EMA 9 crosses above EMA 21',
    exitRule: 'Exit when EMA 9 crosses below EMA 21',
    stopLoss: '0.5–1× ATR below entry',
    target: '1.5R or trailing',
    market: 'NIFTY',
  },
  {
    id: 'ema_20_50',
    name: 'EMA 20/50 Cross',
    short: 'Swing EMA cross — fewer signals.',
    group: 'moving_averages',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when EMA 20 crosses above EMA 50',
    exitRule: 'Opposite cross',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'sma_50_200',
    name: 'SMA 50/200 Golden Cross',
    short: 'Classic golden / death cross.',
    group: 'moving_averages',
    defaultTimeframe: '1D',
    executable: true,
    nejoic: true,
    entryRule: 'Buy on SMA 50 cross above SMA 200',
    exitRule: 'Death cross or target',
    stopLoss: 'Below recent swing',
    target: 'Trail with SMA 50',
    market: 'NSE',
  },
  {
    id: 'ema_ribbon_pullback',
    name: 'EMA Ribbon Pullback',
    short: 'Trend pullback to EMA 9/21 stack.',
    group: 'moving_averages',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'In uptrend, buy pullback that holds EMA 21',
    exitRule: 'Close below EMA 21 or target',
    stopLoss: 'Below pullback low',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'rsi_bounce',
    name: 'RSI Bounce',
    short: 'Turn from oversold / overbought.',
    group: 'momentum',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when RSI crosses up from below 30',
    exitRule: 'Exit at RSI 60 or resistance',
    stopLoss: 'Below recent swing low',
    target: 'Previous swing high',
    market: 'NSE',
  },
  {
    id: 'stoch_cross',
    name: 'Stochastic Cross',
    short: '%K crosses %D in extreme zones.',
    group: 'momentum',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy %K cross above %D from oversold',
    exitRule: 'Opposite cross or target',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'stoch_rsi',
    name: 'Stochastic RSI',
    short: 'Stoch applied to RSI for sharper turns.',
    group: 'momentum',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy StochRSI cross up from <20',
    exitRule: 'Cross down from >80',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'macd_cross',
    name: 'MACD Cross',
    short: 'MACD line crosses signal (12/26/9).',
    group: 'momentum',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when MACD crosses above signal',
    exitRule: 'Opposite cross',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'macd_hist_flip',
    name: 'MACD Histogram Flip',
    short: 'Histogram turns from − to + (or reverse).',
    group: 'momentum',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when hist flips positive',
    exitRule: 'Hist flips negative',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'cci_zero',
    name: 'CCI Zero-Line',
    short: 'CCI crosses 0 with momentum.',
    group: 'momentum',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy CCI cross above 0',
    exitRule: 'CCI cross below 0',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NSE',
  },
  {
    id: 'williams_r',
    name: 'Williams %R Reverse',
    short: 'Exit oversold/overbought on %R.',
    group: 'momentum',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when %R rises from below −80',
    exitRule: 'Falls from above −20',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'bollinger_bounce',
    name: 'Bollinger Bounce',
    short: 'Mean reversion from outer bands.',
    group: 'volatility',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy touch of lower band with close back inside',
    exitRule: 'Mid band or opposite band',
    stopLoss: 'Beyond band wick',
    target: 'Middle band',
    market: 'NSE',
  },
  {
    id: 'bollinger_squeeze',
    name: 'Bollinger Squeeze Break',
    short: 'Break after band width compression.',
    group: 'volatility',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Enter breakout after squeeze (narrow bands)',
    exitRule: 'Opposite band or target',
    stopLoss: 'Other side of squeeze range',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'donchian_break',
    name: 'Donchian Breakout',
    short: 'Turtle-style N-bar high/low break.',
    group: 'volatility',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy break of 20-bar high',
    exitRule: 'Break of 10-bar low',
    stopLoss: 'Donchian mid / ATR',
    target: 'Trail',
    market: 'NSE',
  },
  {
    id: 'supertrend',
    name: 'Supertrend Flip',
    short: 'ATR Supertrend direction change.',
    group: 'volatility',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy when Supertrend flips bullish',
    exitRule: 'Flip bearish',
    stopLoss: 'Supertrend line',
    target: 'Trail with Supertrend',
    market: 'NIFTY',
  },
  {
    id: 'atr_breakout',
    name: 'ATR Breakout',
    short: 'Close beyond prior close ± k×ATR.',
    group: 'volatility',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy close > prior close + 1.5 ATR',
    exitRule: 'Opposite ATR break or target',
    stopLoss: '1× ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'breakout',
    name: 'Range Breakout',
    short: 'Break of recent high / low lookback.',
    group: 'volatility',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'CE if price breaks recent high; PE if low',
    exitRule: 'Opposite break or target',
    stopLoss: 'Other side of range',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'orb',
    name: 'ORB (Opening Range)',
    short: 'Break of first N minutes high/low.',
    group: 'intraday',
    defaultTimeframe: '5m',
    executable: true,
    nejoic: true,
    entryRule: 'Break of first 15-min high with follow-through',
    exitRule: 'Square off by 3:15 or opposite break',
    stopLoss: 'Below opening range low',
    target: '1:1.5 RR',
    market: 'BANKNIFTY',
  },
  {
    id: 'vwap_reclaim',
    name: 'VWAP Reclaim',
    short: 'Reclaim above / reject below session VWAP.',
    group: 'intraday',
    defaultTimeframe: '5m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy reclaim above VWAP',
    exitRule: 'Lost VWAP or target',
    stopLoss: 'Below VWAP / ATR',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'pdh_pdl_break',
    name: 'PDH / PDL Break',
    short: 'Break of previous day high or low.',
    group: 'intraday',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy break of previous day high',
    exitRule: 'Back inside or target',
    stopLoss: 'Back below PDH / above PDL',
    target: '1.5R',
    market: 'NIFTY',
  },
  {
    id: 'gap_fill',
    name: 'Gap Fill',
    short: 'Fade open gap toward prior close.',
    group: 'intraday',
    defaultTimeframe: '5m',
    executable: true,
    nejoic: true,
    entryRule: 'Fade gap toward prior day close',
    exitRule: 'Gap filled or stop',
    stopLoss: 'Beyond gap extreme',
    target: 'Prior close',
    market: 'NSE',
  },
  {
    id: 'support_bounce',
    name: 'Support / Resistance Bounce',
    short: 'Bounce off recent swing levels.',
    group: 'structure',
    defaultTimeframe: '1H',
    executable: true,
    nejoic: true,
    entryRule: 'Buy bounce from recent swing low support',
    exitRule: 'Break of support or target',
    stopLoss: 'Below support',
    target: 'Next resistance',
    market: 'NSE',
  },
  {
    id: 'range_mean_reversion',
    name: 'Range Mean Reversion',
    short: 'Fade extremes inside a defined range.',
    group: 'structure',
    defaultTimeframe: '15m',
    executable: true,
    nejoic: true,
    entryRule: 'Buy near range low; sell near range high',
    exitRule: 'Mid-range or opposite extreme',
    stopLoss: 'Outside range',
    target: 'Range midpoint',
    market: 'NSE',
  },
];

export type TimeframeMeta = {
  id: string;
  label: string;
  /** Yahoo interval to request */
  yahoo: string;
  note?: string;
};

/** Full timeframe list for all pickers */
export const ALL_TIMEFRAMES: TimeframeMeta[] = [
  { id: '1m', label: '1 min', yahoo: '1m' },
  { id: '2m', label: '2 min', yahoo: '2m' },
  { id: '3m', label: '3 min', yahoo: '2m', note: 'Yahoo approx via 2m' },
  { id: '5m', label: '5 min', yahoo: '5m' },
  { id: '10m', label: '10 min', yahoo: '15m', note: 'Yahoo approx via 15m' },
  { id: '15m', label: '15 min', yahoo: '15m' },
  { id: '30m', label: '30 min', yahoo: '30m' },
  { id: '45m', label: '45 min', yahoo: '30m', note: 'Yahoo approx via 30m' },
  { id: '1H', label: '1 hour', yahoo: '60m' },
  { id: '2H', label: '2 hour', yahoo: '60m', note: 'Yahoo approx via 60m' },
  { id: '3H', label: '3 hour', yahoo: '60m', note: 'Yahoo approx via 60m' },
  { id: '4H', label: '4 hour', yahoo: '60m', note: 'Yahoo approx via 60m' },
  { id: '1D', label: 'Daily', yahoo: '1d' },
  { id: '1W', label: 'Weekly', yahoo: '1wk' },
  { id: '1M', label: 'Monthly', yahoo: '1mo' },
];

export function catalogStrategyById(id: string): CatalogStrategy | undefined {
  return POPULAR_STRATEGIES.find((s) => s.id === id);
}

export function catalogStrategyLabel(id: string): string {
  return catalogStrategyById(id)?.name ?? id;
}

export function journalStrategyNames(): string[] {
  return [...POPULAR_STRATEGIES.map((s) => s.name), 'Options Premium', 'Other'];
}

export function timeframeIds(): string[] {
  return ALL_TIMEFRAMES.map((t) => t.id);
}

export function timeframeToYahooInterval(id: string): string {
  return ALL_TIMEFRAMES.find((t) => t.id === id)?.yahoo ?? '15m';
}

export function timeframeNote(id: string): string | undefined {
  return ALL_TIMEFRAMES.find((t) => t.id === id)?.note;
}

export function nejoicCatalogStrategies(): CatalogStrategy[] {
  return POPULAR_STRATEGIES.filter((s) => s.nejoic);
}

export function strategiesGroupedForPicker(opts?: {
  executableOnly?: boolean;
  nejoicOnly?: boolean;
}) {
  let list = POPULAR_STRATEGIES;
  if (opts?.nejoicOnly) list = list.filter((s) => s.nejoic);
  if (opts?.executableOnly) list = list.filter((s) => s.executable);
  return STRATEGY_GROUPS.map((g) => ({
    ...g,
    items: list.filter((s) => s.group === g.id),
  })).filter((g) => g.items.length > 0);
}

export function strategyIdsByGroup(
  group: StrategyGroupId,
  opts?: { nejoicOnly?: boolean }
): CatalogStrategyId[] {
  let list = POPULAR_STRATEGIES.filter((s) => s.group === group);
  if (opts?.nejoicOnly !== false) list = list.filter((s) => s.nejoic);
  return list.map((s) => s.id);
}

export function strategyTemplatesFromCatalog() {
  return POPULAR_STRATEGIES.map((s) => ({
    name: s.name,
    market: s.market,
    timeframe: s.defaultTimeframe,
    entryRule: s.entryRule,
    exitRule: s.exitRule,
    stopLoss: s.stopLoss,
    target: s.target,
    stopLossPoints: s.stopLossPoints ?? defaultPointsFor(s).sl,
    targetPoints: s.targetPoints ?? defaultPointsFor(s).tg,
    catalogId: s.id,
  }));
}

function defaultPointsFor(s: CatalogStrategy): { sl: number; tg: number } {
  if (s.defaultTimeframe === '1D' || s.defaultTimeframe === '1W' || s.defaultTimeframe === '1M') {
    return { sl: 100, tg: 200 };
  }
  if (s.group === 'intraday') return { sl: 40, tg: 60 };
  if (s.market === 'BANKNIFTY') return { sl: 80, tg: 120 };
  return { sl: 50, tg: 75 };
}

export function catalogDefaultPoints(id: string): { sl: number; tg: number } {
  const s = catalogStrategyById(id);
  if (!s) return { sl: 50, tg: 75 };
  return {
    sl: s.stopLossPoints ?? defaultPointsFor(s).sl,
    tg: s.targetPoints ?? defaultPointsFor(s).tg,
  };
}
