import type { Exchange } from '@/lib/watchlist';

export type ScanCategory =
  | 'technical'
  | 'indicators'
  | 'fundamental'
  | 'volume'
  | 'intraday'
  | 'swing'
  | 'positional';

export type ScanTemplate = {
  id: string;
  name: string;
  category: ScanCategory;
  description: string;
  /** Indicator tags shown on the card */
  indicators?: string[];
};

export type ScanResult = {
  symbol: string;
  exchange: Exchange;
  name: string;
  price: number;
  changePct: number;
  signal: string;
  strength: 'Strong' | 'Moderate' | 'Weak';
};

/** TradingView-style scan library (quote-based live scan + editable params) */
export const SCAN_TEMPLATES: ScanTemplate[] = [
  {
    id: 'momentum-breakout',
    name: 'Momentum Breakout',
    category: 'technical',
    description: 'Strong price move with volume confirmation',
    indicators: ['Price', 'Volume'],
  },
  {
    id: 'rsi-reversal',
    name: 'RSI Reversal',
    category: 'indicators',
    description: 'Oversold / overbought reversal setups',
    indicators: ['RSI'],
  },
  {
    id: 'ema-crossover',
    name: 'EMA Crossover',
    category: 'indicators',
    description: 'Fast / slow EMA trend cross proxy',
    indicators: ['EMA'],
  },
  {
    id: 'sma-crossover',
    name: 'SMA / Golden Cross',
    category: 'indicators',
    description: 'Price vs SMA trend (50/200 style)',
    indicators: ['SMA'],
  },
  {
    id: 'macd-cross',
    name: 'MACD Crossover',
    category: 'indicators',
    description: 'MACD momentum flip proxy',
    indicators: ['MACD'],
  },
  {
    id: 'stochastic',
    name: 'Stochastic Cross',
    category: 'indicators',
    description: 'Stoch %K / %D turn setups',
    indicators: ['Stochastic'],
  },
  {
    id: 'bollinger-break',
    name: 'Bollinger Breakout',
    category: 'indicators',
    description: 'Band expansion / breakout days',
    indicators: ['Bollinger'],
  },
  {
    id: 'bollinger-squeeze',
    name: 'Bollinger Squeeze',
    category: 'indicators',
    description: 'Tight range before expansion',
    indicators: ['Bollinger', 'ATR'],
  },
  {
    id: 'supertrend',
    name: 'Supertrend Flip',
    category: 'indicators',
    description: 'Trend flip with ATR multiple',
    indicators: ['Supertrend', 'ATR'],
  },
  {
    id: 'vwap-reclaim',
    name: 'VWAP Reclaim',
    category: 'indicators',
    description: 'Reclaim / reject around VWAP zone',
    indicators: ['VWAP'],
  },
  {
    id: 'atr-expansion',
    name: 'ATR Volatility Expansion',
    category: 'indicators',
    description: 'Range expansion vs quiet days',
    indicators: ['ATR'],
  },
  {
    id: 'adx-trend',
    name: 'ADX Trend Strength',
    category: 'indicators',
    description: 'Strong directional trend days',
    indicators: ['ADX'],
  },
  {
    id: 'cci-zero',
    name: 'CCI Zero Cross',
    category: 'indicators',
    description: 'CCI crossing zero — momentum flip (edit CCI period)',
    indicators: ['CCI'],
  },
  {
    id: 'cci-oversold',
    name: 'CCI Oversold Bounce',
    category: 'indicators',
    description: 'CCI deep oversold bounce (classic −100 / −200 zone)',
    indicators: ['CCI'],
  },
  {
    id: 'cci-overbought',
    name: 'CCI Overbought Fade',
    category: 'indicators',
    description: 'CCI extreme overbought — caution / fade zone',
    indicators: ['CCI'],
  },
  {
    id: 'cci-trend',
    name: 'CCI Trend Ride',
    category: 'indicators',
    description: 'CCI staying strong with price — trend continuation',
    indicators: ['CCI', 'Price'],
  },
  {
    id: 'williams-r',
    name: 'Williams %R',
    category: 'indicators',
    description: 'Williams %R oversold / overbought turns',
    indicators: ['Williams %R'],
  },
  {
    id: 'mfi-flow',
    name: 'MFI Money Flow',
    category: 'indicators',
    description: 'Money Flow Index style pressure',
    indicators: ['MFI', 'Volume'],
  },
  {
    id: 'roc-momentum',
    name: 'ROC Momentum',
    category: 'indicators',
    description: 'Rate of Change momentum thrust',
    indicators: ['ROC'],
  },
  {
    id: 'awesome-osc',
    name: 'Awesome Oscillator',
    category: 'indicators',
    description: 'AO-style momentum shift proxy',
    indicators: ['AO'],
  },
  {
    id: 'pivot-bounce',
    name: 'Pivot Bounce',
    category: 'indicators',
    description: 'Bounce near classic floor pivots',
    indicators: ['Pivots'],
  },
  {
    id: 'parabolic-sar',
    name: 'Parabolic SAR Flip',
    category: 'indicators',
    description: 'Trend stop flip proxy',
    indicators: ['PSAR'],
  },
  {
    id: 'ichimoku-break',
    name: 'Ichimoku Cloud Break',
    category: 'indicators',
    description: 'Cloud / TK breakout proxy',
    indicators: ['Ichimoku'],
  },
  {
    id: 'gap-up-down',
    name: 'Gap Up / Gap Down',
    category: 'intraday',
    description: 'Opening gap movers',
    indicators: ['Gap'],
  },
  {
    id: 'orb',
    name: 'Opening Range Breakout',
    category: 'intraday',
    description: 'Break of early session range',
    indicators: ['ORB', 'Volume'],
  },
  {
    id: 'day-trade',
    name: 'Day Trade Momentum',
    category: 'intraday',
    description: 'Intraday momentum + volume',
    indicators: ['Price', 'Volume'],
  },
  {
    id: 'nr7',
    name: 'NR7 / Narrow Range',
    category: 'intraday',
    description: 'Tight day range compression',
    indicators: ['Range'],
  },
  {
    id: '52w-near',
    name: '52-Week High / Low',
    category: 'technical',
    description: 'Near yearly extreme proxy',
    indicators: ['Price'],
  },
  {
    id: 'top-gainers',
    name: 'Top Gainers',
    category: 'technical',
    description: 'Biggest % up movers today',
    indicators: ['Price'],
  },
  {
    id: 'top-losers',
    name: 'Top Losers',
    category: 'technical',
    description: 'Biggest % down movers today',
    indicators: ['Price'],
  },
  {
    id: 'high-volume',
    name: 'High Volume / Most Active',
    category: 'volume',
    description: 'Unusual traded quantity',
    indicators: ['Volume'],
  },
  {
    id: 'rvol-spike',
    name: 'Relative Volume Spike',
    category: 'volume',
    description: 'Volume spike vs typical day',
    indicators: ['RVOL'],
  },

  // —— Swing trading (hold days to ~2–3 weeks) ——
  {
    id: 'swing-setups',
    name: 'Swing: Base Setup',
    category: 'swing',
    description: 'Idea: multi-day swing in liquid names — tune MA periods',
    indicators: ['EMA', 'Price'],
  },
  {
    id: 'pullback-trend',
    name: 'Swing: Trend Pullback',
    category: 'swing',
    description: 'Idea: buy mild dip in uptrend (EMA support style)',
    indicators: ['EMA', 'Price'],
  },
  {
    id: 'swing-ema-ribbon',
    name: 'Swing: EMA Ribbon',
    category: 'swing',
    description: 'Idea: price holding above rising fast/slow EMA stack',
    indicators: ['EMA'],
  },
  {
    id: 'swing-breakout-retest',
    name: 'Swing: Breakout Retest',
    category: 'swing',
    description: 'Idea: breakout day then constructive hold / retest',
    indicators: ['Price', 'Volume'],
  },
  {
    id: 'swing-rsi-trend',
    name: 'Swing: RSI Trend Hold',
    category: 'swing',
    description: 'Idea: RSI stays constructive in a swing uptrend',
    indicators: ['RSI', 'EMA'],
  },
  {
    id: 'swing-cci-reversal',
    name: 'Swing: CCI Reversal',
    category: 'swing',
    description: 'Idea: CCI oversold bounce for 3–10 day swing',
    indicators: ['CCI'],
  },
  {
    id: 'swing-flag',
    name: 'Swing: Flag / Consolidation',
    category: 'swing',
    description: 'Idea: tight range after a thrust — continuation swing',
    indicators: ['Range', 'ATR'],
  },
  {
    id: 'swing-macd-turn',
    name: 'Swing: MACD Turn',
    category: 'swing',
    description: 'Idea: MACD momentum turn for swing entry',
    indicators: ['MACD'],
  },
  {
    id: 'swing-relative-strength',
    name: 'Swing: Relative Strength',
    category: 'swing',
    description: 'Idea: strongest % leaders for swing candidates',
    indicators: ['Price', 'Volume'],
  },

  // —— Positional trading (hold weeks to months) ——
  {
    id: 'pos-golden-cross',
    name: 'Positional: Golden Cross',
    category: 'positional',
    description: 'Idea: long-term MA stack (50/200 style) — invest / hold',
    indicators: ['SMA', 'EMA'],
  },
  {
    id: 'pos-200sma-trend',
    name: 'Positional: Above 200 SMA',
    category: 'positional',
    description: 'Idea: primary bull trend — positional long bias',
    indicators: ['SMA'],
  },
  {
    id: 'pos-stage2',
    name: 'Positional: Stage-2 Advance',
    category: 'positional',
    description: 'Idea: steady advance + volume — growth positional',
    indicators: ['Price', 'Volume', 'EMA'],
  },
  {
    id: 'pos-accumulation',
    name: 'Positional: Accumulation',
    category: 'positional',
    description: 'Idea: quiet higher closes / constructive base building',
    indicators: ['Volume', 'Range'],
  },
  {
    id: 'pos-breakout-weekly',
    name: 'Positional: Major Breakout',
    category: 'positional',
    description: 'Idea: strong breakout with volume — multi-week hold',
    indicators: ['Price', 'Volume'],
  },
  {
    id: 'pos-mean-reversion',
    name: 'Positional: Value Dip Buy',
    category: 'positional',
    description: 'Idea: orderly pullback in quality names for longer hold',
    indicators: ['RSI', 'Price'],
  },
  {
    id: 'pos-cci-cycle',
    name: 'Positional: CCI Cycle Low',
    category: 'positional',
    description: 'Idea: deep CCI washout — positional re-entry zone',
    indicators: ['CCI'],
  },
  {
    id: 'pos-low-volatility',
    name: 'Positional: Low Vol Grind',
    category: 'positional',
    description: 'Idea: calm grind higher — compound positional',
    indicators: ['ATR', 'Price'],
  },

  {
    id: 'engulfing-proxy',
    name: 'Engulfing / Strong Close',
    category: 'technical',
    description: 'Strong directional close vs open',
    indicators: ['Candle'],
  },
  {
    id: 'undervalued',
    name: 'Value Dip (Fundamental proxy)',
    category: 'fundamental',
    description: 'Orderly decline / stabilising names',
    indicators: ['Price'],
  },
];

