import { NextResponse } from 'next/server';
import { fetchYahooQuote } from '@/lib/yahoo-nifty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compact world board — important indices only */
const WORLD = [
  { region: 'INDIA', symbol: '^NSEI', name: 'Nifty 50', short: 'NIFTY' },
  { region: 'INDIA', symbol: '^BSESN', name: 'Sensex', short: 'SENSEX' },
  { region: 'INDIA', symbol: '^INDIAVIX', name: 'India VIX', short: 'INDIAVIX' },
  { region: 'INDIA', symbol: 'INR=X', name: 'USD / INR', short: 'USDINR' },
  { region: 'US', symbol: '^GSPC', name: 'S&P 500', short: 'SPX' },
  { region: 'US', symbol: '^IXIC', name: 'Nasdaq', short: 'NASDAQ' },
  { region: 'US', symbol: '^DJI', name: 'Dow Jones', short: 'DOW' },
  { region: 'EUROPE', symbol: '^GDAXI', name: 'DAX', short: 'DAX' },
  { region: 'EUROPE', symbol: '^FTSE', name: 'FTSE 100', short: 'FTSE' },
  { region: 'ASIA', symbol: '^N225', name: 'Nikkei 225', short: 'NIKKEI' },
  { region: 'ASIA', symbol: '^HSI', name: 'Hang Seng', short: 'HSI' },
] as const;

export async function GET() {
  const rows = await Promise.all(
    WORLD.map(async (item) => {
      const r = await fetchYahooQuote(item.symbol, item.name);
      const change =
        r.ok && r.prevClose && r.prevClose > 0 ? r.spot - r.prevClose : null;
      const changePct =
        change != null && r.prevClose ? (change / r.prevClose) * 100 : null;
      return {
        key: item.short,
        name: item.name,
        region: item.region,
        symbol: item.symbol,
        ok: r.ok,
        spot: r.ok ? r.spot : null,
        prevClose: r.prevClose,
        change,
        changePct,
        error: r.error || null,
      };
    })
  );

  return NextResponse.json({
    ok: rows.some((r) => r.ok),
    fetchedAt: new Date().toISOString(),
    markets: rows,
    byRegion: {
      INDIA: rows.filter((r) => r.region === 'INDIA'),
      US: rows.filter((r) => r.region === 'US'),
      EUROPE: rows.filter((r) => r.region === 'EUROPE'),
      ASIA: rows.filter((r) => r.region === 'ASIA'),
    },
  });
}
