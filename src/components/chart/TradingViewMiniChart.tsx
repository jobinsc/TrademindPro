'use client';

import { useEffect, useId, useRef } from 'react';

type Props = {
  symbol: string; // TradingView format
  width?: number;
  height?: number;
  className?: string;
};

/**
 * Compact TradingView mini chart (embed widget).
 * Used for hover peeks — loads via official embed script.
 */
export default function TradingViewMiniChart({
  symbol,
  width = 320,
  height = 200,
  className = '',
}: Props) {
  const id = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    host.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    host.appendChild(widget);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height,
      locale: 'en',
      dateRange: '1D',
      colorTheme: 'light',
      isTransparent: false,
      autosize: true,
      largeChartUrl: '',
    });
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
  }, [symbol, height]);

  return (
    <div
      className={`tradingview-widget-container overflow-hidden rounded-xl bg-white ${className}`}
      style={{ width, height }}
      data-tv-mini={id}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
