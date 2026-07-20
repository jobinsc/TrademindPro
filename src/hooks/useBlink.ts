'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeBlinkScalp,
  BLINK_NAME,
  buildBlinkCandles,
  canOpenBlinkTrade,
  closeBlinkPaper,
  defaultBlinkSettings,
  evaluatePaperPremiumExit,
  exitPointsFromSettings,
  openBlinkPaper,
  realizedToday,
  type BlinkSettings,
  type BlinkSignal,
  type BlinkState,
  type BlinkTrade,
  type BlinkChat,
} from '@/lib/blink';
import type { Candle } from '@/lib/nejoic';
import { isIndiaCashSession } from '@/lib/market-desk';
import { paperExitLabel } from '@/lib/paper-exit';
import { getUpstoxAccessToken, isUpstoxConnected } from '@/lib/upstox-client';

import { BLINK_STORAGE_KEY, BLINK_SYNC_EVENT } from '@/lib/blink';

const KEY = BLINK_STORAGE_KEY;
const AUTO_TICK_MS = 3_000;

type LiveOptQuote = {
  ok: boolean;
  ltp: number;
  instrumentKey?: string;
  strike?: number;
  expiry?: string;
  error?: string;
};

async function fetchLiveNiftySpot(): Promise<{ ok: boolean; spot: number }> {
  const token = getUpstoxAccessToken();
  try {
    const res = await fetch('/api/market/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ symbols: [{ symbol: 'NIFTY', exchange: 'NSE' }] }),
      cache: 'no-store',
    });
    const data = (await res.json()) as {
      quotes?: { symbol: string; lastPrice: number; ok: boolean }[];
    };
    const q = data.quotes?.find((x) => x.symbol === 'NIFTY' && x.ok);
    if (q?.lastPrice) return { ok: true, spot: q.lastPrice };
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch('/api/market/candles?symbol=NIFTY&interval=1m&limit=5', {
      cache: 'no-store',
    });
    const data = (await res.json()) as { ok?: boolean; spot?: number };
    if (data.ok && data.spot) return { ok: true, spot: data.spot };
  } catch {
    /* ignore */
  }
  return { ok: false, spot: 0 };
}

async function fetchBlinkCandles(
  interval: string
): Promise<{ ok: boolean; candles: Candle[]; spot: number }> {
  try {
    const res = await fetch(
      `/api/market/candles?symbol=NIFTY&interval=${encodeURIComponent(interval)}&limit=120`,
      { cache: 'no-store' }
    );
    const data = (await res.json()) as {
      ok?: boolean;
      candles?: Candle[];
      spot?: number;
      error?: string;
    };
    if (data.ok && Array.isArray(data.candles) && data.candles.length >= 25) {
      return { ok: true, candles: data.candles, spot: data.spot ?? data.candles.at(-1)!.close };
    }
  } catch {
    /* ignore */
  }
  return { ok: false, candles: [], spot: 0 };
}

async function fetchLiveOptionPremium(input: {
  spot: number;
  option: 'CE' | 'PE';
  strike?: number;
  instrumentKey?: string | null;
}): Promise<LiveOptQuote> {
  const token = getUpstoxAccessToken();
  if (!token) {
    return { ok: false, ltp: 0, error: 'Upstox not connected' };
  }
  try {
    const res = await fetch('/api/market/option-ltp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        spot: input.spot,
        option: input.option,
        strike: input.strike,
        instrumentKey: input.instrumentKey || undefined,
        expiry: 'current_week',
      }),
      cache: 'no-store',
    });
    const data = (await res.json()) as LiveOptQuote & { ok?: boolean };
    if (!res.ok || !data.ok || !(data.ltp > 0)) {
      return { ok: false, ltp: 0, error: data.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      ltp: data.ltp,
      instrumentKey: data.instrumentKey,
      strike: data.strike,
      expiry: data.expiry,
    };
  } catch (e) {
    return {
      ok: false,
      ltp: 0,
      error: e instanceof Error ? e.message : 'LTP fetch failed',
    };
  }
}

function empty(): BlinkState {
  return {
    settings: defaultBlinkSettings(),
    signal: null,
    spot: 24850,
    candles: [],
    trades: [],
    events: [],
    chat: [],
  };
}

