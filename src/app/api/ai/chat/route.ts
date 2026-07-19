import { NextRequest, NextResponse } from 'next/server';
import {
  buildSystemPrompt,
  liveOrchestratorReply,
  type TradingContext,
} from '@/lib/ai-runtime';
import { defaultAgentState, type AgentStateMap } from '@/lib/ai-agents';
import { defaultRiskSettings } from '@/lib/risk';

export const runtime = 'nodejs';

type Body = {
  prompt?: string;
  enabled?: Partial<AgentStateMap>;
  context?: Partial<TradingContext>;
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

  const enabled: AgentStateMap = { ...defaultAgentState(), ...(body.enabled || {}) };
  const context: TradingContext = {
    trades: body.context?.trades ?? [],
    risk: { ...defaultRiskSettings(), ...(body.context?.risk || {}) },
    watchlistSymbols: body.context?.watchlistSymbols ?? [],
    alertCount: body.context?.alertCount ?? 0,
    holdingsCount: body.context?.holdingsCount ?? 0,
    strategyCount: body.context?.strategyCount ?? 0,
    paperCash: body.context?.paperCash ?? null,
  };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 450,
          messages: [
            { role: 'system', content: buildSystemPrompt(enabled, context) },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('OpenAI error', res.status, errText);
        const fallback = liveOrchestratorReply(prompt, enabled, context);
        return NextResponse.json({
          reply: fallback,
          mode: 'local-live',
          note: 'Cloud AI failed — used local live agents.',
        });
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply =
        data.choices?.[0]?.message?.content?.trim() ||
        liveOrchestratorReply(prompt, enabled, context);

      return NextResponse.json({ reply, mode: 'openai' });
    } catch (e) {
      console.error(e);
      return NextResponse.json({
        reply: liveOrchestratorReply(prompt, enabled, context),
        mode: 'local-live',
        note: 'Cloud AI unavailable — used local live agents.',
      });
    }
  }

  return NextResponse.json({
    reply: liveOrchestratorReply(prompt, enabled, context),
    mode: 'local-live',
  });
}

export async function GET() {
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({
    live: true,
    cloudAi: hasKey,
    model: hasKey ? process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini' : null,
  });
}
