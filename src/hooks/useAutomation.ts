'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultAutomation,
  normalizeAutomationStatus,
  type AutomationConfig,
  type AutomationEvent,
  type AutomationStatus,
} from '@/lib/automation';

const KEY = 'trademindpro_automation_v1';
const EVENTS_KEY = 'trademindpro_automation_events_v1';

function readConfig(): AutomationConfig {
  if (typeof window === 'undefined') return defaultAutomation();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAutomation();
    const parsed = { ...defaultAutomation(), ...(JSON.parse(raw) as Partial<AutomationConfig>) };
    return {
      ...parsed,
      status: normalizeAutomationStatus(String(parsed.status)),
    };
  } catch {
    return defaultAutomation();
  }
}

function writeConfig(config: AutomationConfig) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

function readEvents(): AutomationEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutomationEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: AutomationEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function useAutomation() {
  const [config, setConfig] = useState<AutomationConfig>(defaultAutomation());
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConfig(readConfig());
    setEvents(readEvents());
    setReady(true);
  }, []);

  const pushEvent = useCallback((text: string) => {
    const item: AutomationEvent = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      text,
    };
    const next = [item, ...readEvents()].slice(0, 50);
    writeEvents(next);
    setEvents(next);
  }, []);

  const save = useCallback(
    (next: AutomationConfig, note?: string) => {
      const withTime = { ...next, updatedAt: new Date().toISOString() };
      setConfig(withTime);
      writeConfig(withTime);
      if (note) pushEvent(note);
    },
    [pushEvent]
  );

  const setStatus = useCallback(
    (status: AutomationStatus, note: string) => {
      const current = readConfig();
      save({ ...current, status }, note);
    },
    [save]
  );

  const update = useCallback(
    (patch: Partial<AutomationConfig>, note?: string) => {
      const current = readConfig();
      save({ ...current, ...patch }, note);
    },
    [save]
  );

  return { ready, config, events, setStatus, update, pushEvent };
}
