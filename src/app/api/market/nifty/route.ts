import { NextResponse } from 'next/server';
import type { Candle } from '@/lib/nejoic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type YahooChart = {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; symbol?: string };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }[];
      };
    }[];
    error?: unknown;
  };
};

function toCandles(data: YahooChart): { spot: number; candles: Candle[] } | null {
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;
  const q = result.indicators?.quote?.[0];
  if (!q) return null;

  const candles: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      t: new Date(result.timestamp[i] * 1000).toISOString(),
      open,
      high,
      low,
      close,
    });
  }
  if (candles.length < 5) return null;
  const spot =
    result.meta?.regularMarketPrice ?? candles[candles.length - 1]?.close ?? 0;
  return { spot, candles: candles.slice(-80) };
}

export async function GET() {
  try {
    const url =
      'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m&range=1d';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TradeMindPro/0.1',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          source: null,
          error: `Upstream ${res.status}`,
          spot: null,
          candles: [],
        },
        { status: 200 }
      );
    }

    const data = (await res.json()) as YahooChart;
    const parsed = toCandles(data);
    if (!parsed) {
      return NextResponse.json({
        ok: false,
        source: null,
        error: 'Could not parse Nifty candles',
        spot: null,
        candles: [],
      });
    }

    return NextResponse.json({
      ok: true,
      source: 'yahoo-nsei',
      label: 'Nifty 50 (live 1m)',
      spot: parsed.spot,
      candles: parsed.candles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Fetch failed';
    return NextResponse.json({
      ok: false,
      source: null,
      error: message,
      spot: null,
      candles: [],
    });
  }
}
