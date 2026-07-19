/** Editable parameters for each scanner strategy (TradingView-style) */

export type ScanSettings = {
  resultLimit: number;
  minChangePct: number;
  maxChangePct: number;
  minVolume: number;
  minGapPct: number;
  oversoldChangePct: number;
  overboughtChangePct: number;
  strongAbsChangePct: number;
  moderateAbsChangePct: number;
  /** Indicator periods / params */
  emaFast: number;
  emaSlow: number;
  smaPeriod: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  stochK: number;
  stochD: number;
  bbPeriod: number;
  bbStdDev: number;
  atrPeriod: number;
  atrMult: number;
  adxPeriod: number;
  adxMin: number;
  cciPeriod: number;
  /** Classic CCI levels (e.g. −100 / +100) — used as idea thresholds */
  cciOversold: number;
  cciOverbought: number;
  minRangePct: number;
  maxRangePct: number;
  relativeVolumeMin: number;
};

const BASE: ScanSettings = {
  resultLimit: 40,
  minChangePct: -20,
  maxChangePct: 20,
  minVolume: 20000,
  minGapPct: 0,
  oversoldChangePct: -2,
  overboughtChangePct: 2,
  strongAbsChangePct: 2.5,
  moderateAbsChangePct: 1,
  emaFast: 9,
  emaSlow: 21,
  smaPeriod: 50,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stochK: 14,
  stochD: 3,
  bbPeriod: 20,
  bbStdDev: 2,
  atrPeriod: 14,
  atrMult: 3,
  adxPeriod: 14,
  adxMin: 25,
  cciPeriod: 20,
  cciOversold: -100,
  cciOverbought: 100,
  minRangePct: 0,
  maxRangePct: 1.2,
  relativeVolumeMin: 1.5,
};

function withOverrides(partial: Partial<ScanSettings>): ScanSettings {
  return { ...BASE, ...partial };
}

