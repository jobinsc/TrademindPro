/** Global chart settings — shared across every symbol until the user changes them */

export const CHART_SETTINGS_KEY = 'trademindpro_chart_settings_v1';

export type ChartStylePref = 'candle' | 'ohlc' | 'area';

export type ChartSettings = {
  style: ChartStylePref;
  /** Active indicator ids (MA, EMA, RSI, …) */
  indicators: string[];
  /** Last timeframe id (1, 5, 15, D, …) */
  interval: string;
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  style: 'candle',
  indicators: ['MA', 'EMA', 'VOL'],
  interval: 'D',
};

export function readChartSettings(): ChartSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_CHART_SETTINGS };
  try {
    const raw = localStorage.getItem(CHART_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CHART_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ChartSettings>;
    const style =
      parsed.style === 'ohlc' || parsed.style === 'area' || parsed.style === 'candle'
        ? parsed.style
        : DEFAULT_CHART_SETTINGS.style;
    const indicators = Array.isArray(parsed.indicators)
      ? parsed.indicators.filter((x) => typeof x === 'string' && x.trim())
      : DEFAULT_CHART_SETTINGS.indicators;
    const interval =
      typeof parsed.interval === 'string' && parsed.interval.trim()
        ? parsed.interval.trim()
        : DEFAULT_CHART_SETTINGS.interval;
    return {
      style,
      indicators: indicators.length ? indicators : [...DEFAULT_CHART_SETTINGS.indicators],
      interval,
    };
  } catch {
    return { ...DEFAULT_CHART_SETTINGS };
  }
}

export function writeChartSettings(next: ChartSettings) {
  try {
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function patchChartSettings(
  patch: Partial<ChartSettings>
): ChartSettings {
  const current = readChartSettings();
  const merged: ChartSettings = {
    style: patch.style ?? current.style,
    indicators: patch.indicators ?? current.indicators,
    interval: patch.interval ?? current.interval,
  };
  writeChartSettings(merged);
  return merged;
}
