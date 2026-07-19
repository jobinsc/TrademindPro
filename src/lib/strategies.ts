export type StrategyStatus = 'draft' | 'ready' | 'paused' | 'live';

export type Strategy = {
  id: string;
  name: string;
  market: 'NSE' | 'BSE' | 'NIFTY' | 'BANKNIFTY';
  timeframe: string;
  entryRule: string;
  exitRule: string;
  stopLoss: string;
  target: string;
  status: StrategyStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategyInput = Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>;

export const TIMEFRAMES = ['1m', '5m', '15m', '1H', '1D'];

export const STRATEGY_TEMPLATES: Omit<StrategyInput, 'status' | 'notes'>[] = [
  {
    name: 'EMA 9/21 Cross',
    market: 'NIFTY',
    timeframe: '15m',
    entryRule: 'Buy when EMA 9 crosses above EMA 21 and RSI > 50',
    exitRule: 'Exit when EMA 9 crosses below EMA 21',
    stopLoss: '0.5% below entry',
    target: '1:2 RR or trailing SL',
  },
  {
    name: 'RSI Oversold Bounce',
    market: 'NSE',
    timeframe: '1H',
    entryRule: 'Buy when RSI crosses up from below 30 near support',
    exitRule: 'Exit at RSI 60 or resistance',
    stopLoss: 'Below recent swing low',
    target: 'Previous swing high',
  },
  {
    name: 'Opening Range Breakout',
    market: 'BANKNIFTY',
    timeframe: '5m',
    entryRule: 'Break of first 15-min high with volume',
    exitRule: 'Square off by 3:15 PM or opposite break',
    stopLoss: 'Below opening range low',
    target: '1:1.5 RR',
  },
];

export function emptyStrategyInput(): StrategyInput {
  return {
    name: '',
    market: 'NSE',
    timeframe: '15m',
    entryRule: '',
    exitRule: '',
    stopLoss: '',
    target: '',
    status: 'draft',
    notes: '',
  };
}

export function summarizeStrategies(strategies: Strategy[]) {
  return {
    total: strategies.length,
    draft: strategies.filter((s) => s.status === 'draft').length,
    ready: strategies.filter((s) => s.status === 'ready').length,
    paused: strategies.filter((s) => s.status === 'paused').length,
    live: strategies.filter((s) => s.status === 'live').length,
  };
}
