import { NextResponse } from 'next/server';
import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import { deskBoardKeys, deskLabel, getActiveDesk } from '@/lib/market-desk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOARD = [
  { symbol: '^NSEI', name: 'Nifty 50', short: 'NIFTY' },
  { symbol: '^NSEBANK', name: 'Bank Nifty', short: 'BANKNIFTY' },
  { symbol: '^BSESN', name: 'Sensex', short: 'SENSEX' },
  { symbol: 'GC=F', name: 'Gold', short: 'GOLD' },
  { symbol: 'BTC-USD', name: 'Bitcoin', short: 'BTC' },
  { symbol: 'INR=X', name: 'USD / INR', short: 'USDINR' },
] as const;

export async function GET() {
  const desk = getActiveDesk();
  const allowed = new Set(deskBoardKeys(desk));
  const items = BOARD.filter((item) => allowed.has(item.short));
  const interval = desk === 'INDIA' ? '5m' : '15m';

  const rows = await Promise.all(
    items.map(async (item) => {
      const r = await fetchYahooCandles(item.symbol, interval, 40, item.name);
      const change =
        r.ok && r.prevClose && r.prevClose > 0 ? r.spot - r.prevClose : null;
      const changePct =
        change != null && r.prevClose ? (change / r.prevClose) * 100 : null;
      return {
        key: item.short,
        name: item.name,
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
    desk,
    deskLabel: deskLabel(desk),
    fetchedAt: new Date().toISOString(),
    markets: rows,
  });
}
