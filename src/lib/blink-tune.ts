import {
  blinkReply,
  BLINK_NAME,
  summarizeBlink,
  type BlinkSettings,
  type BlinkSignal,
  type BlinkTrade,
} from '@/lib/blink';
import { isBlinkStrategyMode } from '@/lib/blink-strategies';

export type BlinkTuneInput = {
  prompt: string;
  settings: BlinkSettings;
  signal: BlinkSignal | null;
  dayPnl: number;
  trades: BlinkTrade[];
};

export type BlinkTuneResult = {
  reply: string;
  patch?: Partial<BlinkSettings>;
  mode: 'openai' | 'local';
};

const TUNABLE_KEYS = new Set<keyof BlinkSettings>([
  'dailyProfitTarget',
  'dailyMaxLoss',
  'maxLotsPerTrade',
  'minConfidence',
  'strategyMode',
  'emaFast',
  'emaSlow',
  'rsiPeriod',
  'cciPeriod',
  'cciOversold',
  'cciOverbought',
  'paLeftBars',
  'paRightBars',
  'targetPoints',
  'stopLossPoints',
  'trailingStopPoints',
  'trailingActivatePoints',
  'maxHoldSeconds',
  'maxTradesPerDay',
  'brokeragePerLot',
  'tradeOnlyMarketHours',
  'strikeMoneyness',
  'tradeWindowStart',
  'tradeWindowEnd',
  'chartTimeframe',
]);

export function clampBlinkPatch(patch: Partial<BlinkSettings>): Partial<BlinkSettings> {
  const out: Partial<BlinkSettings> = {};
  if (patch.dailyProfitTarget != null) {
    out.dailyProfitTarget = Math.max(100, Number(patch.dailyProfitTarget) || 1500);
  }
  if (patch.dailyMaxLoss != null) {
    out.dailyMaxLoss = Math.max(100, Number(patch.dailyMaxLoss) || 1000);
  }
  if (patch.maxLotsPerTrade != null) {
    out.maxLotsPerTrade = Math.max(1, Math.min(3, Number(patch.maxLotsPerTrade) || 1));
  }
  if (patch.minConfidence != null) {
    out.minConfidence = Math.max(50, Math.min(95, Number(patch.minConfidence) || 68));
  }
  if (patch.strategyMode != null) {
    if (isBlinkStrategyMode(String(patch.strategyMode))) {
      out.strategyMode = patch.strategyMode;
    }
  }
  if (patch.cciPeriod != null) {
    out.cciPeriod = Math.max(5, Math.min(50, Number(patch.cciPeriod) || 20));
  }
  if (patch.cciOversold != null) {
    out.cciOversold = Math.min(0, Number(patch.cciOversold) || -100);
  }
  if (patch.cciOverbought != null) {
    out.cciOverbought = Math.max(0, Number(patch.cciOverbought) || 100);
  }
  if (patch.paLeftBars != null) {
    out.paLeftBars = Math.max(1, Math.min(15, Number(patch.paLeftBars) || 5));
  }
  if (patch.paRightBars != null) {
    out.paRightBars = Math.max(1, Math.min(15, Number(patch.paRightBars) || 5));
  }
  if (patch.emaFast != null) out.emaFast = Math.max(3, Number(patch.emaFast) || 9);
  if (patch.emaSlow != null) out.emaSlow = Math.max(5, Number(patch.emaSlow) || 21);
  if (patch.rsiPeriod != null) out.rsiPeriod = Math.max(3, Number(patch.rsiPeriod) || 7);
  if (patch.rsiCeMin != null) out.rsiCeMin = Math.max(0, Math.min(100, Number(patch.rsiCeMin) || 45));
  if (patch.rsiCeMax != null) out.rsiCeMax = Math.max(0, Math.min(100, Number(patch.rsiCeMax) || 75));
  if (patch.rsiPeMin != null) out.rsiPeMin = Math.max(0, Math.min(100, Number(patch.rsiPeMin) || 25));
  if (patch.rsiPeMax != null) out.rsiPeMax = Math.max(0, Math.min(100, Number(patch.rsiPeMax) || 55));
  if (patch.targetPoints != null) out.targetPoints = Math.max(1, Number(patch.targetPoints) || 5);
  if (patch.stopLossPoints != null) {
    out.stopLossPoints = Math.max(1, Number(patch.stopLossPoints) || 8);
  }
  if (patch.trailingStopPoints != null) {
    out.trailingStopPoints = Math.max(0, Number(patch.trailingStopPoints) || 0);
  }
  if (patch.trailingActivatePoints != null) {
    out.trailingActivatePoints = Math.max(0, Number(patch.trailingActivatePoints) || 4);
  }
  if (patch.maxHoldSeconds != null) {
    out.maxHoldSeconds = Math.max(30, Number(patch.maxHoldSeconds) || 180);
  }
  if (patch.maxTradesPerDay != null) {
    out.maxTradesPerDay = Math.max(1, Number(patch.maxTradesPerDay) || 25);
  }
  if (patch.brokeragePerLot != null) {
    out.brokeragePerLot = Math.max(0, Number(patch.brokeragePerLot) || 175);
  }
  if (patch.tradeOnlyMarketHours != null) {
    out.tradeOnlyMarketHours = Boolean(patch.tradeOnlyMarketHours);
  }
  if (patch.strikeMoneyness != null) {
    const m = ['atm', 'itm', 'otm'] as const;
    if (m.includes(patch.strikeMoneyness as (typeof m)[number])) {
      out.strikeMoneyness = patch.strikeMoneyness;
    }
  }
  if (patch.tradeWindowStart != null) {
    out.tradeWindowStart = String(patch.tradeWindowStart).slice(0, 5);
  }
  if (patch.tradeWindowEnd != null) {
    out.tradeWindowEnd = String(patch.tradeWindowEnd).slice(0, 5);
  }
  if (patch.chartTimeframe != null) {
    const allowed = ['1m', '2m', '3m', '5m', '10m', '15m', '30m'];
    const tf = String(patch.chartTimeframe);
    if (allowed.includes(tf)) out.chartTimeframe = tf;
  }
  return out;
}

