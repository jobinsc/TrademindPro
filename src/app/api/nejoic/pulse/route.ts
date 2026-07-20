import { NextRequest, NextResponse } from 'next/server';
import { defaultNejoicSettings, type NejoicSettings } from '@/lib/nejoic';
import { buildLivePulse, parseTimeframe, type PulseInstrument } from '@/lib/nejoic-pulse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mergeSettings(partial?: Partial<NejoicSettings>): NejoicSettings {
  return { ...defaultNejoicSettings(), ...(partial || {}) };
}

export async function GET(req: NextRequest) {
  const defaults = defaultNejoicSettings();
  const tf = parseTimeframe(
    req.nextUrl.searchParams.get('tf') || defaults.telegramTimeframe || defaults.primaryTimeframe
  );
  const instrument = (req.nextUrl.searchParams.get('instrument') ||
    defaults.telegramInstrument ||
    'AUTO') as PulseInstrument;
  const pulse = await buildLivePulse(tf, defaults, { instrument });
  return NextResponse.json(pulse);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tf?: string;
    instrument?: PulseInstrument;
    settings?: Partial<NejoicSettings>;
    messageStyle?: 'full' | 'compact' | 'signal_only';
  };
  const settings = mergeSettings({
    ...body.settings,
    ...(body.messageStyle ? { messageStyle: body.messageStyle } as Partial<NejoicSettings> : {}),
  });
  // messageStyle is carried on settings bag for formatPulseText
  const withStyle = {
    ...settings,
    messageStyle: body.messageStyle || 'full',
  } as NejoicSettings & { messageStyle?: 'full' | 'compact' | 'signal_only' };
  const tf = parseTimeframe(
    body.tf || settings.telegramTimeframe || settings.primaryTimeframe || '15m'
  );
  const instrument = (body.instrument ||
    settings.telegramInstrument ||
    'AUTO') as PulseInstrument;
  const pulse = await buildLivePulse(tf, withStyle, { instrument });
  return NextResponse.json(pulse);
}
