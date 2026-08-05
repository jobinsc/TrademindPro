'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { normalizeStrategyIds } from '@/lib/nejoic-options';
import {
  evaluatePaperPremiumExit,
  isJimboEntryPremiumAllowed,
  JIMBO_MIN_OPTION_ENTRY_PREMIUM,
  paperExitLabel,
} from '@/lib/paper-exit';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import { readMomentumFocus } from '@/lib/jimbo-momentum';

const KEY = 'trademindpro_jimbo_v1';
const AUTO_TICK_MS = 12_000;

type LiveOptQuote = {
  ok: boolean;
  ltp: number;
  instrumentKey?: string;
  tradingSymbol?: string;
  strike?: number;
  error?: string;
};

async function fetchJimboLiveOptionLtp(input: {
  instrumentKey?: string | null;
  symbol: string;
  option: 'CE' | 'PE';
  strike: number;
  spot?: number;
}): Promise<LiveOptQuote> {
  const token = getUpstoxAccessToken();
  if (!token) {
    return { ok: false, ltp: 0, error: 'Upstox not connected' };
  }
  try {
    const res = await fetch('/api/jimbo/option-ltp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instrumentKey: input.instrumentKey || undefined,
        symbol: input.symbol,
        option: input.option,
        strike: input.strike,
        spot: input.spot || input.strike,
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
      tradingSymbol: data.tradingSymbol,
      strike: data.strike,
    };
  } catch (e) {
    return {
      ok: false,
      ltp: 0,
      error: e instanceof Error ? e.message : 'LTP fetch failed',
    };
  }
}

function exitPointsFromSettings(settings: JimboSettings) {
  return {
    stopLossPoints: settings.stopLossPoints || 10,
    targetPoints: settings.targetPoints || 18,
    trailingStopPoints: settings.trailingStopPoints || 0,
    trailingActivatePoints: settings.trailingActivatePoints || 0,
    mfeTrailEnabled: settings.mfeProfitTrail !== false,
    mfeTrailTriggerPts: settings.mfeTrailTriggerPts || 7,
    mfeTrailKeepFrac: settings.mfeTrailKeepFrac ?? 0.5,
  };
}

