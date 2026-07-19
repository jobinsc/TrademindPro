'use client';

import { useEffect, useId, useRef } from 'react';

type Props = {
  symbol: string; // e.g. NSE:ICICIBANK
  interval?: string;
  height?: number | string;
  className?: string;
};

/**
 * Official TradingView Advanced Chart via embed script (not query-string iframe).
 * Works well for indices / some symbols; many NSE equities are blocked by TV.
 */
export default function TradingViewAdvancedChart({
  symbol,
  interval = 'D',
  height = '100%',
  className = '',
}: Props) {
  const uid = useId().replace(/:/g, '');
  const containerId = `tv_adv_${uid}`;
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    const widgetEl = document.createElement('div');
    widgetEl.className = 'tradingview-widget-container__widget';
    widgetEl.style.height = 'calc(100% - 32px)';
    widgetEl.style.width = '100%';
    host.appendChild(widgetEl);

    const copyright = document.createElement('div');
    copyright.className = 'tradingview-widget-copyright';
    copyright.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a>`;
    host.appendChild(copyright);

    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: String(interval),
      timezone: 'Asia/Kolkata',
      theme: 'light',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(255, 255, 255, 1)',
      gridColor: 'rgba(207, 224, 238, 0.4)',
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: true,
      details: true,
      hotlist: false,
      withdateranges: true,
      enable_publishing: false,
      show_popup_button: true,
      popup_width: '1200',
      popup_height: '800',
      support_host: 'https://www.tradingview.com',
      studies: ['Volume@tv-basicstudies', 'STD;SMA'],
    });
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
  }, [symbol, interval]);

  return (
    <div
      className={`h-full min-h-[560px] w-full overflow-hidden rounded-2xl border border-[#cfe0ee] bg-white ${className}`}
      style={{ height }}
    >
      <div
        id={containerId}
        ref={hostRef}
        className="tradingview-widget-container h-full w-full"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}