export const DEFAULT_SCAN_SETTINGS: Record<string, ScanSettings> = {
  'momentum-breakout': withOverrides({
    minChangePct: 1.5,
    maxChangePct: 15,
    minVolume: 50000,
    strongAbsChangePct: 3,
    moderateAbsChangePct: 1.5,
  }),
  'rsi-reversal': withOverrides({
    minVolume: 20000,
    oversoldChangePct: -2,
    overboughtChangePct: 2,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
  }),
  'ema-crossover': withOverrides({
    minChangePct: 0.3,
    maxChangePct: 10,
    minVolume: 30000,
    emaFast: 9,
    emaSlow: 21,
  }),
  'sma-crossover': withOverrides({
    minChangePct: 0.4,
    maxChangePct: 8,
    minVolume: 30000,
    smaPeriod: 50,
    emaFast: 50,
    emaSlow: 200,
  }),
  'macd-cross': withOverrides({
    minChangePct: 0.5,
    maxChangePct: 10,
    minVolume: 30000,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
  }),
  stochastic: withOverrides({
    oversoldChangePct: -1.5,
    overboughtChangePct: 1.5,
    stochK: 14,
    stochD: 3,
  }),
  'bollinger-break': withOverrides({
    minChangePct: 1.2,
    maxChangePct: 12,
    minVolume: 40000,
    bbPeriod: 20,
    bbStdDev: 2,
  }),
  'bollinger-squeeze': withOverrides({
    minChangePct: -1,
    maxChangePct: 1.5,
    maxRangePct: 1.0,
    minVolume: 25000,
    bbPeriod: 20,
    bbStdDev: 2,
  }),
  supertrend: withOverrides({
    minChangePct: 0.8,
    maxChangePct: 12,
    atrPeriod: 10,
    atrMult: 3,
    minVolume: 30000,
  }),
  'vwap-reclaim': withOverrides({
    minChangePct: 0.2,
    maxChangePct: 6,
    minVolume: 50000,
  }),
  'atr-expansion': withOverrides({
    minChangePct: 1.5,
    maxChangePct: 15,
    minRangePct: 2,
    atrPeriod: 14,
    atrMult: 2,
  }),
  'adx-trend': withOverrides({
    minChangePct: 1,
    maxChangePct: 12,
    adxPeriod: 14,
    adxMin: 25,
    minVolume: 40000,
  }),
  'cci-zero': withOverrides({
    minChangePct: 0.4,
    maxChangePct: 8,
    cciPeriod: 20,
  }),
  'cci-oversold': withOverrides({
    minChangePct: -8,
    maxChangePct: 2,
    minVolume: 25000,
    cciPeriod: 20,
    cciOversold: -100,
    oversoldChangePct: -2,
  }),
  'cci-overbought': withOverrides({
    minChangePct: -1,
    maxChangePct: 10,
    minVolume: 25000,
    cciPeriod: 20,
    cciOverbought: 100,
    overboughtChangePct: 2,
  }),
  'cci-trend': withOverrides({
    minChangePct: 0.6,
    maxChangePct: 8,
    cciPeriod: 20,
    cciOverbought: 50,
    minVolume: 40000,
  }),
  'williams-r': withOverrides({
    oversoldChangePct: -2,
    overboughtChangePct: 2,
    rsiPeriod: 14,
  }),
  'mfi-flow': withOverrides({
    minChangePct: -3,
    maxChangePct: 5,
    minVolume: 50000,
    rsiPeriod: 14,
  }),
  'roc-momentum': withOverrides({
    minChangePct: 1,
    maxChangePct: 12,
    minVolume: 40000,
  }),
  'awesome-osc': withOverrides({
    minChangePct: 0.5,
    maxChangePct: 8,
    emaFast: 5,
    emaSlow: 34,
  }),
  'pivot-bounce': withOverrides({
    minChangePct: -1.5,
    maxChangePct: 2,
    minVolume: 30000,
  }),
  'parabolic-sar': withOverrides({
    minChangePct: 0.6,
    maxChangePct: 10,
    minVolume: 25000,
  }),
  'ichimoku-break': withOverrides({
    minChangePct: 0.8,
    maxChangePct: 10,
    emaFast: 9,
    emaSlow: 26,
    smaPeriod: 52,
  }),
  'gap-up-down': withOverrides({
    minGapPct: 1.5,
    minVolume: 10000,
    strongAbsChangePct: 3,
  }),
  orb: withOverrides({
    minChangePct: 0.8,
    minGapPct: 0.3,
    minVolume: 60000,
  }),
  'day-trade': withOverrides({
    minChangePct: 1,
    maxChangePct: 12,
    minVolume: 80000,
    minGapPct: 0.5,
  }),
  nr7: withOverrides({
    minChangePct: -2,
    maxChangePct: 2,
    maxRangePct: 1.0,
    minVolume: 20000,
  }),
  '52w-near': withOverrides({
    minChangePct: -3,
    maxChangePct: 8,
    minVolume: 20000,
  }),
  'top-gainers': withOverrides({
    minChangePct: 2,
    maxChangePct: 25,
    minVolume: 30000,
    resultLimit: 50,
  }),
  'top-losers': withOverrides({
    minChangePct: -25,
    maxChangePct: -2,
    minVolume: 30000,
    resultLimit: 50,
  }),
  'high-volume': withOverrides({
    minVolume: 200000,
    minChangePct: -20,
    maxChangePct: 20,
  }),
  'rvol-spike': withOverrides({
    minVolume: 100000,
    relativeVolumeMin: 2,
    minChangePct: -15,
    maxChangePct: 15,
  }),
  'swing-setups': withOverrides({
    minChangePct: 0.5,
    maxChangePct: 6,
    minVolume: 40000,
    emaFast: 20,
    emaSlow: 50,
    resultLimit: 40,
  }),
  'pullback-trend': withOverrides({
    minChangePct: -2.5,
    maxChangePct: 0.3,
    minVolume: 35000,
    emaFast: 20,
    emaSlow: 50,
  }),
  'swing-ema-ribbon': withOverrides({
    minChangePct: 0.3,
    maxChangePct: 5,
    emaFast: 8,
    emaSlow: 21,
    minVolume: 40000,
  }),
  'swing-breakout-retest': withOverrides({
    minChangePct: 1,
    maxChangePct: 8,
    minVolume: 60000,
    minGapPct: 0.2,
  }),
  'swing-rsi-trend': withOverrides({
    minChangePct: 0.2,
    maxChangePct: 5,
    rsiPeriod: 14,
    rsiOversold: 40,
    rsiOverbought: 70,
    emaFast: 20,
    emaSlow: 50,
  }),
  'swing-cci-reversal': withOverrides({
    minChangePct: -5,
    maxChangePct: 3,
    cciPeriod: 20,
    cciOversold: -100,
    oversoldChangePct: -1.5,
    minVolume: 35000,
  }),
  'swing-flag': withOverrides({
    minChangePct: -1,
    maxChangePct: 2.5,
    maxRangePct: 2,
    minVolume: 40000,
  }),
  'swing-macd-turn': withOverrides({
    minChangePct: 0.4,
    maxChangePct: 6,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
  }),
  'swing-relative-strength': withOverrides({
    minChangePct: 1.5,
    maxChangePct: 12,
    minVolume: 50000,
    resultLimit: 35,
  }),
  'pos-golden-cross': withOverrides({
    minChangePct: 0.2,
    maxChangePct: 5,
    emaFast: 50,
    emaSlow: 200,
    smaPeriod: 200,
    minVolume: 30000,
  }),
  'pos-200sma-trend': withOverrides({
    minChangePct: 0,
    maxChangePct: 4,
    smaPeriod: 200,
    emaSlow: 200,
    minVolume: 25000,
  }),
  'pos-stage2': withOverrides({
    minChangePct: 0.4,
    maxChangePct: 6,
    emaFast: 50,
    emaSlow: 150,
    minVolume: 50000,
  }),
  'pos-accumulation': withOverrides({
    minChangePct: -0.5,
    maxChangePct: 2,
    maxRangePct: 2.5,
    minVolume: 40000,
  }),
  'pos-breakout-weekly': withOverrides({
    minChangePct: 2,
    maxChangePct: 12,
    minVolume: 100000,
    strongAbsChangePct: 3,
  }),
  'pos-mean-reversion': withOverrides({
    minChangePct: -8,
    maxChangePct: -1,
    rsiPeriod: 14,
    rsiOversold: 35,
    minVolume: 30000,
  }),
  'pos-cci-cycle': withOverrides({
    minChangePct: -6,
    maxChangePct: 1,
    cciPeriod: 20,
    cciOversold: -150,
    oversoldChangePct: -2.5,
  }),
  'pos-low-volatility': withOverrides({
    minChangePct: 0.1,
    maxChangePct: 2.5,
    maxRangePct: 2,
    atrPeriod: 14,
    minVolume: 25000,
  }),
  'engulfing-proxy': withOverrides({
    minChangePct: 1.2,
    maxChangePct: 10,
    minRangePct: 1.5,
    minVolume: 30000,
  }),
  undervalued: withOverrides({
    minChangePct: -4,
    maxChangePct: 0.5,
    minVolume: 20000,
  }),
};

