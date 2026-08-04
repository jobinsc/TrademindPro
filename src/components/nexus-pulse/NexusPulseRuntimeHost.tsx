'use client';

import { useEffect, useRef } from 'react';
import { NEXUS_PULSE_RULES } from '@/lib/nexus-pulse/rules';
import { fetchAppPost } from '@/lib/local-server';
import { nexusDeskBgShouldTick } from '@/lib/nexus-desk-runtime';
import { getUpstoxAccessToken } from '@/lib/upstox-client';

/**
 * Keeps Sector 7 A paper ticks alive while you browse other pages (same idea as NejoicRuntimeHost).
 * No strategy changes — only schedules /api/nexus-pulse/tick when armed and the desk page is closed.
 */
export default function NexusPulseRuntimeHost() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clear = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (ms: number) => {
      clear();
      timerRef.current = window.setTimeout(() => void run(), ms);
    };

    const run = async () => {
      if (cancelled) return;
      if (!nexusDeskBgShouldTick('a')) {
        schedule(2500);
        return;
      }
      const token = getUpstoxAccessToken();
      if (!token) {
        schedule(10_000);
        return;
      }
      try {
        const data = await fetchAppPost<{
          ok: boolean;
          session?: { openTrades?: unknown[] };
          error?: string;
        }>({
          path: '/api/nexus-pulse/tick',
          token,
          retries: 0,
        });
        if (cancelled) return;
        const inTrade = (data.session?.openTrades?.length ?? 0) > 0;
        schedule(inTrade ? NEXUS_PULSE_RULES.tickPollMsInTrade : NEXUS_PULSE_RULES.tickPollMsFlat);
      } catch {
        if (!cancelled) schedule(15_000);
      }
    };

    schedule(1500);
    return () => {
      cancelled = true;
      clear();
    };
  }, []);

  return null;
}
