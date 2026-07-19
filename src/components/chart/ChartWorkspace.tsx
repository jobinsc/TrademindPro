'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Maximize2 } from 'lucide-react';
import BackToLink from '@/components/ui/BackToLink';
import LocalAdvancedChart from '@/components/chart/LocalAdvancedChart';
import {
  openTradingViewWindow,
  parseChartQuery,
  tradingViewChartUrl,
} from '@/lib/chart';
import { patchChartSettings, readChartSettings } from '@/lib/chart-settings';

export default function ChartWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const parsed = useMemo(() => parseChartQuery(searchParams), [searchParams]);
  const [interval, setIntervalId] = useState(parsed.interval || 'D');
  const [prefsReady, setPrefsReady] = useState(false);
  const tvUrl = tradingViewChartUrl(parsed.tvSymbol);

  // Restore last global timeframe for every chart open
  useEffect(() => {
    const saved = readChartSettings();
    const urlHasInterval = searchParams.has('interval');
    const next = urlHasInterval ? parsed.interval || saved.interval : saved.interval;
    setIntervalId(next);
    if (urlHasInterval && parsed.interval) {
      patchChartSettings({ interval: parsed.interval });
    }
    setPrefsReady(true);
  }, [parsed.symbol, parsed.exchange]); // eslint-disable-line react-hooks/exhaustive-deps

  function setTf(id: string) {
    setIntervalId(id);
    patchChartSettings({ interval: id });
    const params = new URLSearchParams(searchParams.toString());
    params.set('interval', id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function launchTradingView() {
    const win = openTradingViewWindow(parsed.tvSymbol);
    if (win) {
      win.focus();
      return;
    }
    window.open(tvUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-2.75rem)] w-full max-w-[1800px] flex-col px-2 py-2 md:px-3 md:py-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <BackToLink fallback="/app/watchlist" label="Back" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={launchTradingView}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2962ff] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1e53e5]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Full TradingView
          </button>
          <a
            href={tvUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-sky-ink ring-1 ring-[#cfe0ee] hover:bg-sky-soft/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            New tab
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {prefsReady && (
          <LocalAdvancedChart
            key={`${parsed.symbol}-${parsed.exchange}`}
            symbol={parsed.symbol}
            exchange={parsed.exchange}
            interval={interval}
            onIntervalChange={setTf}
            height="100%"
            className="h-full min-h-[calc(100dvh-8rem)]"
          />
        )}
      </div>
    </div>
  );
}