export function defaultSettingsFor(templateId: string): ScanSettings {
  return { ...(DEFAULT_SCAN_SETTINGS[templateId] || BASE) };
}

export type ScanSettingsField = {
  key: keyof ScanSettings;
  label: string;
  hint: string;
  step: number;
};

const ALL_FIELDS: ScanSettingsField[] = [
  { key: 'resultLimit', label: 'Result limit', hint: 'Max symbols to show', step: 5 },
  { key: 'minChangePct', label: 'Min change %', hint: 'Day change at least this', step: 0.1 },
  { key: 'maxChangePct', label: 'Max change %', hint: 'Ignore bigger moves', step: 0.1 },
  { key: 'minVolume', label: 'Min volume', hint: 'Minimum traded quantity', step: 1000 },
  { key: 'minGapPct', label: 'Min gap %', hint: 'Open vs prev close', step: 0.1 },
  { key: 'minRangePct', label: 'Min range %', hint: '(H-L)/close minimum', step: 0.1 },
  { key: 'maxRangePct', label: 'Max range %', hint: 'For squeeze / NR7', step: 0.1 },
  { key: 'oversoldChangePct', label: 'Oversold change %', hint: 'Down-day threshold', step: 0.1 },
  { key: 'overboughtChangePct', label: 'Overbought change %', hint: 'Up-day threshold', step: 0.1 },
  { key: 'strongAbsChangePct', label: 'Strong |change| %', hint: 'Strong badge if ≥', step: 0.1 },
  { key: 'moderateAbsChangePct', label: 'Moderate |change| %', hint: 'Moderate badge if ≥', step: 0.1 },
  { key: 'emaFast', label: 'Fast MA period', hint: 'e.g. 9, 12, 20 — change to any number', step: 1 },
  { key: 'emaSlow', label: 'Slow MA period', hint: 'e.g. 21, 50, 200 — change to any number', step: 1 },
  { key: 'smaPeriod', label: 'SMA period', hint: 'e.g. 50 or 200', step: 1 },
  { key: 'rsiPeriod', label: 'RSI period', hint: 'e.g. 14 — change to any number', step: 1 },
  { key: 'rsiOversold', label: 'RSI oversold level', hint: 'e.g. 30', step: 1 },
  { key: 'rsiOverbought', label: 'RSI overbought level', hint: 'e.g. 70', step: 1 },
  { key: 'macdFast', label: 'MACD fast', hint: 'e.g. 12', step: 1 },
  { key: 'macdSlow', label: 'MACD slow', hint: 'e.g. 26', step: 1 },
  { key: 'macdSignal', label: 'MACD signal', hint: 'e.g. 9', step: 1 },
  { key: 'stochK', label: 'Stochastic %K', hint: 'e.g. 14', step: 1 },
  { key: 'stochD', label: 'Stochastic %D', hint: 'e.g. 3', step: 1 },
  { key: 'bbPeriod', label: 'Bollinger period', hint: 'e.g. 20', step: 1 },
  { key: 'bbStdDev', label: 'Bollinger std dev', hint: 'e.g. 2', step: 0.1 },
  { key: 'atrPeriod', label: 'ATR period', hint: 'e.g. 14', step: 1 },
  { key: 'atrMult', label: 'ATR / Supertrend mult', hint: 'e.g. 3', step: 0.1 },
  { key: 'adxPeriod', label: 'ADX period', hint: 'e.g. 14', step: 1 },
  { key: 'adxMin', label: 'ADX minimum', hint: 'e.g. 25', step: 1 },
  { key: 'cciPeriod', label: 'CCI period', hint: 'e.g. 20 — change to any number', step: 1 },
  { key: 'cciOversold', label: 'CCI oversold level', hint: 'e.g. −100 or −200', step: 1 },
  { key: 'cciOverbought', label: 'CCI overbought level', hint: 'e.g. +100 or +200', step: 1 },
  { key: 'relativeVolumeMin', label: 'Min RVOL', hint: 'Relative volume multiple', step: 0.1 },
];

