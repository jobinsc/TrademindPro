'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  canOpenJimboTrade,
  closeJimboPaper,
  defaultJimboSettings,
  isNseMarketOpen,
  jimboReply,
  marketSessionLabel,
  openJimboPaper,
  realizedToday,
  scanJimboUniverse,
  type JimboChat,
  type JimboSettings,
  type JimboSignal,
  type JimboState,
  type JimboTrade,
} from '@/lib/jimbo';

const KEY = 'trademindpro_jimbo_v1';

function empty(): JimboState {
  return {
    settings: defaultJimboSettings(),
    signals: [],
    lastScanAt: null,
    trades: [],
    events: [],
    chat: [],
  };
}

function read(): JimboState {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<JimboState>;
    return {
      settings: { ...defaultJimboSettings(), ...p.settings },
      signals: Array.isArray(p.signals) ? p.signals : [],
      lastScanAt: p.lastScanAt ?? null,
      trades: Array.isArray(p.trades) ? p.trades : [],
      events: Array.isArray(p.events) ? p.events.slice(-80) : [],
      chat: Array.isArray(p.chat) ? p.chat.slice(-40) : [],
    };
  } catch {
    return empty();
  }
}

export function useJimbo() {
  const [settings, setSettings] = useState<JimboSettings>(defaultJimboSettings());
  const [signals, setSignals] = useState<JimboSignal[]>([]);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [trades, setTrades] = useState<JimboTrade[]>([]);
  const [events, setEvents] = useState<{ id: string; at: string; text: string }[]>([]);
  const [chat, setChat] = useState<JimboChat[]>([]);
  const [ready, setReady] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [sessionLabel, setSessionLabel] = useState('');
  const [scanning, setScanning] = useState(false);

  const persist = useCallback((next: JimboState) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setSettings(next.settings);
    setSignals(next.signals);
    setLastScanAt(next.lastScanAt);
    setTrades(next.trades);
    setEvents(next.events);
    setChat(next.chat);
  }, []);

  const snapshot = useCallback((): JimboState => {
    return { settings, signals, lastScanAt, trades, events, chat };
  }, [settings, signals, lastScanAt, trades, events, chat]);

  const pushEvent = useCallback((text: string, state: JimboState): JimboState => {
    return {
      ...state,
      events: [
        ...state.events,
        { id: crypto.randomUUID(), at: new Date().toISOString(), text },
      ].slice(-80),
    };
  }, []);

  useEffect(() => {
    const s = read();
    setSettings(s.settings);
    setSignals(s.signals);
    setLastScanAt(s.lastScanAt);
    setTrades(s.trades);
    setEvents(s.events);
    setChat(s.chat);
    setMarketOpen(isNseMarketOpen());
    setSessionLabel(marketSessionLabel());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      setMarketOpen(isNseMarketOpen());
      setSessionLabel(marketSessionLabel());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [ready]);

  const scan = useCallback(() => {
    setScanning(true);
    try {
      const state = snapshot();
      const result = scanJimboUniverse(state.settings);
      const actionable = result.signals.filter((s) => s.bias !== 'FLAT').length;
      let next: JimboState = {
        ...state,
        signals: result.signals,
        lastScanAt: new Date().toISOString(),
        settings: {
          ...state.settings,
          status: result.marketOpen
            ? state.settings.autoTrade
              ? 'armed'
              : 'scanning'
            : 'market_closed',
          updatedAt: new Date().toISOString(),
        },
      };
      next = pushEvent(
        `Scan ${result.scanned} liquid F&O · ${actionable} actionable · ${
          result.marketOpen ? 'market open' : 'market closed'
        }`,
        next
      );
      persist(next);
      setMarketOpen(result.marketOpen);
      return result;
    } finally {
      setScanning(false);
    }
  }, [snapshot, pushEvent, persist]);

  const setAutoTrade = useCallback(
    (on: boolean) => {
      const state = snapshot();
      const open = isNseMarketOpen();
      if (on && !open) {
        persist(
          pushEvent('Cannot arm auto — NSE is closed. Scan for study only.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'market_closed' },
          })
        );
        return;
      }
      const pnl = realizedToday(state.trades);
      if (on && pnl >= state.settings.dailyProfitTarget) {
        persist(
          pushEvent('Target already hit.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'target_hit' },
          })
        );
        return;
      }
      if (on && pnl <= -Math.abs(state.settings.dailyMaxLoss)) {
        persist(
          pushEvent('Max loss hit.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'stopped_loss' },
          })
        );
        return;
      }
      persist(
        pushEvent(on ? 'Jimbo ARMED (paper) for liquid stock options.' : 'Jimbo auto OFF.', {
          ...state,
          settings: {
            ...state.settings,
            autoTrade: on,
            mode: 'paper',
            status: on ? 'armed' : 'scanning',
            updatedAt: new Date().toISOString(),
          },
        })
      );
    },
    [snapshot, persist, pushEvent]
  );

  const takeSignal = useCallback(
    (signal?: JimboSignal) => {
      const state = snapshot();
      const open = isNseMarketOpen();
      const pick =
        signal ||
        state.signals.find(
          (s) =>
            s.bias !== 'FLAT' &&
            s.confidence >= (state.settings.minConfidence ?? 75)
        );
      if (!pick) {
        persist(pushEvent('No actionable Jimbo signal.', state));
        return null;
      }
      const gate = canOpenJimboTrade(state.settings, state.trades, open);
      if (!gate.ok) {
        persist(pushEvent(gate.reason, state));
        return null;
      }
      const trade = openJimboPaper(pick, state.settings);
      if (!trade) return null;
      persist(
        pushEvent(
          `Opened paper ${trade.symbol} ${trade.strike} ${trade.option} @ ₹${trade.entryPremium}`,
          {
            ...state,
            trades: [...state.trades, trade],
            settings: { ...state.settings, status: 'trading' },
          }
        )
      );
      return trade;
    },
    [snapshot, persist, pushEvent]
  );

  const closeOpen = useCallback(() => {
    const state = snapshot();
    const open = state.trades.find((t) => t.status === 'open');
    if (!open) return;
    const closed = closeJimboPaper(open);
    const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
    const pnl = realizedToday(trades);
    let status: JimboSettings['status'] = 'scanning';
    let autoTrade = state.settings.autoTrade;
    if (pnl >= state.settings.dailyProfitTarget) {
      status = 'target_hit';
      autoTrade = false;
    } else if (pnl <= -Math.abs(state.settings.dailyMaxLoss)) {
      status = 'stopped_loss';
      autoTrade = false;
    }
    persist(
      pushEvent(`Closed ${closed.symbol} ${closed.option} · P&L ₹${closed.pnl}`, {
        ...state,
        trades,
        settings: { ...state.settings, status, autoTrade },
      })
    );
  }, [snapshot, persist, pushEvent]);

  // Auto: rescan + take best when armed & market open
  useEffect(() => {
    if (!ready || !settings.autoTrade) return;
    const id = window.setInterval(() => {
      if (!isNseMarketOpen()) return;
      const state = read();
      if (!state.settings.autoTrade) return;
      if (state.trades.some((t) => t.status === 'open')) {
        const open = state.trades.find((t) => t.status === 'open');
        if (open && Date.now() - new Date(open.at).getTime() > 20_000) {
          const closed = closeJimboPaper(open);
          const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
          const next = {
            ...state,
            trades,
            events: [
              ...state.events,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: `Auto-closed ${closed.symbol} · ₹${closed.pnl}`,
              },
            ].slice(-80),
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setTrades(next.trades);
          setEvents(next.events);
        }
        return;
      }
      const result = scanJimboUniverse(state.settings);
      const minConf = state.settings.minConfidence ?? 75;
      const best = result.signals.find((s) => s.bias !== 'FLAT' && s.confidence >= minConf);
      setSignals(result.signals);
      setLastScanAt(new Date().toISOString());
      if (!best) return;
      const gate = canOpenJimboTrade(state.settings, state.trades, true);
      if (!gate.ok) return;
      const trade = openJimboPaper(best, state.settings);
      if (!trade) return;
      const next: JimboState = {
        ...state,
        signals: result.signals,
        lastScanAt: new Date().toISOString(),
        trades: [...state.trades, trade],
        settings: { ...state.settings, status: 'trading' },
        events: [
          ...state.events,
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            text: `Auto-opened ${trade.symbol} ${trade.option} ${trade.strike}`,
          },
        ].slice(-80),
      };
      localStorage.setItem(KEY, JSON.stringify(next));
      setTrades(next.trades);
      setSignals(next.signals);
      setSettings(next.settings);
      setEvents(next.events);
    }, 12_000);
    return () => window.clearInterval(id);
  }, [ready, settings.autoTrade]);

  const ask = useCallback(
    (prompt: string) => {
      const state = snapshot();
      const user: JimboChat = {
        id: crypto.randomUUID(),
        role: 'user',
        text: prompt.trim(),
        at: new Date().toISOString(),
      };
      const reply = jimboReply(prompt, {
        signals: state.signals,
        settings: state.settings,
        dayPnl: realizedToday(state.trades),
        marketOpen: isNseMarketOpen(),
      });
      const bot: JimboChat = {
        id: crypto.randomUUID(),
        role: 'jimbo',
        text: reply,
        at: new Date().toISOString(),
      };
      persist({ ...state, chat: [...state.chat, user, bot].slice(-40) });
    },
    [snapshot, persist]
  );

  const clearChat = useCallback(() => {
    persist({ ...snapshot(), chat: [] });
  }, [snapshot, persist]);

  const updateSettings = useCallback(
    (patch: Partial<JimboSettings>) => {
      const state = snapshot();
      const nextSettings: JimboSettings = {
        ...defaultJimboSettings(),
        ...state.settings,
        ...patch,
        status: patch.status ?? state.settings.status,
        autoTrade: patch.autoTrade ?? state.settings.autoTrade,
        updatedAt: new Date().toISOString(),
      };
      persist(
        pushEvent('Jimbo settings saved.', {
          ...state,
          settings: nextSettings,
        })
      );
    },
    [snapshot, persist, pushEvent]
  );

  return {
    ready,
    settings,
    signals,
    lastScanAt,
    trades,
    events,
    chat,
    marketOpen,
    sessionLabel,
    scanning,
    dayPnl: realizedToday(trades),
    scan,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
    updateSettings,
  };
}
