'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AlertInput, PriceAlert } from '@/lib/alerts';

const KEY = 'trademindpro_alerts_v1';

function readAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PriceAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAlerts(alerts: PriceAlert[]) {
  localStorage.setItem(KEY, JSON.stringify(alerts));
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAlerts(readAlerts());
    setReady(true);
  }, []);

  const persist = useCallback((next: PriceAlert[]) => {
    setAlerts(next);
    writeAlerts(next);
  }, []);

  const addAlert = useCallback(
    (input: AlertInput) => {
      const alert: PriceAlert = {
        ...input,
        symbol: input.symbol.trim().toUpperCase(),
        status: input.status || 'active',
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        triggeredAt: null,
      };
      persist([alert, ...readAlerts()]);
      return alert;
    },
    [persist]
  );

  const updateStatus = useCallback(
    (id: string, status: PriceAlert['status']) => {
      const next = readAlerts().map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              triggeredAt:
                status === 'triggered' ? new Date().toISOString() : a.triggeredAt,
            }
          : a
      );
      persist(next);
    },
    [persist]
  );

  const deleteAlert = useCallback(
    (id: string) => {
      persist(readAlerts().filter((a) => a.id !== id));
    },
    [persist]
  );

  return { alerts, ready, addAlert, updateStatus, deleteAlert };
}