const DEMO_UNIVERSE: Omit<ScanResult, 'signal' | 'strength'>[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', name: 'Reliance Industries', price: 2984.5, changePct: 0.42 },
  { symbol: 'TCS', exchange: 'NSE', name: 'Tata Consultancy', price: 3912.0, changePct: -0.18 },
  { symbol: 'INFY', exchange: 'NSE', name: 'Infosys', price: 1648.25, changePct: 0.65 },
  { symbol: 'HDFCBANK', exchange: 'NSE', name: 'HDFC Bank', price: 1702.1, changePct: 0.21 },
  { symbol: 'ICICIBANK', exchange: 'NSE', name: 'ICICI Bank', price: 1288.4, changePct: -0.35 },
  { symbol: 'SBIN', exchange: 'NSE', name: 'State Bank of India', price: 812.55, changePct: 0.88 },
  { symbol: 'BHARTIARTL', exchange: 'NSE', name: 'Bharti Airtel', price: 1865.0, changePct: 0.12 },
  { symbol: 'ITC', exchange: 'NSE', name: 'ITC Limited', price: 468.75, changePct: -0.22 },
  { symbol: 'LT', exchange: 'NSE', name: 'Larsen & Toubro', price: 3620.4, changePct: 0.55 },
  { symbol: 'AXISBANK', exchange: 'NSE', name: 'Axis Bank', price: 1124.8, changePct: -0.41 },
  { symbol: 'BAJFINANCE', exchange: 'NSE', name: 'Bajaj Finance', price: 7450.0, changePct: 1.12 },
  { symbol: 'MARUTI', exchange: 'NSE', name: 'Maruti Suzuki', price: 12480.0, changePct: 0.33 },
  { symbol: 'SUNPHARMA', exchange: 'NSE', name: 'Sun Pharma', price: 1788.6, changePct: -0.08 },
  { symbol: 'TATAMOTORS', exchange: 'NSE', name: 'Tata Motors', price: 712.3, changePct: 1.45 },
  { symbol: 'WIPRO', exchange: 'NSE', name: 'Wipro', price: 298.15, changePct: 0.72 },
];

const STRENGTHS: ScanResult['strength'][] = ['Strong', 'Moderate', 'Weak'];

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function runScan(templateId: string): ScanResult[] {
  const template = SCAN_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return [];

  const seed = hashSeed(templateId);
  const count = 5 + (seed % 6);
  const shuffled = [...DEMO_UNIVERSE].sort((a, b) => {
    const ha = hashSeed(templateId + a.symbol);
    const hb = hashSeed(templateId + b.symbol);
    return ha - hb;
  });

  return shuffled.slice(0, count).map((row, i) => ({
    ...row,
    signal: template.name,
    strength: STRENGTHS[(seed + i) % STRENGTHS.length],
  }));
}

export type SavedScan = {
  id: string;
  templateId: string;
  templateName: string;
  ranAt: string;
  resultCount: number;
};

const HISTORY_KEY = 'trademindpro_scan_history_v1';

export function readScanHistory(): SavedScan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushScanHistory(entry: Omit<SavedScan, 'id'>): SavedScan[] {
  const item: SavedScan = { ...entry, id: crypto.randomUUID() };
  const next = [item, ...readScanHistory()].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
