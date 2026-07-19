import { NextRequest, NextResponse } from 'next/server';
import { defaultNejoicSettings } from '@/lib/nejoic';
import { buildLivePulse, parseTimeframe } from '@/lib/nejoic-pulse';
import { deskForcedTimeframe, deskLabel, getActiveDesk } from '@/lib/market-desk';
import { broadcastTelegram, telegramConfigured } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron backup: desk-aware Live Pulse → Telegram.
 * After hours = Gold 15m only · Weekend = BTC 15m only · India = Nifty.
 */
export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get('secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected =
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: 'Telegram not configured' });
  }

  const desk = getActiveDesk();
  const forced = deskForcedTimeframe(desk);
  const tf = parseTimeframe(forced || req.nextUrl.searchParams.get('tf') || '5m');
  const settings = defaultNejoicSettings();
  const pulse = await buildLivePulse(tf, settings);

  if (!pulse.ok || !pulse.text) {
    return NextResponse.json({ ok: false, error: pulse.error || 'No pulse', desk });
  }

  const result = await broadcastTelegram(pulse.text);

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    desk,
    deskLabel: deskLabel(desk),
    timeframe: tf,
    decision: pulse.decision,
    asset: pulse.asset,
    error: result.error,
  });
}
