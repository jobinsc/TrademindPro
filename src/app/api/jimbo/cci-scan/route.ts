import { NextRequest, NextResponse } from 'next/server';
import { runJimboFoCciScan } from '@/lib/jimbo-cci-scan';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Live Jimbo CCI scan over NSE equity F&O watchlist.
 * Body: { cciPeriod?, requirePaConfirm?, minConfidence?, primaryTimeframe?, scanScope?, symbols?, focusSymbols?, liveSpots? }
 */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Connect Upstox first', code: 'NO_TOKEN' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      cciPeriod?: number;
      requirePaConfirm?: boolean;
      minConfidence?: number;
      primaryTimeframe?: string;
      scanScope?: 'full' | 'liquid' | 'focus';
      maxLiquidityRank?: number;
      symbols?: string[];
      focusSymbols?: string[];
      liveSpots?: Record<string, { lastPrice?: number; changePct?: number | null }>;
      maxSymbols?: number;
    };

    const result = await runJimboFoCciScan({
      accessToken: token,
      settings: {
        cciPeriod: Number(body.cciPeriod) > 0 ? Number(body.cciPeriod) : 20,
        requirePaConfirm: body.requirePaConfirm !== false,
        minConfidence: Number(body.minConfidence) > 0 ? Number(body.minConfidence) : 75,
        primaryTimeframe: body.primaryTimeframe || '5m',
        scanScope: body.scanScope || 'liquid',
        maxLiquidityRank:
          Number(body.maxLiquidityRank) > 0 ? Number(body.maxLiquidityRank) : 25,
      },
      liveSpots: body.liveSpots,
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      focusSymbols: Array.isArray(body.focusSymbols) ? body.focusSymbols : undefined,
      maxSymbols: body.maxSymbols,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'CCI scan failed' },
      { status: 500 }
    );
  }
}
