'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BROKER_OPTIONS,
  emptyConnection,
  emptySnapshot,
  type BrokerConnection,
  type BrokerId,
  type TerminalSnapshot,
} from '@/lib/broker';

const KEY = 'trademindpro_broker_v1';

type Store = {
  connection: BrokerConnection;
  snapshot: TerminalSnapshot;
};

function readStore(): Store {
  if (typeof window === 'undefined') {
    return { connection: emptyConnection(), snapshot: emptySnapshot() };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { connection: emptyConnection(), snapshot: emptySnapshot() };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      connection: { ...emptyConnection(), ...parsed.connection },
      snapshot: { ...emptySnapshot(), ...parsed.snapshot },
    };
  } catch {
    return { connection: emptyConnection(), snapshot: emptySnapshot() };
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function useBroker() {
  const [connection, setConnection] = useState<BrokerConnection>(emptyConnection());
  const [snapshot, setSnapshot] = useState<TerminalSnapshot>(emptySnapshot());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = readStore();
    setConnection(store.connection);
    setSnapshot(store.snapshot);
    setReady(true);
  }, []);

  const persist = useCallback((next: Store) => {
    setConnection(next.connection);
    setSnapshot(next.snapshot);
    writeStore(next);
  }, []);

  const selectBroker = useCallback(
    (brokerId: BrokerId) => {
      const current = readStore();
      const opt = BROKER_OPTIONS.find((b) => b.id === brokerId);
      persist({
        ...current,
        connection: {
          ...current.connection,
          brokerId,
          label: opt?.name || brokerId,
          connected: false,
          connectedAt: null,
        },
      });
    },
    [persist]
  );

  const saveCredentials = useCallback(
    (input: { apiKey: string; apiSecret: string; clientId: string }) => {
      const current = readStore();
      persist({
        ...current,
        connection: {
          ...current.connection,
          apiKey: input.apiKey.trim(),
          apiSecret: input.apiSecret.trim(),
          clientId: input.clientId.trim(),
        },
      });
    },
    [persist]
  );

  const connect = useCallback(() => {
    const current = readStore();
    const { apiKey, clientId } = current.connection;
    if (!apiKey.trim() || !clientId.trim()) {
      return { ok: false as const, error: 'Enter API Key and Client ID first' };
    }
    persist({
      ...current,
      connection: {
        ...current.connection,
        connected: true,
        connectedAt: new Date().toISOString(),
      },
      snapshot: emptySnapshot(),
    });
    return { ok: true as const };
  }, [persist]);

  const disconnect = useCallback(() => {
    const current = readStore();
    try {
      localStorage.removeItem('trademindpro_upstox_token_v1');
      localStorage.removeItem('trademindpro_upstox_connected_at_v1');
    } catch {
      /* ignore */
    }
    persist({
      ...current,
      connection: {
        ...current.connection,
        connected: false,
        connectedAt: null,
      },
      snapshot: emptySnapshot(),
    });
  }, [persist]);

  const markUpstoxConnected = useCallback(() => {
    const current = readStore();
    const at =
      localStorage.getItem('trademindpro_upstox_connected_at_v1') || new Date().toISOString();
    persist({
      ...current,
      connection: {
        ...current.connection,
        brokerId: 'upstox',
        label: 'Upstox',
        connected: true,
        connectedAt: at,
      },
    });
  }, [persist]);

  useEffect(() => {
    if (!ready) return;
    const token = localStorage.getItem('trademindpro_upstox_token_v1');
    if (token && !connection.connected) {
      markUpstoxConnected();
    }
  }, [ready, connection.connected, markUpstoxConnected]);

  return {
    ready,
    connection,
    snapshot,
    selectBroker,
    saveCredentials,
    connect,
    disconnect,
    markUpstoxConnected,
  };
}
