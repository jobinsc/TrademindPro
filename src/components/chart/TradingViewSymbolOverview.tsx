'use client';

import { useEffect, useId, useRef } from 'react';

type Props = {
  symbol: string; // NSE:TCS
  height?: number | string;
  className?: string;
};

/**
 * Official TradingView Symbol Overview — supports NSE equities with
 * 1D / 1M / 3M / 1Y / 5Y / ALL history ranges (unlike free Advanced Chart).
 */
export default function TradingViewSymbolOverview({
  symbol,
  height = '100%',
  className = '',
}: Props) {
  const uid = useId().replace(/:/g, '');
  const containerId = `tv_overview_${uid}`;
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    const widgetEl = document.createElement('div');
    widgetEl.className = 'tradingview-widget-container__widget';
    widgetEl.style.height = '100%';
    widgetEl.style.width = '100%';
    host.appendChild(widgetEl);

    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [[symbol]],
      chartOnly: false,
      width: '100%',
      height: '100%',
      locale: 'en',
      colorTheme: 'light',
      autosize: true,
      showVolume: true,
      showMA: true,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: 'right',
      scaleMode: 'Normal',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
      fontSize: '10',
      noTimeScale: false,
      valuesTracking: '1',
      changeMode: 'price-and-percent',
      chartType: 'candles',
      headerFontSize: 'medium',
      lineWidth: 2,
      lineType: 0,
      dateRanges: [
        '1d|1',
        '1m|30',
        '3m|60',
        '12m|1D',
        '60m|1W',
        'all|1M',
      ],
    });
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
  }, [symbol]);

  return (
    <div
      className={`h-full min-h-[560px] w-full overflow-hidden rounded-2xl border border-[#cfe0ee] bg-white ${className}`}
      style={{ height }}
    >
      <div
        id={containerId}
        ref={hostRef}
        className="tradingview-widget-container h-full w-full"
      />
    </div>
  );
}
