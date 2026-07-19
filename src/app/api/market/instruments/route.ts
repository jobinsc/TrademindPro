import { NextRequest, NextResponse } from 'next/server';
import { getEquityInstruments, searchInstruments } from '@/lib/instruments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** NSE + BSE equity universe from Upstox BOD files */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || undefined;
    const exchange = (searchParams.get('exchange') || 'ALL').toUpperCase() as
      | 'NSE'
      | 'BSE'
      | 'ALL';
    const limit = Number(searchParams.get('limit') || 50);
    const refresh = searchParams.get('refresh') === '1';

    if (refresh) {
      await getEquityInstruments(true);
    }

    const { total, items } = await searchInstruments({
      q,
      exchange: exchange === 'NSE' || exchange === 'BSE' ? exchange : 'ALL',
      limit,
    });

    const all = await getEquityInstruments();
    const nse = all.filter((i) => i.exchange === 'NSE').length;
    const bse = all.filter((i) => i.exchange === 'BSE').length;

    return NextResponse.json({
      ok: true,
      total,
      nseCount: nse,
      bseCount: bse,
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Instrument load failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
