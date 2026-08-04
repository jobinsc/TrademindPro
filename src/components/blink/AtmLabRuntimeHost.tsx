'use client';

import { useEffect, useRef } from 'react';
import { observationCutoffReached } from '@/lib/blink-atm-movement';
import {
  atmLabBgShouldRun,
  clearAtmLabRuntimeSession,
  readAtmLabRuntimeSession,
  setAtmLabArmed,
  type AtmLabRuntimeSession,
} from '@/lib/atm-lab-runtime';
import { getUpstoxAccessToken } from '@/lib/upstox-client';

type SampleRow = Record<string, unknown> & { at?: string };

/**
 * Keeps ATM Movement Lab sampling + disk save alive while you browse other pages.
 * Observation only — no orders. Strategy/brief UI still lives on the Blink page.
 */
export default function AtmLabRuntimeHost() {
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<SampleRow[]>([]);
  const savingRef = useRef(false);

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

    async function callApi(body: object) {
      const token = getUpstoxAccessToken();
      if (!token) throw new Error('no-token');
      const res = await fetch('/api/blink/atm-movement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        sample?: SampleRow;
        saved?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `atm-lab ${res.status}`);
      }
      return data;
    }

    async function flush(session: AtmLabRuntimeSession) {
      if (savingRef.current || !queueRef.current.length) return;
      const batch = queueRef.current.splice(0, 300);
      savingRef.current = true;
      try {
        await callApi({
          action: 'save',
          date: session.date,
          samples: batch,
        });
      } catch {
        queueRef.current.unshift(...batch);
      } finally {
        savingRef.current = false;
      }
    }

    async function run() {
      if (cancelled) return;
      if (!atmLabBgShouldRun()) {
        schedule(2500);
        return;
      }
      if (!getUpstoxAccessToken()) {
        schedule(10_000);
        return;
      }
      if (observationCutoffReached(new Date().toISOString())) {
        const session = readAtmLabRuntimeSession();
        if (session) await flush(session);
        setAtmLabArmed(false);
        clearAtmLabRuntimeSession();
        schedule(60_000);
        return;
      }

      const session = readAtmLabRuntimeSession();
      if (!session) {
        schedule(4000);
        return;
      }

      try {
        const data = await callApi({
          action: 'sample',
          keys: session.keys,
          runId: session.runId,
          strike: session.strike,
        });
        if (cancelled) return;
        if (data.sample) {
          queueRef.current.push(data.sample);
          if (queueRef.current.length >= 10) await flush(session);
        }
        schedule(1000);
      } catch {
        if (!cancelled) {
          const sessionNow = readAtmLabRuntimeSession();
          if (sessionNow && queueRef.current.length) await flush(sessionNow);
          schedule(3000);
        }
      }
    }

    schedule(2000);
    return () => {
      cancelled = true;
      clear();
      const session = readAtmLabRuntimeSession();
      if (session && queueRef.current.length) {
        void flush(session);
      }
    };
  }, []);

  return null;
}