function read(): BlinkState {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<BlinkState>;
    return {
      settings: { ...defaultBlinkSettings(), ...p.settings },
      signal: p.signal ?? null,
      spot: p.spot ?? 24850,
      candles: Array.isArray(p.candles) ? p.candles : [],
      trades: Array.isArray(p.trades) ? p.trades : [],
      events: Array.isArray(p.events) ? p.events.slice(-80) : [],
      chat: Array.isArray(p.chat) ? p.chat.slice(-40) : [],
    };
  } catch {
    return empty();
  }
}

function applyDayLimits(
  settings: BlinkSettings,
  trades: BlinkTrade[]
): Pick<BlinkSettings, 'status' | 'autoTrade'> {
  const day = realizedToday(trades);
  let status: BlinkSettings['status'] = settings.autoTrade ? 'watching' : 'idle';
  let autoTrade = settings.autoTrade;
  if (day >= settings.dailyProfitTarget) {
    status = 'target_hit';
    autoTrade = false;
  } else if (day <= -Math.abs(settings.dailyMaxLoss)) {
    status = 'stopped_loss';
    autoTrade = false;
  }
  return { status, autoTrade };
}

export function useBlink() {
  const [settings, setSettings] = useState<BlinkSettings>(defaultBlinkSettings());
  const [signal, setSignal] = useState<BlinkSignal | null>(null);
  const [spot, setSpot] = useState(24850);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<BlinkTrade[]>([]);
  const [events, setEvents] = useState<{ id: string; at: string; text: string }[]>([]);
  const [chat, setChat] = useState<BlinkChat[]>([]);
  const [asking, setAsking] = useState(false);
  const [ready, setReady] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [upstoxConnected, setUpstoxConnected] = useState(false);
  const [openLiveLtp, setOpenLiveLtp] = useState<number | null>(null);
  const [lastQuoteAt, setLastQuoteAt] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const autoRef = useRef(false);

  const applyState = useCallback((next: BlinkState) => {
    setSettings(next.settings);
    setSignal(next.signal);
    setSpot(next.spot);
    setCandles(next.candles);
    setTrades(next.trades);
    setEvents(next.events);
    setChat(next.chat);
  }, []);

  const persist = useCallback(
    (next: BlinkState) => {
      localStorage.setItem(KEY, JSON.stringify(next));
      applyState(next);
      window.dispatchEvent(new Event(BLINK_SYNC_EVENT));
    },
    [applyState]
  );

  const snapshot = useCallback(
    (): BlinkState => ({ settings, signal, spot, candles, trades, events, chat }),
    [settings, signal, spot, candles, trades, events, chat]
  );

  const pushEvent = useCallback((text: string, state: BlinkState): BlinkState => {
    return {
      ...state,
      events: [
        ...state.events,
        { id: crypto.randomUUID(), at: new Date().toISOString(), text },
      ].slice(-80),
    };
  }, []);

  const refreshLiveSignal = useCallback(async (state: BlinkState) => {
    const candleRes = await fetchBlinkCandles(state.settings.chartTimeframe || '1m');
    let nextCandles = candleRes.candles;
    let liveSpot = candleRes.spot;

    if (!candleRes.ok) {
      const spotRes = await fetchLiveNiftySpot();
      if (spotRes.ok) liveSpot = spotRes.spot;
      nextCandles =
        state.candles.length >= 25
          ? state.candles
          : buildBlinkCandles(60, liveSpot || state.spot);
    }

    let sig = analyzeBlinkScalp(nextCandles, state.settings, liveSpot || undefined);

    if (sig.bias !== 'FLAT' && isUpstoxConnected()) {
      const live = await fetchLiveOptionPremium({
        spot: sig.niftySpot,
        option: sig.bias,
        strike: sig.strike,
      });
      if (live.ok) {
        sig = {
          ...sig,
          strike: live.strike || sig.strike,
          premium: live.ltp,
        };
      }
    }

    return {
      candles: nextCandles,
      signal: sig,
      spot: sig.niftySpot,
    };
  }, []);

  useEffect(() => {
    const s = read();
    setSettings(s.settings);
    setSignal(s.signal);
    setSpot(s.spot);
    setCandles(s.candles);
    setTrades(s.trades);
    setEvents(s.events);
    setChat(s.chat);
    setMarketOpen(isIndiaCashSession());
    setUpstoxConnected(isUpstoxConnected());
    setReady(true);
  }, []);

  // If Blink runs in a different tab/window, keep this page in sync.
  // (storage event fires only in other documents, not the one doing the write.)
  useEffect(() => {
    const sync = () => {
      const next = read();
      applyState(next);
      setMarketOpen(isIndiaCashSession());
      setUpstoxConnected(isUpstoxConnected());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(BLINK_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(BLINK_SYNC_EVENT, sync);
    };
  }, [applyState]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      setMarketOpen(isIndiaCashSession());
      setUpstoxConnected(isUpstoxConnected());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [ready]);

  const updateSettings = useCallback(
    (patch: Partial<BlinkSettings>) => {
      const state = snapshot();
      persist({
        ...state,
        settings: {
          ...state.settings,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [snapshot, persist]
  );

  const analyse = useCallback(async () => {
    setScanning(true);
    try {
      const state = snapshot();
      if (!isUpstoxConnected()) {
        persist(pushEvent('Connect Upstox in Terminal for live Nifty option LTP.', state));
        return null;
      }
      const live = await refreshLiveSignal(state);
      persist(
        pushEvent(
          live.signal.bias === 'FLAT'
            ? `Scan: ${live.signal.reason}`
            : `Signal ${live.signal.bias} ${live.signal.strike} @ ₹${live.signal.premium} (Upstox) · ${live.signal.setup}`,
          { ...state, ...live }
        )
      );
      setLastQuoteAt(new Date().toISOString());
      return live.signal;
    } finally {
      setScanning(false);
    }
  }, [snapshot, persist, pushEvent, refreshLiveSignal]);

  const setAutoTrade = useCallback(
    (on: boolean) => {
      const state = snapshot();
      if (on && !isUpstoxConnected()) {
        persist(pushEvent('Cannot start auto — connect Upstox in Terminal first.', state));
        return;
      }
      persist(
        pushEvent(on ? `${BLINK_NAME} auto ON · live LTP.` : `${BLINK_NAME} auto OFF.`, {
          ...state,
          settings: {
            ...state.settings,
            autoTrade: on,
            status: on ? 'watching' : 'idle',
            updatedAt: new Date().toISOString(),
          },
        })
      );
    },
    [snapshot, persist, pushEvent]
  );

  const takeSignal = useCallback(async () => {
    const state = snapshot();
    if (!isUpstoxConnected()) {
      persist(pushEvent('Connect Upstox in Terminal for live entry LTP.', state));
      return null;
    }
    const live = await refreshLiveSignal(state);
    const sig = live.signal;
    const gate = canOpenBlinkTrade(state.settings, state.trades);
    if (!gate.ok) {
      persist(pushEvent(gate.reason, { ...state, ...live }));
      return null;
    }
    if (sig.bias === 'FLAT' || sig.confidence < state.settings.minConfidence) {
      persist(pushEvent(sig.reason || 'No scalp edge.', { ...state, ...live }));
      return null;
    }
    const quote = await fetchLiveOptionPremium({
      spot: sig.niftySpot,
      option: sig.bias,
      strike: sig.strike,
    });
    if (!quote.ok || !(quote.ltp > 0)) {
      persist(
        pushEvent(quote.error || 'Live option LTP unavailable.', { ...state, ...live })
      );
      return null;
    }
    const enriched = { ...sig, strike: quote.strike || sig.strike, premium: quote.ltp };
    const trade = openBlinkPaper(enriched, state.settings, {
      premium: quote.ltp,
      instrumentKey: quote.instrumentKey || null,
      premiumSource: 'upstox',
      expiry: quote.expiry || null,
    });
    if (!trade) return null;
    setOpenLiveLtp(quote.ltp);
    setLastQuoteAt(new Date().toISOString());
    persist(
      pushEvent(
        `Opened scalp ${trade.option} ${trade.strike} @ ₹${trade.entryPremium} (Upstox LTP)`,
        {
          ...state,
          ...live,
          signal: enriched,
          trades: [...state.trades, trade],
          settings: { ...state.settings, status: 'trading' },
        }
      )
    );
    return trade;
  }, [snapshot, persist, pushEvent, refreshLiveSignal]);

  const closeOpen = useCallback(async () => {
    const state = snapshot();
    const open = state.trades.find((t) => t.status === 'open');
    if (!open) return;
    const live = await fetchLiveOptionPremium({
      spot: state.spot || open.strike,
      option: open.option,
      strike: open.strike,
      instrumentKey: open.instrumentKey,
    });
    if (!live.ok || !(live.ltp > 0)) {
      persist(pushEvent(live.error || 'Cannot close — live LTP unavailable.', state));
      return;
    }
    const closed = closeBlinkPaper(open, state.settings, live.ltp);
    const nextTrades = state.trades.map((t) => (t.id === open.id ? closed : t));
    const limits = applyDayLimits(state.settings, nextTrades);
    setOpenLiveLtp(null);
    persist(
      pushEvent(`Closed ${closed.option} @ ₹${closed.exitPremium} (Upstox) · P&L ₹${closed.pnl}`, {
        ...state,
        trades: nextTrades,
        settings: { ...state.settings, ...limits },
      })
    );
  }, [snapshot, persist, pushEvent]);

  const ask = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const state = snapshot();
      const user: BlinkChat = {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
        at: new Date().toISOString(),
      };
      const withUser = { ...state, chat: [...state.chat, user].slice(-40) };
      persist(withUser);
      setAsking(true);
      try {
        const res = await fetch('/api/blink/tune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            settings: state.settings,
            signal: state.signal,
            dayPnl: realizedToday(state.trades),
            trades: state.trades,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          patch?: Partial<BlinkSettings> | null;
        };
        const bot: BlinkChat = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: data.reply || 'Could not get a reply. Try again.',
          at: new Date().toISOString(),
          patch: data.patch || undefined,
        };
        const latest = read();
        persist({ ...latest, chat: [...latest.chat, bot].slice(-40) });
      } catch {
        const bot: BlinkChat = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Network error — check your connection and try again.',
          at: new Date().toISOString(),
        };
        const latest = read();
        persist({ ...latest, chat: [...latest.chat, bot].slice(-40) });
      } finally {
        setAsking(false);
      }
    },
    [snapshot, persist]
  );

  const clearChat = useCallback(() => {
    const state = snapshot();
    persist({ ...state, chat: [] });
  }, [snapshot, persist]);

  const applyChatPatch = useCallback(
    (patch: Partial<BlinkSettings>) => {
      updateSettings(patch);
      const state = snapshot();
      persist(
        pushEvent(
          `Applied coach settings: ${Object.keys(patch).join(', ')}`,
          state
        )
      );
    },
    [snapshot, persist, pushEvent, updateSettings]
  );

  useEffect(() => {
    if (!ready || !settings.autoTrade) return;

    const id = window.setInterval(() => {
      if (autoRef.current) return;
      autoRef.current = true;
      void (async () => {
        try {
          const state = read();
          if (!state.settings.autoTrade) return;
          if (!isUpstoxConnected()) {
            persist(
              pushEvent('Auto paused — Upstox disconnected.', {
                ...state,
                settings: {
                  ...state.settings,
                  autoTrade: false,
                  status: 'idle',
                },
              })
            );
            return;
          }

          const live = await refreshLiveSignal(state);
          const open = state.trades.find((t) => t.status === 'open');

          if (open) {
            const quote = await fetchLiveOptionPremium({
              spot: live.spot || open.strike,
              option: open.option,
              strike: open.strike,
              instrumentKey: open.instrumentKey,
            });
            if (!quote.ok || !(quote.ltp > 0)) return;

            setOpenLiveLtp(quote.ltp);
            setLastQuoteAt(new Date().toISOString());

            const now = Date.now();
            const ageSec = (now - new Date(open.at).getTime()) / 1000;
            const exitPoints = exitPointsFromSettings(state.settings);
            const peak = Math.max(open.peakPremium ?? open.entryPremium, quote.ltp);
            const exit = evaluatePaperPremiumExit(
              open.entryPremium,
              quote.ltp,
              peak,
              exitPoints
            );
            const timeStop = ageSec >= state.settings.maxHoldSeconds;

            if (!exit.shouldClose && !timeStop) {
              const trades =
                peak > (open.peakPremium ?? open.entryPremium)
                  ? state.trades.map((t) =>
                      t.id === open.id ? { ...t, peakPremium: peak } : t
                    )
                  : state.trades;
              const next = { ...state, ...live, trades };
              localStorage.setItem(KEY, JSON.stringify(next));
              setCandles(next.candles);
              setSignal(next.signal);
              setSpot(next.spot);
              if (trades !== state.trades) setTrades(trades);
              return;
            }

            const exitPremium =
              exit.shouldClose && exit.exitPremium != null ? exit.exitPremium : quote.ltp;
            const closed = closeBlinkPaper(open, state.settings, exitPremium);
            const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
            const limits = applyDayLimits(state.settings, trades);
            const why =
              timeStop && !exit.shouldClose
                ? `time ${state.settings.maxHoldSeconds}s`
                : exit.reason
                  ? paperExitLabel(exit.reason, exitPoints)
                  : 'exit';
            setOpenLiveLtp(null);
            const next = pushEvent(`Auto-closed (${why}) @ ₹${closed.exitPremium} · ₹${closed.pnl}`, {
              ...state,
              ...live,
              trades,
              settings: { ...state.settings, ...limits },
            });
            localStorage.setItem(KEY, JSON.stringify(next));
            setCandles(next.candles);
            setSignal(next.signal);
            setSpot(next.spot);
            setTrades(next.trades);
            setSettings(next.settings);
            setEvents(next.events);
            return;
          }

          const gate = canOpenBlinkTrade(state.settings, state.trades);
          if (
            gate.ok &&
            live.signal.bias !== 'FLAT' &&
            live.signal.confidence >= state.settings.minConfidence &&
            live.signal.premium > 0
          ) {
            const quote = await fetchLiveOptionPremium({
              spot: live.signal.niftySpot,
              option: live.signal.bias,
              strike: live.signal.strike,
            });
            if (quote.ok && quote.ltp > 0) {
              const enriched = {
                ...live.signal,
                strike: quote.strike || live.signal.strike,
                premium: quote.ltp,
              };
              const trade = openBlinkPaper(enriched, state.settings, {
                premium: quote.ltp,
                instrumentKey: quote.instrumentKey || null,
                premiumSource: 'upstox',
                expiry: quote.expiry || null,
              });
              if (trade) {
                setOpenLiveLtp(quote.ltp);
                const next = pushEvent(
                  `Auto-opened ${trade.option} ${trade.strike} @ ₹${trade.entryPremium} (Upstox)`,
                  {
                    ...state,
                    ...live,
                    signal: enriched,
                    trades: [...state.trades, trade],
                    settings: { ...state.settings, status: 'trading' },
                  }
                );
                localStorage.setItem(KEY, JSON.stringify(next));
                setCandles(next.candles);
                setSignal(next.signal);
                setSpot(next.spot);
                setTrades(next.trades);
                setSettings(next.settings);
                setEvents(next.events);
                return;
              }
            }
          }

          const next = { ...state, ...live };
          localStorage.setItem(KEY, JSON.stringify(next));
          setCandles(next.candles);
          setSignal(next.signal);
          setSpot(next.spot);
        } finally {
          autoRef.current = false;
        }
      })();
    }, AUTO_TICK_MS);

    return () => window.clearInterval(id);
  }, [ready, settings.autoTrade, persist, pushEvent, refreshLiveSignal]);

  const dayPnl = realizedToday(trades);

  return {
    ready,
    settings,
    signal,
    spot,
    trades,
    events,
    chat,
    asking,
    marketOpen,
    upstoxConnected,
    openLiveLtp,
    lastQuoteAt,
    scanning,
    dayPnl,
    analyse,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    clearChat,
    applyChatPatch,
    updateSettings,
  };
}
