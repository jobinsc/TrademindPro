import { NextRequest, NextResponse } from 'next/server';
import { handleBlinkTune, type BlinkTuneInput } from '@/lib/blink-tune';
import type { BlinkSettings, BlinkSignal, BlinkTrade } from '@/lib/blink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  prompt?: string;
  settings?: Partial<BlinkSettings>;
  signal?: BlinkSignal | null;
  dayPnl?: number;
  trades?: BlinkTrade[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'Prompt required' }, { status: 400 });
  }

  const input: BlinkTuneInput = {
    prompt,
    settings: (body.settings || {}) as BlinkSettings,
    signal: body.signal ?? null,
    dayPnl: Number(body.dayPnl) || 0,
    trades: Array.isArray(body.trades) ? body.trades : [],
  };

  const result = await handleBlinkTune(input);
  const cloudAi = Boolean(process.env.OPENAI_API_KEY?.trim());

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    patch: result.patch ?? null,
    mode: result.mode,
    cloudAi,
  });
}

export async function GET() {
  const cloudAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({
    ok: true,
    cloudAi,
    model: cloudAi ? process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini' : null,
  });
}
