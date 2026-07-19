/**
 * Telegram helpers for Nejoic alerts (paper mode).
 */

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function allowedChatIds(): string[] {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isChatAllowed(chatId: string | number): boolean {
  const id = String(chatId);
  const list = allowedChatIds();
  if (list.length === 0) {
    // Local/dev: allow any chat so user can discover their chat id via /start
    return process.env.NODE_ENV !== 'production';
  }
  return list.includes(id);
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  if (!isChatAllowed(chatId)) return { ok: false, error: 'Chat not allowed' };

  // Telegram limit ~4096 chars
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 4000) {
    chunks.push(rest.slice(0, 4000));
    rest = rest.slice(4000);
  }
  chunks.push(rest);

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body.slice(0, 200) };
    }
  }
  return { ok: true };
}

export async function broadcastTelegram(text: string): Promise<{
  ok: boolean;
  sent: number;
  error?: string;
}> {
  const ids = allowedChatIds();
  if (!telegramConfigured()) return { ok: false, sent: 0, error: 'Bot token missing' };
  if (ids.length === 0) {
    return { ok: false, sent: 0, error: 'Set TELEGRAM_ALLOWED_CHAT_IDS' };
  }
  let sent = 0;
  let lastErr = '';
  for (const id of ids) {
    const r = await sendTelegramMessage(id, text);
    if (r.ok) sent += 1;
    else lastErr = r.error || 'send failed';
  }
  return { ok: sent > 0, sent, error: sent ? undefined : lastErr };
}

export function verifyWebhookSecret(reqSecret: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== 'production';
  return Boolean(reqSecret && reqSecret === expected);
}
