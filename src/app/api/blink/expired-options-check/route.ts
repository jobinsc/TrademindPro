import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first.' },
        { status: 401 }
      );
    }

    const url = new URL(
      'https://api.upstox.com/v2/expired-instruments/expiries'
    );
    url.searchParams.set('instrument_key', 'NSE_INDEX|Nifty 50');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Preserve a non-JSON Upstox error body for diagnosis.
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          upstoxStatus: response.status,
          upstoxResponse: payload,
        },
        { status: response.status }
      );
    }

    const expiries =
      typeof payload === 'object' &&
      payload !== null &&
      'data' in payload &&
      Array.isArray((payload as { data?: unknown }).data)
        ? ((payload as { data: string[] }).data || [])
        : [];
    return NextResponse.json({
      ok: true,
      entitled: true,
      expiryCount: expiries.length,
      firstExpiry: expiries[0] || null,
      lastExpiry: expiries.at(-1) || null,
      coversRequestedPeriod: expiries.some(
        (expiry) => expiry >= '2026-02-26' && expiry <= '2026-07-21'
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
