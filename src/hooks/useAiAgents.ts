'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AGENT_DEFS,
  defaultAgentState,
  type AgentId,
  type AgentStateMap,
  type ChatMessage,
} from '@/lib/ai-agents';
import { collectTradingContext } from '@/lib/ai-context';
import {
  runLiveAgents,
  type AgentInsight,
  type TradingContext,
} from '@/lib/ai-runtime';

const STATE_KEY = 'trademindpro_ai_agents_v1';
const CHAT_KEY = 'trademindpro_ai_chat_v1';
const ACTIVITY_KEY = 'trademindpro_ai_activity_v1';
const LAST_RUN_KEY = 'trademindpro_ai_last_run_v1';

function readState(): AgentStateMap {
  if (typeof window === 'undefined') return defaultAgentState();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultAgentState();
    return { ...defaultAgentState(), ...(JSON.parse(raw) as Partial<AgentStateMap>) };
  } catch {
    return defaultAgentState();
  }
}

function readChat(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readActivity(): AgentInsight[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentInsight[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useAiAgents() {
  const [enabled, setEnabled] = useState<AgentStateMap>(defaultAgentState());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<AgentInsight[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cloudAi, setCloudAi] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setEnabled(readState());
    setMessages(readChat());
    setActivity(readActivity());
    try {
      setLastRunAt(localStorage.getItem(LAST_RUN_KEY));
    } catch {
      setLastRunAt(null);
    }
    setReady(true);

    fetch('/api/ai/chat')
      .then((r) => r.json())
      .then((d: { cloudAi?: boolean }) => setCloudAi(Boolean(d.cloudAi)))
      .catch(() => setCloudAi(false));
  }, []);

  const toggle = useCallback((id: AgentId) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /** One-click enable or disable every hub agent */
  const setAll = useCallback((on: boolean) => {
    const next = AGENT_DEFS.reduce((acc, a) => {
      acc[a.id] = on;
      return acc;
    }, {} as AgentStateMap);
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    setEnabled(next);
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      text,
      at: new Date().toISOString(),
    };
    setMessages((prev) => {
      const next = [...prev, msg].slice(-40);
      localStorage.setItem(CHAT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.setItem(CHAT_KEY, JSON.stringify([]));
  }, []);

  const runAgents = useCallback(async () => {
    setRunning(true);
    try {
      const ctx = collectTradingContext();
      const result = runLiveAgents(enabled, ctx);
      const next = result.insights.slice(0, 40);
      setActivity(next);
      setLastRunAt(result.ranAt);
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
      localStorage.setItem(LAST_RUN_KEY, result.ranAt);
      return result;
    } finally {
      setRunning(false);
    }
  }, [enabled]);

  const askOrchestrator = useCallback(
    async (prompt: string) => {
      const ctx: TradingContext = collectTradingContext();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, enabled, context: ctx }),
      });
      if (!res.ok) {
        throw new Error('AI request failed');
      }
      const data = (await res.json()) as {
        reply: string;
        mode: string;
        note?: string;
      };
      return data;
    },
    [enabled]
  );

  return {
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
  };
}