/** Indicator periods first (what you change for MA / RSI / MACD…) */
const INDICATOR_KEYS: Record<string, (keyof ScanSettings)[]> = {
  'rsi-reversal': ['rsiPeriod', 'rsiOversold', 'rsiOverbought'],
  'ema-crossover': ['emaFast', 'emaSlow'],
  'sma-crossover': ['emaFast', 'emaSlow', 'smaPeriod'],
  'macd-cross': ['macdFast', 'macdSlow', 'macdSignal'],
  stochastic: ['stochK', 'stochD', 'rsiOversold', 'rsiOverbought'],
  'bollinger-break': ['bbPeriod', 'bbStdDev'],
  'bollinger-squeeze': ['bbPeriod', 'bbStdDev'],
  supertrend: ['atrPeriod', 'atrMult'],
  'vwap-reclaim': [],
  'atr-expansion': ['atrPeriod', 'atrMult'],
  'adx-trend': ['adxPeriod', 'adxMin'],
  'cci-zero': ['cciPeriod'],
  'cci-oversold': ['cciPeriod', 'cciOversold'],
  'cci-overbought': ['cciPeriod', 'cciOverbought'],
  'cci-trend': ['cciPeriod', 'cciOverbought'],
  'williams-r': ['rsiPeriod', 'rsiOversold', 'rsiOverbought'],
  'mfi-flow': ['rsiPeriod', 'rsiOversold', 'rsiOverbought'],
  'roc-momentum': ['emaFast'],
  'awesome-osc': ['emaFast', 'emaSlow'],
  'pivot-bounce': [],
  'parabolic-sar': ['atrPeriod', 'atrMult'],
  'ichimoku-break': ['emaFast', 'emaSlow', 'smaPeriod'],
  'swing-setups': ['emaFast', 'emaSlow'],
  'pullback-trend': ['emaFast', 'emaSlow'],
  'swing-ema-ribbon': ['emaFast', 'emaSlow'],
  'swing-breakout-retest': ['emaFast', 'emaSlow'],
  'swing-rsi-trend': ['rsiPeriod', 'rsiOversold', 'rsiOverbought', 'emaFast', 'emaSlow'],
  'swing-cci-reversal': ['cciPeriod', 'cciOversold'],
  'swing-flag': ['atrPeriod'],
  'swing-macd-turn': ['macdFast', 'macdSlow', 'macdSignal'],
  'swing-relative-strength': ['emaFast'],
  'pos-golden-cross': ['emaFast', 'emaSlow', 'smaPeriod'],
  'pos-200sma-trend': ['smaPeriod', 'emaSlow'],
  'pos-stage2': ['emaFast', 'emaSlow'],
  'pos-accumulation': ['atrPeriod'],
  'pos-breakout-weekly': ['emaFast', 'emaSlow'],
  'pos-mean-reversion': ['rsiPeriod', 'rsiOversold'],
  'pos-cci-cycle': ['cciPeriod', 'cciOversold'],
  'pos-low-volatility': ['atrPeriod'],
  'gap-up-down': [],
  orb: [],
  'day-trade': [],
  nr7: [],
  'high-volume': [],
  'rvol-spike': ['relativeVolumeMin'],
  'engulfing-proxy': [],
  'momentum-breakout': [],
  'top-gainers': [],
  'top-losers': [],
  '52w-near': [],
  undervalued: [],
};