function pushPaperBackup(
  trades: JimboTrade[],
  opts?: { note?: string; cleared?: boolean }
) {
  if (typeof window === 'undefined') return;
  void fetch('/api/jimbo/paper-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trades,
      note: opts?.note,
      cleared: opts?.cleared,
    }),
    cache: 'no-store',
  }).catch(() => undefined);
}

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
    const merged = { ...defaultJimboSettings(), ...p.settings };
    merged.strategyIds = normalizeStrategyIds(merged.strategyIds, merged.strategyId);
    merged.strategyId = merged.strategyIds[0];
    return {
      settings: merged,
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

async function liveFoCciScan(
  settings: JimboSettings,
  liveSpots?: Record<string, { lastPrice?: number; changePct?: number | null }>
): Promise<{
  signals: JimboSignal[];
  marketOpen: boolean;
  scanned: number;
  note?: string;
} | null> {
  const token = getUpstoxAccessToken();
  if (!token) return null;
  try {
    const focusSymbols = readMomentumFocus();
    const res = await fetch('/api/jimbo/cci-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cciPeriod: settings.cciPeriod,
        requirePaConfirm: settings.requirePaConfirm,
        minConfidence: settings.minConfidence,
        primaryTimeframe: settings.primaryTimeframe,
        scanScope: settings.scanScope || 'liquid',
        maxLiquidityRank: settings.maxLiquidityRank,
        focusSymbols,
        liveSpots,
      }),
      cache: 'no-store',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      signals?: JimboSignal[];
      marketOpen?: boolean;
      scanned?: number;
      note?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.signals)) return null;
    return {
      signals: data.signals,
      marketOpen: Boolean(data.marketOpen),
      scanned: Number(data.scanned ?? 0),
      note: data.note,
    };
  } catch {
    return null;
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
  const [liveMark, setLiveMark] = useState<{
    tradeId: string;
    ltp: number;
    at: string;
    peak: number;
    low: number;
    latencyMs: number;
  } | null>(null);
  const autoRef = useRef(false);
  const repairedRef = useRef(false);
  const liveMarkBusy = useRef(false);
  const openTradeId = trades.find((t) => t.status === 'open')?.id ?? null;

  const persist = useCallback((next: JimboState, backupNote?: string) => {
    const prevRaw = localStorage.getItem(KEY);
    let prevTrades: JimboTrade[] = [];
    try {
      prevTrades = prevRaw ? (JSON.parse(prevRaw) as JimboState).trades || [] : [];
    } catch {
      prevTrades = [];
    }
    localStorage.setItem(KEY, JSON.stringify(next));
    setSettings(next.settings);
    setSignals(next.signals);
    setLastScanAt(next.lastScanAt);
    setTrades(next.trades);
    setEvents(next.events);
    setChat(next.chat);
    const tradesChanged =
      JSON.stringify(prevTrades) !== JSON.stringify(next.trades || []);
    if (tradesChanged) {
      pushPaperBackup(next.trades || [], {
        note: backupNote || 'Jimbo paper trades updated',
        cleared: (next.trades || []).length === 0,
      });
    }
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
    if (s.trades.length) {
      pushPaperBackup(s.trades, { note: 'Jimbo hydrate paper backup' });
    }

    // One-shot: reprice today's book onto Upstox if any trade lacks live instrument / theoretical exits
    if (!repairedRef.current && getUpstoxAccessToken() && s.trades.length) {
      repairedRef.current = true;
      const needs =
        s.trades.some((t) => !t.instrumentKey) ||
        s.trades.some((t) => {
          if (t.status !== 'closed' || t.exitPremium == null) return false;
          const pts = Math.round((t.exitPremium - t.entryPremium) * 100) / 100;
          return [5, 10, 18, 25, 40, -5, -10, -18, -25, -40].some(
            (x) => Math.abs(pts - x) < 0.021
          );
        });
      if (needs) {
        const token = getUpstoxAccessToken();
        void fetch('/api/jimbo/repair-paper', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ trades: s.trades, flattenExtraOpens: true }),
          cache: 'no-store',
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok || !data.ok || !Array.isArray(data.trades)) return;
            const state = read();
            const next = {
              ...state,
              trades: data.trades as JimboTrade[],
              events: [
                ...state.events,
                {
                  id: crypto.randomUUID(),
                  at: new Date().toISOString(),
                  text: data.note || 'Jimbo paper repaired onto Upstox live/history prices',
                },
              ].slice(-80),
            };
            localStorage.setItem(KEY, JSON.stringify(next));
            setTrades(next.trades);
            setEvents(next.events);
          })
          .catch(() => undefined);
      }
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      setMarketOpen(isNseMarketOpen());
      setSessionLabel(marketSessionLabel());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [ready]);

  const scan = useCallback(
    async (liveSpots?: Record<string, { lastPrice?: number; changePct?: number | null }>) => {
      setScanning(true);
      try {
        const state = snapshot();
        const live = await liveFoCciScan(state.settings, liveSpots);
        const result =
          live ??
          scanJimboUniverse(state.settings, {
            liveSpots: liveSpots
              ? Object.fromEntries(
                  Object.entries(liveSpots).map(([k, v]) => [k, Number(v.lastPrice ?? 0)])
                )
              : undefined,
            focusSymbols: readMomentumFocus(),
          });
        const actionable = result.signals.filter((s) => s.bias !== 'FLAT').length;
        const withAtm = result.signals.filter((s) => s.bias !== 'FLAT' && s.premium > 0).length;
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
          live?.note
            ? `F&O CCI scan · ${result.scanned} names · ${actionable} setups · ${withAtm} live ATM · ${
                result.marketOpen ? 'market open' : 'market closed'
              }`
            : `F&O CCI (offline bars) · ${result.scanned} names · ${actionable} setups · connect Upstox for live ATM`,
          next
        );
        persist(next);
        setMarketOpen(result.marketOpen);
        return result;
      } finally {
        setScanning(false);
      }
    },
    [snapshot, pushEvent, persist]
  );

  const setAutoTrade = useCallback(
    (on: boolean) => {
      const state = snapshot();
      if (on && !getUpstoxAccessToken()) {
        persist(
          pushEvent('Connect Upstox first — Jimbo auto needs live option prices.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'idle' },
          })
        );
        return;
      }
      const open = isNseMarketOpen();
      if (on && !open) {
        persist(
          pushEvent('Cannot start — market closed. Scan for study only.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'market_closed' },
          })
        );
        return;
      }
      const pnl = realizedToday(state.trades);
      if (
        on &&
        state.settings.enforceDailyTargetLimit &&
        pnl >= state.settings.dailyProfitTarget
      ) {
        persist(
          pushEvent('Target already hit.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'target_hit' },
          })
        );
        return;
      }
      if (
        on &&
        state.settings.enforceMaxLossLimit &&
        pnl <= -Math.abs(state.settings.dailyMaxLoss)
      ) {
        persist(
          pushEvent('Max loss hit.', {
            ...state,
            settings: { ...state.settings, autoTrade: false, status: 'stopped_loss' },
          })
        );
        return;
      }
      persist(
        pushEvent(
          on
            ? `Jimbo STARTED (${state.settings.mode}) for liquid stock options.`
            : 'Jimbo STOPPED.',
          {
          ...state,
          settings: {
            ...state.settings,
            autoTrade: on,
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
      if (!getUpstoxAccessToken()) {
        persist(
          pushEvent('Connect Upstox — Jimbo paper opens only on live ATM LTP.', state)
        );
        return null;
      }
      const pick =
        signal ||
        state.signals.find(
          (s) =>
            s.bias !== 'FLAT' &&
            s.confidence >= (state.settings.minConfidence ?? 75) &&
            isJimboEntryPremiumAllowed(s.premium) &&
            Boolean(s.instrumentKey)
        );
      if (!pick) {
        persist(
          pushEvent(
            `No Jimbo signal with live ATM ≥ ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM} — Scan CCI with Upstox connected first.`,
            state
          )
        );
        return null;
      }
      if (!isJimboEntryPremiumAllowed(pick.premium) || !pick.instrumentKey) {
        persist(
          pushEvent(
            pick.premium > 0 && pick.premium < JIMBO_MIN_OPTION_ENTRY_PREMIUM
              ? `Skip ${pick.symbol} — premium ₹${pick.premium} below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}.`
              : 'Signal has no live Upstox option LTP — rescan with Upstox connected.',
            state
          )
        );
        return null;
      }
      const gate = canOpenJimboTrade(state.settings, state.trades, open);
      if (!gate.ok) {
        persist(pushEvent(gate.reason, state));
        return null;
      }
      const trade = openJimboPaper(pick, state.settings);
      if (!trade) {
        persist(
          pushEvent(
            pick.premium > 0 && pick.premium < JIMBO_MIN_OPTION_ENTRY_PREMIUM
              ? `Skipped — no stock options below ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM} premium.`
              : 'Could not open — need live Upstox ATM instrument + LTP.',
            state
          )
        );
        return null;
      }
      persist(
        pushEvent(
          `Opened paper ${trade.symbol} ${trade.strike} ${trade.option} @ ₹${trade.entryPremium} (Upstox LTP)${
            trade.tradingSymbol ? ` · ${trade.tradingSymbol}` : ''
          }`,
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
    void (async () => {
      const state = snapshot();
      const open = state.trades.find((t) => t.status === 'open');
      if (!open) return;
      const quote = await fetchJimboLiveOptionLtp({
        instrumentKey: open.instrumentKey,
        symbol: open.symbol,
        option: open.option,
        strike: open.strike,
      });
      if (!quote.ok || !(quote.ltp > 0)) {
        persist(
          pushEvent(
            quote.error ||
              'Cannot exit — live Upstox option LTP unavailable (no simulation).',
            state
          )
        );
        return;
      }
      const closed = closeJimboPaper(
        quote.instrumentKey
          ? { ...open, instrumentKey: quote.instrumentKey }
          : open,
        quote.ltp
      );
      const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
      const pnl = realizedToday(trades);
      let status: JimboSettings['status'] = 'scanning';
      let autoTrade = state.settings.autoTrade;
      if (
        state.settings.enforceDailyTargetLimit &&
        pnl >= state.settings.dailyProfitTarget
      ) {
        status = 'target_hit';
        autoTrade = false;
      } else if (
        state.settings.enforceMaxLossLimit &&
        pnl <= -Math.abs(state.settings.dailyMaxLoss)
      ) {
        status = 'stopped_loss';
        autoTrade = false;
      }
      persist(
        pushEvent(
          `Closed ${closed.symbol} ${closed.option} @ ₹${closed.exitPremium} (Upstox) · P&L ₹${closed.pnl}`,
          {
            ...state,
            trades,
            settings: { ...state.settings, status, autoTrade },
          }
        )
      );
    })();
  }, [snapshot, persist, pushEvent]);

  const clearPaperTrades = useCallback(() => {
    const state = snapshot();
    if (!state.trades.length) return;
    const openN = state.trades.filter((t) => t.status === 'open').length;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        openN > 0
          ? `Clear will remove ${openN} open paper stock-option trade(s) and the full Jimbo paper book. Continue?`
          : `Clear ${state.trades.length} Jimbo paper stock-option trade(s)? This cannot be undone.`
      );
      if (!ok) return;
    }
    persist(
      pushEvent('Cleared Jimbo paper stock-option trades.', {
        ...state,
        trades: [],
        settings: {
          ...state.settings,
          autoTrade: false,
          status: 'idle',
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }, [snapshot, persist, pushEvent]);

  // Auto: live Upstox marks + rescan; flatten + stop after 15:12
  useEffect(() => {
    if (!ready || !settings.autoTrade) return;
    const id = window.setInterval(() => {
      if (autoRef.current) return;
      autoRef.current = true;
      void (async () => {
        try {
        const state = read();
        if (!state.settings.autoTrade) return;

        const token = getUpstoxAccessToken();
        if (!token) {
          const next = {
            ...state,
            settings: {
              ...state.settings,
              autoTrade: false,
              status: 'idle' as const,
              updatedAt: new Date().toISOString(),
            },
            events: [
              ...state.events,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: 'Auto paused — Upstox disconnected (live prices required).',
              },
            ].slice(-80),
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setSettings(next.settings);
          setEvents(next.events);
          return;
        }

        const flatWithLive = async (
          open: JimboTrade,
          why: string
        ): Promise<JimboTrade | null> => {
          const quote = await fetchJimboLiveOptionLtp({
            instrumentKey: open.instrumentKey,
            symbol: open.symbol,
            option: open.option,
            strike: open.strike,
          });
          if (!quote.ok || !(quote.ltp > 0)) return null;
          return closeJimboPaper(
            quote.instrumentKey
              ? { ...open, instrumentKey: quote.instrumentKey }
              : open,
            quote.ltp
          );
        };

        if (!isNseMarketOpen()) {
          const open = state.trades.find((t) => t.status === 'open');
          let trades = state.trades;
          const events = [...state.events];
          if (open) {
            const closed = await flatWithLive(open, 'session end');
            if (closed) {
              trades = state.trades.map((t) => (t.id === open.id ? closed : t));
              events.push({
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: `Session end 15:12 — closed ${closed.symbol} @ ₹${closed.exitPremium} (Upstox) · ₹${closed.pnl}`,
              });
            } else {
              events.push({
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: `Session end 15:12 — could not flat ${open.symbol} (no live Upstox LTP). Auto stopped; exit manually when LTP returns.`,
              });
            }
          } else {
            events.push({
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              text: 'Session end 15:12 — Jimbo auto stopped.',
            });
          }
          const next: JimboState = {
            ...state,
            trades,
            events: events.slice(-80),
            settings: {
              ...state.settings,
              autoTrade: false,
              status: 'market_closed',
              updatedAt: new Date().toISOString(),
            },
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setTrades(next.trades);
          setEvents(next.events);
          setSettings(next.settings);
          setMarketOpen(false);
          pushPaperBackup(next.trades, { note: 'Session end 15:12 paper backup' });
          return;
        }

        if (state.trades.some((t) => t.status === 'open')) {
          const open = state.trades.find((t) => t.status === 'open');
          if (!open) return;

          const entryDay = new Date(open.at).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Kolkata',
          });
          const todayIst = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Asia/Kolkata',
          });
          if (entryDay !== todayIst) {
            const closed = await flatWithLive(open, 'eod');
            if (!closed) return;
            const trades = state.trades.map((t) => (t.id === open.id ? closed : t));
            const next = {
              ...state,
              trades,
              events: [
                ...state.events,
                {
                  id: crypto.randomUUID(),
                  at: new Date().toISOString(),
                  text: `EOD flat (no overnight) ${closed.symbol} @ ₹${closed.exitPremium} (Upstox) · ₹${closed.pnl}`,
                },
              ].slice(-80),
            };
            localStorage.setItem(KEY, JSON.stringify(next));
            setTrades(next.trades);
            setEvents(next.events);
            pushPaperBackup(next.trades, { note: `EOD flat ${closed.symbol}` });
            return;
          }

          const quote = await fetchJimboLiveOptionLtp({
            instrumentKey: open.instrumentKey,
            symbol: open.symbol,
            option: open.option,
            strike: open.strike,
          });
          if (!quote.ok || !(quote.ltp > 0)) return;

          const patchedOpen =
            quote.instrumentKey && !open.instrumentKey
              ? { ...open, instrumentKey: quote.instrumentKey }
              : open;
          const ltp = quote.ltp;
          const peak = Math.max(patchedOpen.peakPremium ?? patchedOpen.entryPremium, ltp);
          const low = Math.min(
            patchedOpen.lowPremium ?? patchedOpen.entryPremium,
            ltp
          );
          const exitPoints = exitPointsFromSettings(state.settings);
          const exit = evaluatePaperPremiumExit(
            patchedOpen.entryPremium,
            ltp,
            peak,
            exitPoints
          );

          // Flat any open that slipped in below the ₹10 min entry (e.g. ITC ~₹5),
          // or normal SL / Tgt / MFE trail — always at live Upstox LTP.
          const belowMinEntry = !isJimboEntryPremiumAllowed(patchedOpen.entryPremium);
          if (!belowMinEntry && !exit.shouldClose) {
            const trades = state.trades.map((t) =>
              t.id === open.id
                ? {
                    ...patchedOpen,
                    peakPremium: peak,
                    lowPremium: low,
                    markPremium: ltp,
                    markAt: new Date().toISOString(),
                    instrumentKey: quote.instrumentKey || patchedOpen.instrumentKey,
                    tradingSymbol:
                      quote.tradingSymbol || patchedOpen.tradingSymbol,
                    priceSource: 'upstox' as const,
                  }
                : t
            );
            const next = { ...state, trades };
            localStorage.setItem(KEY, JSON.stringify(next));
            setTrades(next.trades);
            return;
          }

          const closed = closeJimboPaper(patchedOpen, ltp);
          const trades = state.trades.map((t) =>
            t.id === open.id
              ? belowMinEntry
                ? {
                    ...closed,
                    note: `${closed.note || ''} · flat — premium ₹${patchedOpen.entryPremium} below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}`.trim(),
                  }
                : closed
              : t
          );
          const why = belowMinEntry
            ? `below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}`
            : exit.reason
              ? paperExitLabel(exit.reason, exitPoints)
              : 'exit';
          const next = {
            ...state,
            trades,
            events: [
              ...state.events,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: `Auto-closed ${closed.symbol} (${why}) @ ₹${ltp} Upstox · ₹${closed.pnl}`,
              },
            ].slice(-80),
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setTrades(next.trades);
          setEvents(next.events);
          pushPaperBackup(next.trades, { note: `Auto-closed ${closed.symbol}` });
          return;
        }

        const live = await liveFoCciScan(state.settings);
        if (!live) {
          const next = {
            ...state,
            events: [
              ...state.events,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                text: 'Auto skip — need live Upstox CCI scan (no offline simulation).',
              },
            ].slice(-80),
          };
          localStorage.setItem(KEY, JSON.stringify(next));
          setEvents(next.events);
          return;
        }
        const minConf = state.settings.minConfidence ?? 75;
        const best = live.signals.find(
          (s) =>
            s.bias !== 'FLAT' &&
            s.confidence >= minConf &&
            isJimboEntryPremiumAllowed(s.premium) &&
            Boolean(s.instrumentKey)
        );
        setSignals(live.signals);
        setLastScanAt(new Date().toISOString());
        if (!best) return;
        const gate = canOpenJimboTrade(state.settings, state.trades, true);
        if (!gate.ok) return;
        const trade = openJimboPaper(best, state.settings);
        if (!trade) return;
        const next: JimboState = {
          ...state,
          signals: live.signals,
          lastScanAt: new Date().toISOString(),
          trades: [...state.trades, trade],
          settings: { ...state.settings, status: 'trading' },
          events: [
            ...state.events,
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              text: `Auto-opened ${trade.symbol} ${trade.option} ${trade.strike} @ ₹${trade.entryPremium} (Upstox)`,
            },
          ].slice(-80),
        };
        localStorage.setItem(KEY, JSON.stringify(next));
        setTrades(next.trades);
        setSignals(next.signals);
        setSettings(next.settings);
        setEvents(next.events);
        pushPaperBackup(next.trades, {
          note: `Auto-opened ${trade.symbol} ${trade.option}`,
        });
        } finally {
          autoRef.current = false;
        }
      })();
    }, AUTO_TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, settings.autoTrade]);

  const backupPaperNow = useCallback(async () => {
    const state = snapshot();
    try {
      const res = await fetch('/api/jimbo/paper-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: state.trades,
          note: 'Manual Jimbo paper backup',
          cleared: state.trades.length === 0,
        }),
        cache: 'no-store',
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; latestPath?: string };
      if (!res.ok || !data.ok) {
        persist(pushEvent(data.error || 'Paper backup failed', state));
        return null;
      }
      persist(
        pushEvent(`Paper backup saved · ${data.latestPath || '.data/jimbo/trades/paper/'}`, state)
      );
      return data;
    } catch (e) {
      persist(
        pushEvent(e instanceof Error ? e.message : 'Paper backup failed', state)
      );
      return null;
    }
  }, [snapshot, persist, pushEvent]);

  const repairPaperLive = useCallback(async () => {
    const state = snapshot();
    const token = getUpstoxAccessToken();
    if (!token) {
      persist(pushEvent('Connect Upstox to repair paper onto live prices.', state));
      return null;
    }
    try {
      const res = await fetch('/api/jimbo/repair-paper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          trades: state.trades,
          loadFromDisk: true,
          flattenExtraOpens: true,
        }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.trades)) {
        persist(pushEvent(data.error || 'Upstox paper repair failed', state));
        return null;
      }
      const next = {
        ...state,
        trades: data.trades as JimboTrade[],
      };
      persist(pushEvent(data.note || 'Jimbo paper repaired with Upstox prices', next));
      return data;
    } catch (e) {
      persist(
        pushEvent(e instanceof Error ? e.message : 'Upstox paper repair failed', state)
      );
      return null;
    }
  }, [snapshot, persist, pushEvent]);

  const runPaperBacktest = useCallback(
    async (opts?: {
      fromDate?: string;
      toDate?: string;
      lookbackDays?: number;
      maxTradesTotal?: number;
      btStopLossPoints?: number;
      btTargetPoints?: number;
      btMaxTradesPerDay?: number;
      btEnforceMaxTradesPerDay?: boolean;
      btMaxLotsPerTrade?: number;
      btMinConfidence?: number;
      btEnforceMaxLoss?: boolean;
      btEnforceDailyTarget?: boolean;
      btDailyMaxLoss?: number;
      btDailyProfitTarget?: number;
      primaryTimeframe?: string;
      scanScope?: string;
    }) => {
      const state = snapshot();
      const token = getUpstoxAccessToken();
      if (!token) {
        persist(
          pushEvent(
            'Connect Upstox first — Jimbo backtest needs real Upstox historical prices (no simulation).',
            state
          )
        );
        return null;
      }
      try {
        const res = await fetch('/api/jimbo/backtest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...state.settings,
            focusSymbols: readMomentumFocus(),
            lookbackDays: opts?.lookbackDays ?? 30,
            fromDate: opts?.fromDate,
            toDate: opts?.toDate,
            maxTradesTotal: opts?.maxTradesTotal,
            btStopLossPoints: opts?.btStopLossPoints,
            btTargetPoints: opts?.btTargetPoints,
            btMaxTradesPerDay: opts?.btMaxTradesPerDay,
            btEnforceMaxTradesPerDay: opts?.btEnforceMaxTradesPerDay,
            btMaxLotsPerTrade: opts?.btMaxLotsPerTrade,
            btMinConfidence: opts?.btMinConfidence,
            btEnforceMaxLoss: opts?.btEnforceMaxLoss,
            btEnforceDailyTarget: opts?.btEnforceDailyTarget,
            btDailyMaxLoss: opts?.btDailyMaxLoss,
            btDailyProfitTarget: opts?.btDailyProfitTarget,
            primaryTimeframe: opts?.primaryTimeframe || state.settings.primaryTimeframe,
            scanScope: opts?.scanScope || state.settings.scanScope,
          }),
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          persist(pushEvent(data.error || 'Jimbo paper backtest failed', state));
          return null;
        }
        persist(
          pushEvent(
            `Upstox backtest ${data.fromDate}→${data.toDate}: ${data.trades?.length ?? 0} trades · win ${data.winRate}% · P&L ₹${data.netPnl}`,
            state
          )
        );
        return data;
      } catch (e) {
        persist(
          pushEvent(e instanceof Error ? e.message : 'Jimbo paper backtest failed', state)
        );
        return null;
      }
    },
    [snapshot, persist, pushEvent]
  );

  // Fast live Upstox mark for open paper (Nexus-style board pulse ~2.5s)
  useEffect(() => {
    if (!ready) return;
    if (!openTradeId) {
      setLiveMark(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          if (cancelled || liveMarkBusy.current) {
            schedule(800);
            return;
          }
          liveMarkBusy.current = true;
          const started = Date.now();
          try {
            if (!getUpstoxAccessToken()) {
              setLiveMark(null);
              schedule(4000);
              return;
            }
            const state = read();
            const cur = state.trades.find(
              (t) => t.status === 'open' && t.id === openTradeId
            );
            if (!cur) {
              setLiveMark(null);
              return;
            }
            const quote = await fetchJimboLiveOptionLtp({
              instrumentKey: cur.instrumentKey,
              symbol: cur.symbol,
              option: cur.option,
              strike: cur.strike,
            });
            if (cancelled) return;
            if (!quote.ok || !(quote.ltp > 0)) {
              schedule(3000);
              return;
            }
            const ltp = quote.ltp;
            const peak = Math.max(cur.peakPremium ?? cur.entryPremium, ltp);
            const low = Math.min(cur.lowPremium ?? cur.entryPremium, ltp);
            const at = new Date().toISOString();
            const latencyMs = Date.now() - started;

            if (!isJimboEntryPremiumAllowed(cur.entryPremium)) {
              const closed = closeJimboPaper(cur, ltp);
              const trades = state.trades.map((t) =>
                t.id === cur.id
                  ? {
                      ...closed,
                      note: `${closed.note || ''} · flat — premium ₹${cur.entryPremium} below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}`.trim(),
                    }
                  : t
              );
              const next = {
                ...state,
                trades,
                events: [
                  ...state.events,
                  {
                    id: crypto.randomUUID(),
                    at,
                    text: `Auto-closed ${closed.symbol} (below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}) @ ₹${ltp} Upstox · ₹${closed.pnl}`,
                  },
                ].slice(-80),
              };
              localStorage.setItem(KEY, JSON.stringify(next));
              setTrades(next.trades);
              setEvents(next.events);
              setLiveMark(null);
              pushPaperBackup(next.trades, {
                note: `Flat ${closed.symbol} below min ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}`,
              });
              return;
            }

            // Always refresh live mark state so the UI pulses like Nifty board
            setLiveMark({
              tradeId: cur.id,
              ltp,
              at,
              peak,
              low,
              latencyMs,
            });

            const tradesNext = state.trades.map((t) =>
              t.id === cur.id
                ? {
                    ...t,
                    markPremium: ltp,
                    markAt: at,
                    peakPremium: peak,
                    lowPremium: low,
                    instrumentKey: quote.instrumentKey || t.instrumentKey,
                    tradingSymbol: quote.tradingSymbol || t.tradingSymbol,
                    priceSource: 'upstox' as const,
                  }
                : t
            );
            localStorage.setItem(KEY, JSON.stringify({ ...state, trades: tradesNext }));
            setTrades(tradesNext);
            schedule(2000);
          } catch {
            if (!cancelled) schedule(3500);
          } finally {
            liveMarkBusy.current = false;
          }
        })();
      }, delayMs);
    };

    schedule(200);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [ready, openTradeId]);

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
      const uiOnly = Object.keys(patch).length === 1 && 'settingsOpen' in patch;
      const nextState = { ...state, settings: nextSettings };
      persist(
        uiOnly
          ? nextState
          : pushEvent('Jimbo settings saved.', nextState)
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
    openTrade: trades.find((t) => t.status === 'open') || null,
    liveMark,
    scan,
    setAutoTrade,
    takeSignal,
    closeOpen,
    clearPaperTrades,
    backupPaperNow,
    repairPaperLive,
    runPaperBacktest,
    ask,
    clearChat,
    updateSettings,
  };
}
