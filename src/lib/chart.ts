/** Chart prefs + TradingView / Yahoo symbol helpers */

import { resolveIndiaIndex } from '@/lib/india-indices';

export const CHART_PEEK_KEY = 'trademindpro_chart_peek_enabled';

export function readChartPeekEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(CHART_PEEK_KEY);
    if (v === null) return true; // default ON
    return v === '1';
  } catch {
    return true;
  }
}

export function writeChartPeekEnabled(on: boolean) {
  try {
    localStorage.setItem(CHART_PEEK_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export type ChartSymbol = {
  symbol: string;
  exchange?: 'NSE' | 'BSE' | string;
  name?: string;
};

/** Map app symbol → TradingView symbol (India cash / indices) */
export function toTradingViewSymbol(input: ChartSymbol | string): string {
  if (typeof input === 'string') {
    const s = input.trim().toUpperCase();
    if (!s) return 'NSE:NIFTY';
    if (s.includes(':')) return s;
    const idx = resolveIndiaIndex(s);
    if (idx) return idx.tv;
    return `NSE:${s}`;
  }
  const raw = (input.symbol || '').trim().toUpperCase();
  if (!raw) return 'NSE:NIFTY';
  if (raw.includes(':')) return raw;
  const idx = resolveIndiaIndex(raw);
  if (idx) return idx.tv;
  const ex = (input.exchange || 'NSE').toUpperCase();
  if (ex === 'BSE') return `BSE:${raw}`;
  return `NSE:${raw}`;
}

/** Yahoo Finance symbol for India equities / indices */
export function toYahooSymbol(input: ChartSymbol | string): string {
  const raw =
    typeof input === 'string'
      ? input.trim().toUpperCase()
      : (input.symbol || '').trim().toUpperCase();
  const idx = resolveIndiaIndex(raw.includes(':') ? raw.split(':')[1] : raw);
  if (idx) return idx.yahoo;

  const tv = toTradingViewSymbol(input);
  const [ex, sym] = tv.includes(':') ? tv.split(':') : ['NSE', tv];
  if (ex === 'BSE') return `${sym}.BO`;
  return `${sym}.NS`;
}

export function tradingViewChartUrl(tvSymbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
}

/** True when free TradingView embeds usually block this exchange (NSE/BSE). */
export function isIndiaExchange(exchange: string): boolean {
  const ex = exchange.toUpperCase();
  return ex === 'NSE' || ex === 'BSE' || ex === 'NFO' || ex === 'BFO';
}

/** Open the real TradingView chart (full site) — only place NSE gets all features. */
export function openTradingViewWindow(tvSymbol: string): Window | null {
  if (typeof window === 'undefined') return null;
  const url = tradingViewChartUrl(tvSymbol);
  const w = 1400;
  const h = 900;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  // Do not use noopener — it makes window.open return null even when the window opens.
  return window.open(
    url,
    `tv_${tvSymbol.replace(/[^a-zA-Z0-9]/g, '_')}`,
    `popup=yes,width=${w},height=${h},left=${left},top=${top}`
  );
}

export function tradingViewWidgetEmbedUrl(
  tvSymbol: string,
  interval = '15'
): string {
  const config = {
    autosize: true,
    symbol: tvSymbol,
    interval: String(interval),
    timezone: 'Asia/Kolkata',
    theme: 'light',
    style: '1',
    locale: 'en',
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    support_host: 'https://www.tradingview.com',
  };
  return `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(
    JSON.stringify(config)
  )}`;
}

export function chartHref(
  input: ChartSymbol | string,
  fromPath?: string | null
): string {
  const tv = toTradingViewSymbol(input);
  const [ex, sym] = tv.includes(':') ? tv.split(':') : ['NSE', tv];
  const params = new URLSearchParams();
  params.set('symbol', sym);
  params.set('exchange', ex);
  if (typeof input !== 'string' && input.name) params.set('name', input.name);
  if (fromPath && fromPath.startsWith('/app')) params.set('from', fromPath);
  return `/app/chart?${params.toString()}`;
}

export function parseChartQuery(search: URLSearchParams): {
  symbol: string;
  exchange: string;
  name: string;
  tvSymbol: string;
  yahooSymbol: string;
  interval: string;
} {
  const symbol = (search.get('symbol') || 'NIFTY').toUpperCase();
  const exchange = (search.get('exchange') || 'NSE').toUpperCase();
  const name = search.get('name') || '';
  const interval = search.get('interval') || 'D';
  const tvSymbol = toTradingViewSymbol({ symbol, exchange });
  const yahooSymbol = toYahooSymbol({ symbol, exchange });
  return { symbol, exchange, name, tvSymbol, yahooSymbol, interval };
}

export const CHART_INTERVALS: { id: string; label: string; yahoo: string }[] = [
  { id: '1', label: '1m', yahoo: '1m' },
  { id: '3', label: '3m', yahoo: '2m' },
  { id: '5', label: '5m', yahoo: '5m' },
  { id: '15', label: '15m', yahoo: '15m' },
  { id: '30', label: '30m', yahoo: '30m' },
  { id: '60', label: '1H', yahoo: '60m' },
  { id: '240', label: '4H', yahoo: '60m' },
  { id: 'D', label: '1D', yahoo: '1d' },
  { id: 'W', label: '1W', yahoo: '1wk' },
  { id: 'M', label: '1M', yahoo: '1mo' },
];