function fieldsFromKeys(keys: (keyof ScanSettings)[]): ScanSettingsField[] {
  return keys
    .map((k) => ALL_FIELDS.find((f) => f.key === k))
    .filter(Boolean) as ScanSettingsField[];
}

/** Periods / levels for the selected indicator (MA length, RSI, etc.) */
export function indicatorFieldsForTemplate(templateId: string): ScanSettingsField[] {
  return fieldsFromKeys(INDICATOR_KEYS[templateId] || []);
}

/** Scan filters (volume, change %, result limit) */
export function filterFieldsForTemplate(templateId: string): ScanSettingsField[] {
  const extra: Record<string, (keyof ScanSettings)[]> = {
    'rsi-reversal': ['oversoldChangePct', 'overboughtChangePct'],
    stochastic: ['oversoldChangePct', 'overboughtChangePct'],
    'gap-up-down': ['minGapPct'],
    orb: ['minGapPct', 'minRangePct'],
    'day-trade': ['minGapPct'],
    nr7: ['maxRangePct', 'minRangePct'],
    'bollinger-squeeze': ['maxRangePct'],
    'atr-expansion': ['minRangePct'],
    'engulfing-proxy': ['minRangePct'],
    'vwap-reclaim': ['minGapPct'],
    'momentum-breakout': ['minGapPct'],
    'pullback-trend': ['oversoldChangePct'],
  };
  const base: (keyof ScanSettings)[] = [
    'resultLimit',
    'minChangePct',
    'maxChangePct',
    'minVolume',
    'strongAbsChangePct',
    'moderateAbsChangePct',
  ];
  return fieldsFromKeys([...base, ...(extra[templateId] || [])]);
}

