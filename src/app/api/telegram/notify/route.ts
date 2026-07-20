import { NextRequest, NextResponse } from 'next/server';
import { broadcastTelegram, telegramConfigured } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** In-process dedupe so Strict Mode / double clients don't double-send. */
const recent = new Map<string, number>();

/**
 * Push a message to Jobin’s Telegram (paper alerts).
 * Optional: set TELEGRAM_NOTIFY_KEY and send header x-notify-key.
 */
export async function POST(req: NextRequest) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: 'Telegram not configured' });
  }

  const required = process.env.TELEGRAM_NOTIFY_KEY?.trim();
  if (required) {
    const provided = req.headers.get('x-notify-key');
    if (provided !== required) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const text = String(body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const fp = text.slice(0, 320);
  const now = Date.now();
  const last = recent.get(fp) || 0;
  if (now - last < 12_000) {
    return NextResponse.json({ ok: true, sent: 0, deduped: true });
  }
  recent.set(fp, now);
  if (recent.size > 80) {
    for (const [k, t] of recent) {
      if (now - t > 60_000) recent.delete(k);
    }
  }

  const result = await broadcastTelegram(text);
  return NextResponse.json(result);
}
