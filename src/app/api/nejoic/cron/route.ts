import { NextRequest, NextResponse } from 'next/server';
import { defaultNejoicSettings } from '@/lib/nejoic';
import { buildLivePulse, parseTimeframe } from '@/lib/nejoic-pulse';
import { broadcastTelegram, telegramConfigured } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron: push Live Pulse every run (default every 3 minutes via vercel.json).
 * Auth: CRON_SECRET / TELEGRAM_WEBHOOK_SECRET (query ?secret= or Bearer).
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

  const tf = parseTimeframe(req.nextUrl.searchParams.get('tf') || '5m');
  const settings = defaultNejoicSettings();
  const pulse = await buildLivePulse(tf, settings);

  if (!pulse.ok || !pulse.text) {
    return NextResponse.json({ ok: false, error: pulse.error || 'No pulse' });
  }

  const result = await broadcastTelegram(pulse.text);

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    decision: pulse.decision,
    error: result.error,
  });
}