/** All fields: indicator periods first, then filters */
export function fieldsForTemplate(templateId: string): ScanSettingsField[] {
  const seen = new Set<string>();
  const out: ScanSettingsField[] = [];
  for (const f of [
    ...indicatorFieldsForTemplate(templateId),
    ...filterFieldsForTemplate(templateId),
  ]) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    out.push(f);
  }
  return out;
}

export function settingsSummary(templateId: string, settings: ScanSettings): string {
  switch (templateId) {
    case 'ema-crossover':
    case 'swing-ema-ribbon':
    case 'swing-setups':
    case 'pullback-trend':
    case 'swing-breakout-retest':
      return `MA ${settings.emaFast} / ${settings.emaSlow}`;
    case 'sma-crossover':
    case 'pos-golden-cross':
      return `SMA ${settings.smaPeriod} · MA ${settings.emaFast}/${settings.emaSlow}`;
    case 'pos-200sma-trend':
      return `SMA ${settings.smaPeriod}`;
    case 'pos-stage2':
      return `MA ${settings.emaFast} / ${settings.emaSlow}`;
    case 'rsi-reversal':
    case 'swing-rsi-trend':
    case 'pos-mean-reversion':
      return `RSI(${settings.rsiPeriod}) ${settings.rsiOversold}/${settings.rsiOverbought}`;
    case 'macd-cross':
    case 'swing-macd-turn':
      return `MACD ${settings.macdFast}/${settings.macdSlow}/${settings.macdSignal}`;
    case 'stochastic':
    case 'williams-r':
      return `Period ${settings.rsiPeriod || settings.stochK}`;
    case 'mfi-flow':
      return `MFI(${settings.rsiPeriod})`;
    case 'bollinger-break':
    case 'bollinger-squeeze':
      return `BB(${settings.bbPeriod}, ${settings.bbStdDev})`;
    case 'supertrend':
      return `ST ATR(${settings.atrPeriod})×${settings.atrMult}`;
    case 'cci-zero':
      return `CCI(${settings.cciPeriod})`;
    case 'cci-oversold':
    case 'swing-cci-reversal':
    case 'pos-cci-cycle':
      return `CCI(${settings.cciPeriod}) ≤ ${settings.cciOversold}`;
    case 'cci-overbought':
      return `CCI(${settings.cciPeriod}) ≥ ${settings.cciOverbought}`;
    case 'cci-trend':
      return `CCI(${settings.cciPeriod}) trend`;
    case 'adx-trend':
      return `ADX(${settings.adxPeriod})≥${settings.adxMin}`;
    case 'atr-expansion':
    case 'pos-low-volatility':
    case 'swing-flag':
      return `ATR(${settings.atrPeriod})`;
    case 'awesome-osc':
      return `AO ${settings.emaFast}/${settings.emaSlow}`;
    case 'ichimoku-break':
      return `Ichi ${settings.emaFast}/${settings.emaSlow}/${settings.smaPeriod}`;
    case 'roc-momentum':
    case 'swing-relative-strength':
      return `Momentum`;
    default:
      return '';
  }
}

/** @deprecated use fieldsForTemplate — kept for older imports */
export const SCAN_SETTINGS_FIELDS = ALL_FIELDS;

const SETTINGS_KEY = 'trademindpro_scan_settings_v2';

export function readAllScanSettings(): Record<string, ScanSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ScanSettings>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readScanSettings(templateId: string): ScanSettings {
  const all = readAllScanSettings();
  const saved = all[templateId];
  const base = defaultSettingsFor(templateId);
  return saved ? { ...base, ...saved } : base;
}

export function writeScanSettings(templateId: string, settings: ScanSettings): void {
  const all = readAllScanSettings();
  all[templateId] = settings;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
}
