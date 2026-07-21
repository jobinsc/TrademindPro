import { defaultNejoicSettings } from '@/lib/nejoic';
import { looksLikePulseAsk } from '@/lib/nejoic-options';
import { buildLivePulse, parseTimeframe } from '@/lib/nejoic-pulse';

export type NejoicAskResult = {
  text: string;
  kind: string;
  decision?: string;
  spot?: number;
  ok?: boolean;
};

export async function handleNejoicAsk(
  prompt: string,
  tfRaw?: string
): Promise<NejoicAskResult> {
  const q = prompt.trim().toLowerCase();
  if (!q) {
    return { text: 'Ask Nejoic something, or send /pulse', kind: 'empty' };
  }

  const wantsPulse = looksLikePulseAsk(prompt);
  const tf = parseTimeframe(tfRaw || prompt);
  const settings = defaultNejoicSettings();

  if (q === '/start' || q === 'help' || q.includes('help')) {
    return {
      text: [
        'Nejoic — paper Nifty brain',
        '',
        'Try: pulse · 5 · 5m · 15m · 1H · 1D',
        'Or: should I buy CE?',
        '',
        'Start ON on the website = paper auto + alerts.',
      ].join('\n'),
      kind: 'help',
    };
  }

  if (wantsPulse) {
    const pulse = await buildLivePulse(tf, settings);
    return {
      text: pulse.text,
      kind: 'pulse',
      decision: pulse.decision,
      spot: pulse.spot,
      ok: pulse.ok,
    };
  }

  const pulse = await buildLivePulse(tf, settings);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
          temperature: 0.35,
          max_tokens: 500,
          messages: [
            {
              role: 'system',
              content: [
                'You are Nejoic, Jobin’s Nifty options paper-trading brain for TradePinax.',
                'Paper mode only — never claim live orders are placed.',
                'Use ONLY the Live Pulse facts below for levels/decision. Be short and clear.',
                'If unsure, say WAIT.',
                '',
                'LIVE PULSE FACTS:',
                `Spot ${pulse.spot}, decision ${pulse.decision}, reason: ${pulse.decisionReason}`,
                `Trend ${pulse.focus.trend}, pattern ${pulse.focus.pattern}, conf ${pulse.focus.confidence}`,
                `Support ${pulse.focus.support}, resistance ${pulse.focus.resistance}`,
              ].join('\n'),
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          return { text, kind: 'ai', decision: pulse.decision, spot: pulse.spot };
        }
      }
    } catch {
      /* fall through */
    }
  }

  return {
    text: [
      `Decision: ${pulse.decision}`,
      pulse.decisionReason,
      `Spot ₹${pulse.spot.toFixed(2)} · ${pulse.focus.tf}`,
      `Type 5 or 15m or pulse for the full report.`,
    ].join('\n'),
    kind: 'fallback',
    decision: pulse.decision,
    spot: pulse.spot,
  };
}
