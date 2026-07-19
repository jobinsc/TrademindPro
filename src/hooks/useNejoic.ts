'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeNifty,
  buildNiftyCandles,
  canOpenTrade,
  closePaperTrade,
  defaultNejoicSettings,
  evaluateDayStatus,
  analyzeOptsFromSettings,
  nejoicReply,
  openPaperTrade,
  realizedToday,
  tickNifty,
  todayKey,
  type NejoicChat,
  type NejoicSettings,
  type NejoicSignal,
  type NejoicState,
  type NejoicTrade,
  type Candle,
} from '@/lib/nejoic';
import { looksLikePulseAsk, normalizeStrategyIds } from '@/lib/nejoic-options';
import { getUpstoxAccessToken } from '@/lib/upstox-client';

const KEY = 'trademindpro_nejoic_v1';
const LAST_PULSE_DECISION_KEY = 'trademindpro_nejoic_last_tg_decision';
const LAST_PULSE_SENT_AT_KEY = 'trademindpro_nejoic_last_tg_sent';
const LAST_PULSE_FP_KEY = 'trademindpro_nejoic_last_tg_fp';
const SYNC_EVENT = 'trademindpro-nejoic-sync';

type LiveOptQuote = {
  ok: boolean;
  ltp: number;
  instrumentKey?: string;
  tradingSymbol?: string;
  strike?: number;
  expiry?: string;
  source?: string;
  error?: string;
};

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
      return {
        ok: false,
        ltp: 0,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      ltp: data.ltp,
      instrumentKey: data.instrumentKey,
      tradingSymbol: data.tradingSymbol,
      strike: data.strike,
      expiry: data.expiry,
      source: 'upstox',
    };
  } catch (e) {
    return {
      ok: false,
      ltp: 0,
      error: e instanceof Error ? e.message : 'LTP fetch failed',
    };
  }
}

async function pushTelegram(text: string) {
  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const key = process.env.NEXT_PUBLIC_TELEGRAM_NOTIFY_KEY;
    if (key) headers['x-notify-key'] = key;
    await fetch('/api/telegram/notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
  } catch {
    /* optional */
  }
}

function emptyState(): NejoicState {
  const candles = buildNiftyCandles();
  return {
    settings: defaultNejoicSettings(),
    candles,
    spot: candles[candles.length - 1]?.close ?? 24850,
    signal: null,
    trades: [],
    events: [],
    chat: [],
  };
}

function read(): NejoicState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<NejoicState>;
    const base = emptyState();
    const settings = { ...defaultNejoicSettings(), ...parsed.settings };
    settings.strategyIds = normalizeStrategyIds(settings.strategyIds, settings.strategyId);
    settings.strategyId = settings.strategyIds[0] ?? 'price_action_hhll';
    return {
      settings,
      candles: Array.isArray(parsed.candles) && parsed.candles.length > 10 ? parsed.candles : base.candles,
      spot: typeof parsed.spot === 'number' ? parsed.spot : base.spot,
      signal: parsed.signal ?? null,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      events: Array.isArray(parsed.events) ? parsed.events.slice(-80) : [],
      chat: Array.isArray(parsed.chat) ? parsed.chat.slice(-40) : [],
    };
  } catch {
    return emptyState();
  }
}