export function pickBlinkPatch(raw: unknown): Partial<BlinkSettings> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const patch: Partial<BlinkSettings> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (TUNABLE_KEYS.has(k as keyof BlinkSettings)) {
      (patch as Record<string, unknown>)[k] = v;
    }
  }
  const clamped = clampBlinkPatch(patch);
  return Object.keys(clamped).length ? clamped : undefined;
}

export function buildBlinkTuneSystemPrompt(input: BlinkTuneInput): string {
  const stats = summarizeBlink(input.trades);
  const sig = input.signal;
  const s = input.settings;

  return [
    `You are ${BLINK_NAME}, a Nifty options scalping coach inside TradeMind Pro.`,
    'Paper mode only — never claim live orders were placed.',
    'Help Jobin describe, debug, and tune the scalp strategy in plain English.',
    'When the user wants setting changes, include a JSON patch with only changed fields.',
    'When explaining, be concise (3–6 short sentences). Use ₹ for rupees.',
    '',
    'Return ONLY valid JSON:',
    '{"reply":"your message to the user","patch":{...} or null}',
    '',
    'Tunable fields (premium points unless noted):',
    'targetPoints, stopLossPoints, trailingStopPoints, trailingActivatePoints, maxHoldSeconds,',
    'emaFast, emaSlow, rsiPeriod, minConfidence (%), maxTradesPerDay, dailyProfitTarget (₹), dailyMaxLoss (₹).',
    '',
    'CURRENT SETTINGS:',
    JSON.stringify(
      {
        targetPoints: s.targetPoints,
        stopLossPoints: s.stopLossPoints,
        trailingStopPoints: s.trailingStopPoints,
        trailingActivatePoints: s.trailingActivatePoints,
        maxHoldSeconds: s.maxHoldSeconds,
        emaFast: s.emaFast,
        emaSlow: s.emaSlow,
        rsiPeriod: s.rsiPeriod,
        minConfidence: s.minConfidence,
        maxTradesPerDay: s.maxTradesPerDay,
        dailyProfitTarget: s.dailyProfitTarget,
        dailyMaxLoss: s.dailyMaxLoss,
      },
      null,
      0
    ),
    '',
    'LIVE CONTEXT:',
    sig
      ? `Signal ${sig.bias} strike ${sig.strike} conf ${sig.confidence}% · ${sig.setup} · ${sig.reason}`
      : 'No active signal — run scan first.',
    `Today P&L ₹${input.dayPnl.toFixed(0)} · closed ${stats.closed} trades · win rate ${stats.winRate.toFixed(0)}% · net ₹${stats.netPnl.toFixed(0)}.`,
  ].join('\n');
}

