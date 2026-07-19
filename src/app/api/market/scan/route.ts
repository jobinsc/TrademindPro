import { NextRequest, NextResponse } from 'next/server';
import { runLiveScan } from '@/lib/live-scan';
import { getBearerToken } from '@/lib/upstox-market';
import type { ScanSettings } from '@/lib/scan-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Full NSE/BSE quote batches can take a while */
export const maxDuration = 120;

/** Live exchange scan using Upstox quotes (full equity list for NSE or BSE) */
export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Connect Upstox first (Broker Terminal → Login with Upstox)',
          code: 'NO_TOKEN',
        },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      templateId?: string;
      exchange?: 'NSE' | 'BSE';
      settings?: Partial<ScanSettings>;
    };

    if (!body.templateId) {
      return NextResponse.json({ ok: false, error: 'templateId required' }, { status: 400 });
    }

    const exchange = body.exchange === 'BSE' ? 'BSE' : 'NSE';

    const result = await runLiveScan({
      accessToken: token,
      templateId: body.templateId,
      exchange,
      settings: body.settings,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Live scan failed';
    const status = /token|401|Unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
