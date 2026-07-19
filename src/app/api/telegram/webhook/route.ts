import { NextRequest, NextResponse } from 'next/server';
import { handleNejoicAsk } from '@/lib/nejoic-ask';
import {
  sendTelegramMessage,
  telegramConfigured,
  verifyWebhookSecret,
  isChatAllowed,
} from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TgUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!telegramConfigured()) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 503 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = String(update.message?.text || '').trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  if (!isChatAllowed(chatId)) {
    await sendTelegramMessage(
      chatId,
      `Nejoic: your chat id is ${chatId}. Add it to TELEGRAM_ALLOWED_CHAT_IDS on the server.`
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const data = await handleNejoicAsk(text);
    await sendTelegramMessage(chatId, data.text || 'Nejoic is quiet — try /pulse');
  } catch {
    await sendTelegramMessage(chatId, 'Nejoic hit an error. Try /pulse again.');
  }

  return NextResponse.json({ ok: true });
}
