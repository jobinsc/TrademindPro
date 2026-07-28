import { NextResponse } from 'next/server';
import {
  NEXUS_PULSE_B_NAME,
  NEXUS_PULSE_B_VERSION,
  nexusBRuleSummary,
} from '@/lib/nexus-pulse-b/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: NEXUS_PULSE_B_NAME,
    version: NEXUS_PULSE_B_VERSION,
    separateFromOthers: true,
    rules: nexusBRuleSummary(),
    serverAt: new Date().toISOString(),
  });
}
