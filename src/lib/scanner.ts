import type { Exchange } from '@/lib/watchlist';

export type ScanCategory = 'technical' | 'fundamental' | 'volume' | 'intraday' | 'swing';

export type ScanTemplate = {
  id: string;
  name: string;
  category: ScanCategory;
  description: string;
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

export const SCAN_TEMPLATES: ScanTemplate[] = [
  {
    id: 'momentum-breakout',
    name: 'Momentum Breakout',
    category: 'technical',
    description: 'Price + volume breakout combo',
  },
  {
    id: 'rsi-reversal',
    name: 'RSI Reversal',
    category: 'technical',
    description: 'Oversold / overbought reversal setups',
  },
  {
    id: 'ema-crossover',
    name: 'EMA Crossover',
    category: 'technical',
    description: '9/21 or 20/50 EMA cross',
  },
  {
    id: 'gap-up-down',
    name: 'Gap Up / Gap Down',
    category: 'intraday',
    description: 'Opening gap movers',
  },
  {
    id: '52w-near',
    name: '52-Week High / Low',
    category: 'technical',
    description: 'Near 52-week extremes',
  },
  {
    id: 'high-volume',
    name: 'High Volume',
    category: 'volume',
    description: 'Unusual volume activity',
  },
  {
    id: 'swing-setups',
    name: 'Swing Trade Setups',
    category: 'swing',
    description: 'Multi-day swing candidates',
  },
  {
    id: 'day-trade',
    name: 'Day Trade Setups',
    category: 'intraday',
    description: 'Intraday momentum names',
  },
  {
    id: 'undervalued',
    name: 'Undervalued (Fundamental)',
    category: 'fundamental',
    description: 'Value screen on PE / growth filters',
  },
];

/** Demo universe — replaced by live NSE/BSE feed later */
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
  const count = 5 + (seed % 6); // 5–10 results
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
