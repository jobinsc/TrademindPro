import { NextResponse } from 'next/server';
import { getPinaxWsFeedStatus } from '@/lib/pinax-forge/live-watch';
import {
  PINAX_FORGE_MODULES,
  PINAX_FORGE_NAME,
  PINAX_FORGE_RULES,
  PINAX_FORGE_VERSION,
} from '@/lib/pinax-forge/rules';
import type { PinaxForgeStatus } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Phase 3 status — does not touch Blink or place live orders. */
export async function GET() {
  const ws = getPinaxWsFeedStatus();
  const body: PinaxForgeStatus = {
    ok: true,
    agent: PINAX_FORGE_NAME,
    version: PINAX_FORGE_VERSION,
    liveOrdersAllowed: false,
    paperOnly: true,
    separateFromBlink: true,
    serverAt: new Date().toISOString(),
    modules: PINAX_FORGE_MODULES.map((m) => m.id),
    message:
      'PinaxForge Phase 3 online — overrides, tuning, EOD review. Paper-only. Blink untouched.',
    wsConnected: ws.wsConnected,
    lastTickAt: ws.lastTickAt,
  };
  return NextResponse.json({
    ...body,
    rules: {
      lotSize: PINAX_FORGE_RULES.lotSize,
      expiry: PINAX_FORGE_RULES.expiry,
      premiumPreferMin: PINAX_FORGE_RULES.premiumPreferMin,
      premiumPreferMax: PINAX_FORGE_RULES.premiumPreferMax,
      sessionEntryCutoffIst: PINAX_FORGE_RULES.sessionEntryCutoffIst,
      roundTripCostInr: PINAX_FORGE_RULES.roundTripCostInr,
      primaryRr: PINAX_FORGE_RULES.primaryRr,
      maxTradesPerDay: PINAX_FORGE_RULES.maxTradesPerDay,
      dailyLossKillSwitchInr: PINAX_FORGE_RULES.dailyLossKillSwitchInr,
      dailyProfitTargetInr: PINAX_FORGE_RULES.dailyProfitTargetInr,
      mandatoryStopLoss: PINAX_FORGE_RULES.mandatoryStopLoss,
    },
  });
}