export function parseBlinkTuneResponse(raw: string): BlinkTuneResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { reply?: string; patch?: unknown };
    if (!parsed.reply?.trim()) return null;
    return {
      reply: parsed.reply.trim(),
      patch: pickBlinkPatch(parsed.patch),
      mode: 'openai',
    };
  } catch {
    return null;
  }
}

export function localBlinkTune(input: BlinkTuneInput): BlinkTuneResult {
  const q = input.prompt.trim().toLowerCase();
  const s = input.settings;
  const stats = summarizeBlink(input.trades);
  let patch: Partial<BlinkSettings> | undefined;

  if (
    q.includes('tight') &&
    (q.includes('stop') || q.includes('sl') || q.includes('loss'))
  ) {
    patch = clampBlinkPatch({ stopLossPoints: Math.max(1, s.stopLossPoints - 2) });
  } else if (q.includes('wider') && (q.includes('target') || q.includes('tgt'))) {
    patch = clampBlinkPatch({ targetPoints: s.targetPoints + 2 });
  } else if (q.includes('faster') || q.includes('quick') || q.includes('scalp')) {
    patch = clampBlinkPatch({
      maxHoldSeconds: Math.max(30, s.maxHoldSeconds - 30),
      emaFast: Math.max(3, s.emaFast - 1),
    });
  } else if (q.includes('slow') || q.includes('patient')) {
    patch = clampBlinkPatch({
      maxHoldSeconds: s.maxHoldSeconds + 60,
      minConfidence: Math.min(95, s.minConfidence + 3),
    });
  } else if (q.match(/sl\s*(=|to|at)?\s*(\d+)/)) {
    const m = q.match(/sl\s*(?:=|to|at)?\s*(\d+)/);
    if (m) patch = clampBlinkPatch({ stopLossPoints: Number(m[1]) });
  } else if (q.match(/target\s*(=|to|at)?\s*(\d+)/)) {
    const m = q.match(/target\s*(?:=|to|at)?\s*(\d+)/);
    if (m) patch = clampBlinkPatch({ targetPoints: Number(m[1]) });
  }

  let reply = blinkReply(input.prompt, {
    signal: input.signal,
    settings: s,
    dayPnl: input.dayPnl,
  });

  if (stats.closed >= 3 && stats.winRate < 45) {
    reply += `\n\nWin rate is low (${stats.winRate.toFixed(0)}%). Try tighter SL or higher min confidence.`;
  }

  if (patch) {
    const lines = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    reply += `\n\nSuggested tweak: ${lines}. Tap **Apply** to save.`;
  }

  return { reply, patch, mode: 'local' };
}

export async function handleBlinkTune(input: BlinkTuneInput): Promise<BlinkTuneResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return localBlinkTune(input);

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
        max_tokens: 550,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildBlinkTuneSystemPrompt(input) },
          { role: 'user', content: input.prompt.trim() },
        ],
      }),
    });

    if (!res.ok) return localBlinkTune(input);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return localBlinkTune(input);

    const parsed = parseBlinkTuneResponse(content);
    if (parsed) return parsed;

    return { reply: content, mode: 'openai' };
  } catch {
    return localBlinkTune(input);
  }
}
