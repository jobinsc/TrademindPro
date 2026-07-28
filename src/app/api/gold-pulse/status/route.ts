import { NextResponse } from 'next/server';
import {
  GOLD_PULSE_NAME,
  GOLD_PULSE_VERSION,
  GOLD_YAHOO_SYMBOL,
  goldPulseRuleSummary,
} from '@/lib/gold-pulse/rules';
import { GOLD_STRATEGIES } from '@/lib/gold-pulse/strategies';
import { goldSessionDate, loadGoldSession } from '@/lib/gold-pulse/session-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionDate = goldSessionDate();
  const session = await loadGoldSession(sessionDate);
  return NextResponse.json({
    ok: true,
    name: GOLD_PULSE_NAME,
    version: GOLD_PULSE_VERSION,
    separateFromOthers: true,
    yahooSymbol: GOLD_YAHOO_SYMBOL,
    rules: goldPulseRuleSummary(),
    strategies: Object.values(GOLD_STRATEGIES).map((s) => ({
      id: s.id,
      title: s.title,
      badge: s.badge,
      description: s.description,
    })),
    paperStrategyId: session?.paperStrategyId ?? null,
    serverAt: new Date().toISOString(),
  });
}
