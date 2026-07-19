import { NextRequest, NextResponse } from 'next/server';
import { defaultNejoicSettings } from '@/lib/nejoic';
import { buildLivePulse, parseTimeframe } from '@/lib/nejoic-pulse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tf = parseTimeframe(req.nextUrl.searchParams.get('tf'));
  const settings = defaultNejoicSettings();
  const pulse = await buildLivePulse(tf, {
    leftBars: settings.leftBars,
    rightBars: settings.rightBars,
    setupStyle: settings.setupStyle,
    minConfidence: settings.minConfidence,
  });
  return NextResponse.json(pulse);
}
