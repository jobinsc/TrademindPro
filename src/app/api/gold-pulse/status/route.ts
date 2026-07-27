import { NextResponse } from 'next/server';
import {
  GOLD_PULSE_NAME,
  GOLD_PULSE_VERSION,
  GOLD_YAHOO_SYMBOL,
  goldPulseRuleSummary,
} from '@/lib/gold-pulse/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: GOLD_PULSE_NAME,
    version: GOLD_PULSE_VERSION,
    separateFromOthers: true,
    yahooSymbol: GOLD_YAHOO_SYMBOL,
    rules: goldPulseRuleSummary(),
    serverAt: new Date().toISOString(),
  });
}
