import { NextResponse } from 'next/server';
import {
  NEXUS_PULSE_NAME,
  NEXUS_PULSE_VERSION,
  nexusRuleSummary,
} from '@/lib/nexus-pulse/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: NEXUS_PULSE_NAME,
    version: NEXUS_PULSE_VERSION,
    separateFromOthers: true,
    rules: nexusRuleSummary(),
    serverAt: new Date().toISOString(),
  });
}
