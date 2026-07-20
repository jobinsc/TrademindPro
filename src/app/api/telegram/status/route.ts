import { NextResponse } from 'next/server';
import { allowedChatIds, telegramConfigured } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Check whether server-side Telegram delivery is configured (no secrets exposed). */
export async function GET() {
  const tokenSet = telegramConfigured();
  const chatIds = allowedChatIds();
  const chatIdsSet = chatIds.length > 0;

  let ok = tokenSet && chatIdsSet;
  let message = 'Ready to send';

  if (!tokenSet) {
    ok = false;
    message = 'TELEGRAM_BOT_TOKEN missing in .env.local or Vercel';
  } else if (!chatIdsSet) {
    ok = false;
    message = 'TELEGRAM_ALLOWED_CHAT_IDS missing (get id from @userinfobot)';
  }

  return NextResponse.json({
    ok,
    tokenSet,
    chatIdsSet,
    chatCount: chatIds.length,
    message,
  });
}
