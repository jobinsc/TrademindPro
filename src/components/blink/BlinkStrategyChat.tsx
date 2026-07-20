'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { useBlink } from '@/hooks/useBlink';
import { BLINK_NAME, type BlinkSettings } from '@/lib/blink';

const CHIPS = [
  'Explain my scalp strategy',
  'Tighten stop loss',
  'Widen target',
  'Why am I losing today?',
  'Make entries faster',
];

function patchSummary(patch: Partial<BlinkSettings>): string {
  return Object.entries(patch)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

export function BlinkStrategyChat() {
  const { chat, ask, clearChat, applyChatPatch, asking } = useBlink();
  const [prompt, setPrompt] = useState('');
  const [cloudAi, setCloudAi] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/blink/tune')
      .then((r) => r.json())
      .then((d: { cloudAi?: boolean }) => setCloudAi(Boolean(d.cloudAi)))
      .catch(() => setCloudAi(false));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, asking]);

  const lastAssistant = [...chat].reverse().find((m) => m.role === 'assistant');
  const pendingPatch = lastAssistant?.patch;

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-sky-deep" />
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">
              Strategy coach
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-sky-ink/55">
            Tell {BLINK_NAME} how you want to scalp — it reads your settings &amp; trades and
            suggests fixes. Apply with one tap.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              cloudAi
                ? 'bg-violet-100 text-violet-800'
                : 'bg-sky-100 text-sky-ink/60'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            {cloudAi === null ? '…' : cloudAi ? 'Cloud AI' : 'Local coach'}
          </span>
          {chat.length > 0 ? (
            <button
              type="button"
              onClick={clearChat}
              className="text-[11px] font-semibold text-sky-ink/40 hover:text-sky-deep"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 space-y-2 overflow-y-auto rounded-xl bg-sky-soft/50 p-3"
        style={{ minHeight: 220, maxHeight: 320 }}
      >
        {chat.length === 0 ? (
          <p className="py-10 text-center text-sm text-sky-ink/45">
            Example: &ldquo;My scalps hit SL too often — tighten risk but keep target at 6
            pts&rdquo; or &ldquo;Explain when Blink buys CE vs PE&rdquo;
          </p>
        ) : (
          chat.map((m) => (
            <div
              key={m.id}
              className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'ml-8 bg-sky-deep text-white'
                  : 'mr-4 bg-white text-sky-ink/80 ring-1 ring-[#cfe0ee]'
              }`}
            >
              {m.text}
            </div>
          ))
        )}
        {asking ? (
          <p className="text-center text-[12px] font-medium text-sky-ink/45">Thinking…</p>
        ) : null}
      </div>

      {pendingPatch && Object.keys(pendingPatch).length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="flex-1 text-[12px] text-emerald-900">
            <strong>Suggested:</strong> {patchSummary(pendingPatch)}
          </p>
          <button
            type="button"
            onClick={() => applyChatPatch(pendingPatch)}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-800"
          >
            Apply to settings
          </button>
        </div>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!prompt.trim() || asking) return;
          void ask(prompt);
          setPrompt('');
        }}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Describe your strategy or ask ${BLINK_NAME}…`}
          disabled={asking}
          className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={asking || !prompt.trim()}
          className="inline-flex items-center gap-1 rounded-xl bg-sky-deep px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={asking}
            onClick={() => void ask(c)}
            className="rounded-full border border-[#cfe0ee] bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-ink/70 hover:border-sky-mid hover:text-sky-deep disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}
