import { NextRequest, NextResponse } from 'next/server';
import { fetchStockAtmOptionLtp } from '@/lib/jimbo-cci-scan';
import { roundJimboStrike } from '@/lib/jimbo';
import { getBearerToken, fetchUpstoxQuotes } from '@/lib/upstox-market';
import { resolveInstrumentKeys } from '@/lib/instruments';
import type { OptionSide } from '@/lib/upstox-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live equity F&O option LTP for Jimbo paper — Upstox only, no simulation.
 * Body: { instrumentKey? } OR { symbol, option, strike?, spot? }
 */
export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first', code: 'NO_TOKEN' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      instrumentKey?: string;
      symbol?: string;
      option?: OptionSide;
      strike?: number;
      spot?: number;
    };

    if (body.instrumentKey) {
      const quotes = await fetchUpstoxQuotes(token, [body.instrumentKey]);
      const q = quotes[0];
      if (!q?.lastPrice) {
        return NextResponse.json(
          { ok: false, error: 'No Upstox LTP for instrument' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        source: 'upstox',
        ltp: Math.round(q.lastPrice * 100) / 100,
        instrumentKey: body.instrumentKey,
        option: body.option || null,
        strike: body.strike ?? null,
      });
    }

    const symbol = String(body.symbol || '').trim().toUpperCase();
    const option = String(body.option || '').toUpperCase() as OptionSide;
    if (!symbol || (option !== 'CE' && option !== 'PE')) {
      return NextResponse.json(
        { ok: false, error: 'instrumentKey or symbol+option (CE|PE) required' },
        { status: 400 }
      );
    }

    const resolved = await resolveInstrumentKeys([symbol]);
    const row = resolved.get(symbol);
    if (!row?.instrumentKey) {
      return NextResponse.json(
        { ok: false, error: `No Upstox equity key for ${symbol}` },
        { status: 404 }
      );
    }

    const spot = Number(body.spot) > 0 ? Number(body.spot) : Number(body.strike) || 0;
    if (!(spot > 0)) {
      return NextResponse.json(
        { ok: false, error: 'spot or strike required to resolve ATM' },
        { status: 400 }
      );
    }

    const atm = await fetchStockAtmOptionLtp({
      accessToken: token,
      underlyingKey: row.instrumentKey,
      spot,
      option,
      strike: body.strike ?? roundJimboStrike(spot),
    });

    if (!atm.ok || !(atm.ltp > 0)) {
      return NextResponse.json(
        { ok: false, error: atm.error || 'No Upstox ATM option LTP' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: 'upstox',
      ltp: atm.ltp,
      instrumentKey: atm.instrumentKey,
      tradingSymbol: atm.tradingSymbol,
      strike: atm.strike,
      lotSize: atm.lotSize,
      expiry: atm.expiry,
      option,
      symbol,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Jimbo option LTP failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
