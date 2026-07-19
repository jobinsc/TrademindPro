'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Circle,
  FlaskConical,
  GraduationCap,
  Newspaper,
  PieChart,
  Play,
  Radar,
  ScanSearch,
  Send,
  Shield,
  Sparkles,
  Workflow,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useAiAgents } from '@/hooks/useAiAgents';
import { useTrades } from '@/hooks/useTrades';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useAuth } from '@/components/auth/AuthProvider';
import { AGENT_DEFS, type AgentId } from '@/lib/ai-agents';
import { isOpenTrade, summarizeTrades } from '@/lib/trades';

const ICONS: Record<AgentId, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  scanner: Radar,
  journal: BookOpen,
  risk: Shield,
  strategy: Workflow,
  sentiment: Newspaper,
  portfolio: PieChart,
  pattern: ScanSearch,
  backtest: FlaskConical,
  alert: Bell,
  coach: GraduationCap,
};

const SEVERITY: Record<string, string> = {
  ok: 'text-emerald-600 bg-emerald-50',
  warn: 'text-amber-700 bg-amber-50',
  action: 'text-sky-deep bg-sky-soft',
  info: 'text-sky-ink/60 bg-sky-soft/60',
};

export default function AiHubWorkspace() {
  const {
    ready,
    enabled,
    messages,
    activity,
    lastRunAt,
    cloudAi,
    running,
    toggle,
    setAll,
    addMessage,
    clearChat,
    runAgents,
    askOrchestrator,
  } = useAiAgents();
  const { trades, ready: tradesReady } = useTrades();
  const { settings } = useRiskSettings();
  const { isAdmin } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeTrades(trades), [trades]);
  const openTrades = useMemo(() => trades.filter(isOpenTrade).length, [trades]);
  const activeCount = useMemo(
    () => Object.values(enabled).filter(Boolean).length,
    [enabled]
  );
  const totalAgents = AGENT_DEFS.length;
  const allOn = activeCount === totalAgents;
  const allOff = activeCount === 0;

  // Auto-run agents once when hub opens (live)
  useEffect(() => {
    if (!ready || !tradesReady) return;
    if (activity.length > 0) return;
    void runAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tradesReady]);

  async function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    addMessage('user', q);
    setPrompt('');
    setBusy(true);
    try {
      const data = await askOrchestrator(q);
      addMessage(
        'assistant',
        data.note ? `${data.reply}\n\n(${data.note})` : data.reply
      );
    } catch {
      addMessage(
        'assistant',
        'Could not reach the AI service. Check that the app is running, then try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRunAgents() {
    const result = await runAgents();
    if (result) {
      addMessage('assistant', result.briefing);
    }
  }

  if (!ready || !tradesReady) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Starting AI agents…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 5 · AI Agent System
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              AI Agents Hub
            </h1>
            <InfoBubble title="About AI Agents">
              Agents are live on your journal, risk, watchlist, and holdings.
              {isAdmin ? (
                <>
                  {' '}
                  Admin specialists:{' '}
                  <Link href="/app/nejoic" className="font-semibold text-sky-deep hover:underline">
                    Nejoic
                  </Link>{' '}
                  (Nifty PA) ·{' '}
                  <Link href="/app/jimbo" className="font-semibold text-sky-deep hover:underline">
                    Jimbo
                  </Link>{' '}
                  (stock options + CCI).
                </>
              ) : (
                <> Specialist agents Nejoic &amp; Jimbo are available to admins only.</>
              )}
            </InfoBubble>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
            <Circle className="h-2 w-2 fill-current text-emerald-500" />
            LIVE · {activeCount} agents
          </div>
          <p className="text-[11px] text-sky-ink/45">
            {cloudAi ? 'Cloud AI (OpenAI) connected' : 'Local live engine (add OPENAI_API_KEY for cloud)'}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#cfe0ee] bg-white px-5 py-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sky-deep" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-display text-sm font-semibold text-sky-ink">
                Master AI Orchestrator
              </p>
              <p className="mt-1 text-sm text-sky-ink/60">
                Journal {summary.total} trades · {openTrades} open · Win{' '}
                {summary.winRate.toFixed(0)}% · Emergency{' '}
                {settings.emergencyStop ? 'ON' : 'OFF'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onRunAgents()}
              disabled={running || activeCount === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-mid/40 bg-sky-soft px-3 py-2 text-sm font-semibold text-sky-deep hover:bg-sky-mist disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {running ? 'Running…' : 'Run Agents'}
            </button>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Find breakout ideas" or "Give me today’s plan"'
              className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Ask
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Today’s briefing', 'Check my risk', 'Scan for breakouts', 'Help my journal'].map(
              (chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void submit(chip)}
                  className="rounded-full bg-sky-soft px-3 py-1 text-[11px] font-semibold text-sky-deep hover:bg-sky-mist"
                >
                  {chip}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="lg:col-span-3 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-sky-ink">Agents</h2>
                <p className="mt-0.5 text-[12px] text-sky-ink/45">
                  {activeCount} of {totalAgents} enabled · toggle all or each one
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {lastRunAt && (
                  <p className="text-[11px] text-sky-ink/40">
                    Last run{' '}
                    {new Date(lastRunAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  disabled={allOn}
                  className="rounded-xl bg-sky-deep px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Enable all
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  disabled={allOff}
                  className="rounded-xl border border-[#cfe0ee] bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-ink hover:bg-sky-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Disable all
                </button>
                <button
                  type="button"
                  onClick={() => setAll(!allOn)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    allOn ? 'bg-sky-deep' : allOff ? 'bg-[#cfe0ee]' : 'bg-sky-mid'
                  }`}
                  aria-label={allOn ? 'Disable all agents' : 'Enable all agents'}
                  title={allOn ? 'Turn all off' : 'Turn all on'}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      allOn ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {AGENT_DEFS.map((agent) => {
                const Icon = ICONS[agent.id];
                const on = enabled[agent.id];
                return (
                  <div
                    key={agent.id}
                    className={`rounded-2xl border p-4 transition ${
                      on
                        ? 'border-sky-mid/30 bg-white'
                        : 'border-[#cfe0ee]/90 bg-sky-soft/40 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-sky-soft text-sky-deep">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                          {on && (
                            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>
                        <h3 className="font-display text-[14px] font-semibold text-sky-ink">
                          {agent.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(agent.id)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                          on ? 'bg-sky-deep' : 'bg-[#cfe0ee]'
                        }`}
                        aria-label={`Toggle ${agent.name}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            on ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-sky-ink/55">{agent.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">
                Live activity
              </h2>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-sky-ink/45">
                  Click Run Agents to generate live insights.
                </p>
              ) : (
                activity.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#e8f0f6] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY[item.severity] || SEVERITY.info}`}
                      >
                        {item.severity}
                      </span>
                      <p className="text-[12px] font-semibold text-sky-ink">{item.agentName}</p>
                    </div>
                    <p className="mt-1 text-sm font-medium text-sky-ink">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-sky-ink/55">
                      {item.detail}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Coach chat</h2>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="text-[11px] font-semibold text-sky-ink/45 hover:text-sky-deep"
              >
                Clear
              </button>
            )}
          </div>

          <div
            className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-xl bg-sky-soft/50 p-3"
            style={{ minHeight: 320, maxHeight: 520 }}
          >
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-sky-ink/50">
                Ask the orchestrator — live agent replies appear here.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'ml-6 bg-sky-deep text-white'
                      : 'mr-6 bg-white text-sky-ink/80 ring-1 ring-[#cfe0ee]'
                  }`}
                >
                  {m.text}
                </div>
              ))
            )}
            {busy && (
              <p className="text-center text-[12px] text-sky-ink/40">Agents thinking…</p>
            )}
          </div>

          <p className="mt-3 text-[11px] text-sky-ink/45">
            Tips use your live journal + risk.{' '}
            <Link href="/app/reviews" className="font-semibold text-sky-deep hover:underline">
              Reviews
            </Link>
            {' · '}
            <Link href="/app/settings" className="font-semibold text-sky-deep hover:underline">
              AI settings
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
