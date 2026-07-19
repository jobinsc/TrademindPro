import { NextRequest, NextResponse } from 'next/server';
import { handleNejoicAsk } from '@/lib/nejoic-ask';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  prompt?: string;
  tf?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
  }

  const result = await handleNejoicAsk(prompt, body.tf);
  return NextResponse.json(result);
}