export function useNejoic() {
  const [settings, setSettings] = useState<NejoicSettings>(defaultNejoicSettings());
  const [candles, setCandles] = useState<Candle[]>([]);
  const [spot, setSpot] = useState(24850);
  const [signal, setSignal] = useState<NejoicSignal | null>(null);
  const [trades, setTrades] = useState<NejoicTrade[]>([]);
  const [events, setEvents] = useState<{ id: string; at: string; text: string }[]>([]);
  const [chat, setChat] = useState<NejoicChat[]>([]);
  const [ready, setReady] = useState(false);
  const [feedSource, setFeedSource] = useState<'live' | 'simulated'>('simulated');
  const [feedLabel, setFeedLabel] = useState('Simulated');
  const autoRef = useRef(false);
  const feedLiveRef = useRef(false);

  const persist = useCallback((next: NejoicState) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setSettings(next.settings);
    setCandles(next.candles);
    setSpot(next.spot);
    setSignal(next.signal);
    setTrades(next.trades);
    setEvents(next.events);
    setChat(next.chat);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SYNC_EVENT));
    }
  }, []);

  const hydrateFromStorage = useCallback(() => {
    const s = read();
    setSettings(s.settings);
    setCandles(s.candles);
    setSpot(s.spot);
    setSignal(s.signal);
    setTrades(s.trades);
    setEvents(s.events);
    setChat(s.chat);
  }, []);

  const snapshot = useCallback((): NejoicState => {
    return { settings, candles, spot, signal, trades, events, chat };
  }, [settings, candles, spot, signal, trades, events, chat]);

  const pushEvent = useCallback((text: string, state: NejoicState): NejoicState => {
    const ev = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      text,
    };
    return { ...state, events: [...state.events, ev].slice(-80) };
  }, []);

  useEffect(() => {
    hydrateFromStorage();
    setReady(true);
    const onSync = () => hydrateFromStorage();
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrateFromStorage]);

  // Live Nifty feed (Yahoo NSEI via /api/market/nifty) — fallback to simulated ticks
  useEffect(() => {
    if (!ready) return;
    const active =
      settings.status === 'watching' ||
      settings.status === 'armed' ||
      settings.status === 'trading';
    if (!active) return;

    let cancelled = false;

    async function pullLive() {
      try {
        const res = await fetch('/api/market/nifty', { cache: 'no-store' });
        const data = (await res.json()) as {
          ok?: boolean;
          spot?: number;
          candles?: Candle[];
          label?: string;
        };
        if (cancelled) return;
        if (data.ok && data.candles && data.candles.length > 5 && typeof data.spot === 'number') {
          feedLiveRef.current = true;
          setFeedSource('live');
          setFeedLabel(data.label || 'Nifty live');
          setCandles(data.candles);
          setSpot(data.spot);
          const state = read();
          localStorage.setItem(
            KEY,
            JSON.stringify({
              ...state,
              candles: data.candles,
              spot: data.spot,
            })
          );
          return;
        }
      } catch {
        /* fall through to sim */
      }
      if (cancelled) return;
      feedLiveRef.current = false;
      setFeedSource('simulated');
      setFeedLabel('Simulated (live feed unavailable)');
    }

    void pullLive();
    const liveId = window.setInterval(() => void pullLive(), 3000);

    const simId = window.setInterval(() => {
      if (feedLiveRef.current) return;
      setCandles((prev) => {
        const nextCandles = tickNifty(prev.length ? prev : buildNiftyCandles());
        const nextSpot = nextCandles[nextCandles.length - 1]?.close ?? spot;
        setSpot(nextSpot);
        const state = read();
        localStorage.setItem(
          KEY,
          JSON.stringify({ ...state, candles: nextCandles, spot: nextSpot })
        );
        return nextCandles;
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(liveId);
      window.clearInterval(simId);
    };
  }, [ready, settings.status]);

  const analyse = useCallback(() => {
    const state = snapshot();
    const sig = analyzeNifty(
      state.candles.length ? state.candles : buildNiftyCandles(),
      analyzeOptsFromSettings(state.settings)
    );
    let next = pushEvent(
      `PA analyse @ ${sig.niftySpot.toFixed(2)} → ${sig.lastLabel ?? '—'} · ${sig.bias}`,
      {
        ...state,
        signal: sig,
        spot: sig.niftySpot,
        settings: {
          ...state.settings,
          leftBars: state.settings.leftBars ?? 5,
          rightBars: state.settings.rightBars ?? 5,
          status:
            state.settings.status === 'stopped_loss' || state.settings.status === 'target_hit'
              ? state.settings.status
              : 'watching',
          updatedAt: new Date().toISOString(),
        },
      }
    );
    next = {
      ...next,
      settings: {
        ...next.settings,
        status: evaluateDayStatus(next.settings, next.trades),
      },
    };
    persist(next);
    return sig;
  }, [snapshot, pushEvent, persist]);

  const setWatching = useCallback(
    (on: boolean) => {
      const state = snapshot();
      const status = on ? 'watching' : 'idle';
      persist({
        ...state,
        settings: { ...state.settings, status, updatedAt: new Date().toISOString() },
      });
    },
    [snapshot, persist]
  );

  const setAutoTrade = useCallback(
    (on: boolean) => {
      const state = snapshot();
      const pnl = realizedToday(state.trades);
      const ignore = state.settings.ignoreDailyLimits;
      if (on && !ignore && pnl <= -Math.abs(state.settings.dailyMaxLoss)) {
        persist(
          pushEvent('Cannot start — daily max loss already hit.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'stopped_loss' },
          })
        );
        return;
      }
      if (on && !ignore && pnl >= state.settings.dailyProfitTarget) {
        persist(
          pushEvent('Target already hit — Nejoic rests today.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'target_hit' },
          })
        );
        return;
      }
      let next: NejoicState = {
        ...state,
        settings: {
          ...state.settings,
          autoTrade: on,
          mode: 'paper',
          status: on ? 'armed' : 'watching',
          updatedAt: new Date().toISOString(),
        },
      };
      next = pushEvent(
        on
          ? ignore
            ? 'Nejoic STARTED (paper study) — no daily P&L lock until market close.'
            : 'Nejoic STARTED (paper).'
          : 'Nejoic STOPPED.',
        next
      );
      persist(next);
    },
    [snapshot, persist, pushEvent]
  );

  const fullStop = useCallback(
    (alsoExitTrades: boolean) => {
      const state = read();
      let next: NejoicState = {
        ...state,
        settings: {
          ...state.settings,
          autoTrade: false,
          status: 'idle',
          updatedAt: new Date().toISOString(),
        },
      };
      next = pushEvent('FULL STOP — Nejoic auto off.', next);
      if (alsoExitTrades) {
        const open = next.trades.find((t) => t.status === 'open');
        if (open) {
          const closed = closePaperTrade(open, next.settings);
          next = {
            ...next,
            trades: next.trades.map((t) => (t.id === open.id ? closed : t)),
          };
          next = pushEvent(
            `FULL STOP closed ${closed.option} ${closed.strike} · P&L ₹${closed.pnl}`,
            next
          );
        }
      }
      persist(next);
    },
    [persist, pushEvent]
  );

  const takeSignal = useCallback(async () => {
    const state = snapshot();
    const sig = state.signal ?? analyzeNifty(state.candles, analyzeOptsFromSettings(state.settings));
    const gate = canOpenTrade(state.settings, state.trades);
    if (!gate.ok) {
      persist(pushEvent(gate.reason, { ...state, signal: sig }));
      return null;
    }
    if (sig.bias === 'FLAT') {
      persist(pushEvent('No trade — bias FLAT.', { ...state, signal: sig }));
      return null;
    }

    const live = await fetchLiveOptionPremium({
      spot: sig.niftySpot || state.spot,
      option: sig.bias,
      strike: sig.strike,
    });
    const premium = live.ok ? live.ltp : sig.premium;
    const strike = live.strike || sig.strike;
    const enrichedSig = { ...sig, strike, premium };
    const trade = openPaperTrade(enrichedSig, state.settings, {
      premium,
      instrumentKey: live.instrumentKey || null,
      premiumSource: live.ok ? 'upstox' : 'estimate',
      expiry: live.expiry || null,
    });
    if (!trade) return null;
    let next: NejoicState = {
      ...state,
      signal: enrichedSig,
      trades: [...state.trades, trade],
      settings: { ...state.settings, status: 'trading', updatedAt: new Date().toISOString() },
    };
    const src = live.ok ? 'Upstox LTP' : 'estimate (Upstox offline)';
    next = pushEvent(
      `Opened paper BUY NIFTY ${trade.strike} ${trade.option} @ ₹${trade.entryPremium} (${src})`,
      next
    );
    persist(next);
    if (state.settings.telegramNotify !== false) {
      void pushTelegram(
        `📄 PAPER TRADE OPEN\nNIFTY ${trade.strike} ${trade.option}\nEntry ₹${trade.entryPremium} (${src})\nLots ${trade.lots}\n(Nejoic · paper only)`
      );
    }
    return trade;
  }, [snapshot, persist, pushEvent]);

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
    const closed = closePaperTrade(
      open,
      state.settings,
      live.ok ? live.ltp : null
    );
    const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
    let status = evaluateDayStatus({ ...state.settings, status: 'watching' }, trades);
    if (realizedToday(trades) >= state.settings.dailyProfitTarget) status = 'target_hit';
    if (realizedToday(trades) <= -Math.abs(state.settings.dailyMaxLoss)) status = 'stopped_loss';
    let next: NejoicState = {
      ...state,
      trades,
      settings: {
        ...state.settings,
        status,
        autoTrade: status === 'target_hit' || status === 'stopped_loss' ? false : state.settings.autoTrade,
        updatedAt: new Date().toISOString(),
      },
    };
    const src = live.ok ? 'Upstox LTP' : 'estimate';
    next = pushEvent(
      `Closed ${closed.option} ${closed.strike} @ ₹${closed.exitPremium} (${src}) · P&L ₹${closed.pnl}`,
      next
    );
    if (status === 'target_hit') {
      next = pushEvent(`🎯 Daily target ₹${state.settings.dailyProfitTarget} hit — stopping.`, next);
    }
    if (status === 'stopped_loss') {
      next = pushEvent(`🛑 Max loss ₹${state.settings.dailyMaxLoss} — locked for today.`, next);
    }
    persist(next);
    if (state.settings.telegramNotify !== false) {
      void pushTelegram(
        `📄 PAPER TRADE CLOSED\nNIFTY ${closed.strike} ${closed.option}\nExit ₹${closed.exitPremium} (${src})\nP&L ₹${closed.pnl}\n(Nejoic · paper only)`
      );
    }
  }, [snapshot, persist, pushEvent]);

  // Auto loop: when armed/trading, analyse + open/close on a timer (paper)
  useEffect(() => {
    if (!ready) return;
    if (!settings.autoTrade) return;
    if (settings.status === 'target_hit' || settings.status === 'stopped_loss') return;

    const id = window.setInterval(() => {
      if (autoRef.current) return;
      autoRef.current = true;
      void (async () => {
        try {
          const state = read();
          if (!state.settings.autoTrade) return;
          const pnl = realizedToday(state.trades);
          const ignore = state.settings.ignoreDailyLimits;
          if (
            !ignore &&
            (pnl >= state.settings.dailyProfitTarget ||
              pnl <= -Math.abs(state.settings.dailyMaxLoss))
          ) {
            return;
          }
          const open = state.trades.find((t) => t.status === 'open');
          if (open) {
            const age = Date.now() - new Date(open.at).getTime();
            if (age > 12_000) {
              const live = await fetchLiveOptionPremium({
                spot: state.spot || open.strike,
                option: open.option,
                strike: open.strike,
                instrumentKey: open.instrumentKey,
              });
              const closed = closePaperTrade(
                open,
                state.settings,
                live.ok ? live.ltp : null
              );
              const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
              let status = evaluateDayStatus(state.settings, trades);
              const day = realizedToday(trades);
              if (!state.settings.ignoreDailyLimits) {
                if (day >= state.settings.dailyProfitTarget) status = 'target_hit';
                if (day <= -Math.abs(state.settings.dailyMaxLoss)) status = 'stopped_loss';
              }
              const src = live.ok ? 'Upstox LTP' : 'estimate';
              const next: NejoicState = {
                ...state,
                trades,
                settings: {
                  ...state.settings,
                  status,
                  autoTrade:
                    status === 'target_hit' || status === 'stopped_loss'
                      ? false
                      : state.settings.autoTrade,
                },
                events: [
                  ...state.events,
                  {
                    id: crypto.randomUUID(),
                    at: new Date().toISOString(),
                    text: `Auto-closed ${closed.option} @ ₹${closed.exitPremium} (${src}) · ₹${closed.pnl}`,
                  },
                ].slice(-80),
              };
              localStorage.setItem(KEY, JSON.stringify(next));
              setTrades(next.trades);
              setSettings(next.settings);
              setEvents(next.events);
              if (state.settings.telegramNotify !== false) {
                void pushTelegram(
                  `📄 AUTO PAPER CLOSED\nNIFTY ${closed.strike} ${closed.option}\nExit ₹${closed.exitPremium} (${src})\nP&L ₹${closed.pnl}`
                );
              }
            }
            return;
          }

          const sig = analyzeNifty(
            state.candles.length ? state.candles : buildNiftyCandles(),
            analyzeOptsFromSettings({ ...defaultNejoicSettings(), ...state.settings })
          );
          setSignal(sig);
          const gate = canOpenTrade(state.settings, state.trades);
          const minConf = state.settings.minConfidence ?? 70;
          if (!gate.ok || sig.bias === 'FLAT' || sig.confidence < minConf) {
            localStorage.setItem(
              KEY,
              JSON.stringify({
                ...state,
                signal: sig,
                spot: sig.niftySpot,
              })
            );
            return;
          }

          const live = await fetchLiveOptionPremium({
            spot: sig.niftySpot,
            option: sig.bias,
            strike: sig.strike,
          });
          const premium = live.ok ? live.ltp : sig.premium;
          const strike = live.strike || sig.strike;
          const enriched = { ...sig, strike, premium };
          const trade = openPaperTrade(enriched, state.settings, {
            premium,
            instrumentKey: live.instrumentKey || null,
            premiumSource: live.ok ? 'upstox' : 'estimate',
            expiry: live.expiry || null,
          });
          if (!trade) return;
          const src = live.ok ? 'Upstox LTP' : 'estimate';
          const next: NejoicState = {
            ...state,
            signal: enriched,
            spot: sig.niftySpot,
            trades: [...state.trades, trade],
            settings: { ...state.settings, status: 'trading' },
            events: [
              ...state.events,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: `Auto-opened ${trade.option} ${trade.strike} @ ₹${trade.entryPremium} (${src})`,
              },
            ].slice(-80),
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setTrades(next.trades);
          setSettings(next.settings);
          setEvents(next.events);
          setSignal(enriched);
          setSpot(sig.niftySpot);
          if (state.settings.telegramNotify !== false) {
            void pushTelegram(
              `📄 AUTO PAPER OPEN\nNIFTY ${trade.strike} ${trade.option} @ ₹${trade.entryPremium} (${src})\nSetup ${sig.setup} · ${sig.confidence}%`
            );
          }
        } finally {
          autoRef.current = false;
        }
      })();
    }, 5000);

    return () => window.clearInterval(id);
  }, [ready, settings.autoTrade, settings.status]);

  // Desk pulse → Telegram: instrument / TF / studies from Nejoic Settings
  useEffect(() => {
    if (!ready) return;
    if (!settings.autoTrade) return;
    if (settings.telegramNotify === false) return;

    const settingsKey = [
      settings.telegramInstrument,
      settings.telegramTimeframe,
      settings.telegramHeartbeatMinutes,
      settings.telegramIncludeStudies,
      settings.strategyId,
      settings.strategyIds,
      settings.orbMinutes,
      settings.analysisStyle,
      settings.minConfidence,
      settings.leftBars,
      settings.rightBars,
      settings.emaFast,
      settings.emaSlow,
      settings.rsiPeriod,
      settings.breakoutLookback,
    ].join('|');
    const prevKey = localStorage.getItem('nejoic_tg_settings_key') || '';
    if (prevKey && prevKey !== settingsKey) {
      // Force next report to use new message shape immediately
      localStorage.setItem(LAST_PULSE_SENT_AT_KEY, '0');
      localStorage.setItem(LAST_PULSE_FP_KEY, '');
    }
    localStorage.setItem('nejoic_tg_settings_key', settingsKey);

    const tick = async () => {
      try {
        const heartbeatMin = Math.max(
          3,
          Math.min(60, Number(settings.telegramHeartbeatMinutes) || 15)
        );
        const res = await fetch('/api/nejoic/pulse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tf: settings.telegramTimeframe || settings.primaryTimeframe || '15m',
            instrument: settings.telegramInstrument || 'AUTO',
            settings,
          }),
        });
        const pulse = (await res.json()) as {
          decision?: string;
          text?: string;
          ok?: boolean;
          desk?: string;
          scoreLabel?: string;
          spot?: number;
          asset?: string;
        };
        if (!pulse.ok || !pulse.text) return;

        const desk = pulse.desk || 'INDIA';
        const decision = pulse.decision || 'WAIT';
        const prevDecision = localStorage.getItem(LAST_PULSE_DECISION_KEY) || '';
        const fp = `${desk}|${decision}|${pulse.scoreLabel}|${pulse.asset}|${Math.round(pulse.spot || 0)}|${settingsKey}`;
        const prevFp = localStorage.getItem(LAST_PULSE_FP_KEY) || '';
        const lastSent = Number(localStorage.getItem(LAST_PULSE_SENT_AT_KEY) || 0);
        const now = Date.now();
        const heartbeatMs = heartbeatMin * 60 * 1000;
        const flippedToAction =
          decision !== prevDecision && (decision === 'BUY_CE' || decision === 'BUY_PE');
        const highNew = pulse.scoreLabel === 'HIGH' && fp !== prevFp;
        const heartbeatDue = now - lastSent >= heartbeatMs;

        localStorage.setItem(LAST_PULSE_DECISION_KEY, decision);

        if (!flippedToAction && !highNew && !heartbeatDue) return;

        await pushTelegram(pulse.text);
        localStorage.setItem(LAST_PULSE_SENT_AT_KEY, String(now));
        localStorage.setItem(LAST_PULSE_FP_KEY, fp);
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = window.setInterval(tick, 3 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [
    ready,
    settings.autoTrade,
    settings.telegramNotify,
    settings.telegramInstrument,
    settings.telegramTimeframe,
    settings.telegramHeartbeatMinutes,
    settings.telegramIncludeStudies,
    settings.primaryTimeframe,
    settings.strategyId,
    settings.strategyIds,
    settings.orbMinutes,
    settings.analysisStyle,
    settings.minConfidence,
    settings.leftBars,
    settings.rightBars,
    settings.emaFast,
    settings.emaSlow,
    settings.rsiPeriod,
    settings.breakoutLookback,
  ]);

  const ask = useCallback(
    async (prompt: string) => {
      const state = snapshot();
      const user: NejoicChat = {
        id: crypto.randomUUID(),
        role: 'user',
        text: prompt.trim(),
        at: new Date().toISOString(),
      };

      const useMath =
        state.settings.askMode !== 'rules' || looksLikePulseAsk(prompt);

      let replyText = '';
      if (useMath || looksLikePulseAsk(prompt)) {
        try {
          const res = await fetch('/api/nejoic/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              tf: looksLikePulseAsk(prompt)
                ? prompt
                : state.settings.primaryTimeframe || '5m',
            }),
          });
          const data = (await res.json()) as { text?: string };
          replyText = data.text || '';
        } catch {
          replyText = '';
        }
      }

      if (!replyText) {
        replyText = nejoicReply(prompt, {
          spot: state.spot,
          signal: state.signal,
          settings: state.settings,
          dayPnl: realizedToday(state.trades),
          status: state.settings.status,
        });
      }

      const bot: NejoicChat = {
        id: crypto.randomUUID(),
        role: 'nejoic',
        text: replyText,
        at: new Date().toISOString(),
      };
      const next = { ...state, chat: [...state.chat, user, bot].slice(-40) };
      persist(next);
    },
    [snapshot, persist]
  );

  const requestPulse = useCallback(async () => {
    const tf = settings.primaryTimeframe || '5m';
    await ask(`/pulse ${tf}`);
  }, [ask, settings.primaryTimeframe]);

  const clearChat = useCallback(() => {
    const state = snapshot();
    persist({ ...state, chat: [] });
  }, [snapshot, persist]);

  const updateSettings = useCallback(
    (patch: Partial<NejoicSettings>) => {
      const state = snapshot();
      const nextSettings: NejoicSettings = {
        ...defaultNejoicSettings(),
        ...state.settings,
        ...patch,
        status: patch.status ?? state.settings.status,
        autoTrade: patch.autoTrade ?? state.settings.autoTrade,
        updatedAt: new Date().toISOString(),
      };
      nextSettings.strategyIds = normalizeStrategyIds(
        nextSettings.strategyIds,
        nextSettings.strategyId
      );
      nextSettings.strategyId = nextSettings.strategyIds[0] ?? 'price_action_hhll';
      persist(
        pushEvent('Nejoic settings saved.', {
          ...state,
          settings: nextSettings,
        })
      );
    },
    [snapshot, persist, pushEvent]
  );

  const dayPnl = realizedToday(trades);

  return {
    ready,
    settings,
    candles,
    spot,
    signal,
    trades,
    events,
    chat,
    dayPnl,
    dayKey: todayKey(),
    feedSource,
    feedLabel,
    analyse,
    setWatching,
    setAutoTrade,
    takeSignal,
    closeOpen,
    ask,
    requestPulse,
    fullStop,
    clearChat,
    updateSettings,
  };
}
