/**
 * NexusPulse Sector 7 B session tick — Sensex Sector 7 B signals + dual-lane paper (isolated from Sector 7 A).
 * Rate-aware: Sensex 1m candles + quotes; Sensex option quotes when in trade.
 */

import { fetchUpstoxQuotes, getBearerToken } from '@/lib/upstox-market';
import {
  fetchUpstoxHistoricalWindow,
  fetchUpstoxIntradayCandles,
} from '@/lib/upstox-historical';
import { pickSensexOptions } from '@/lib/nexus-pulse-b/option-picker';
import { dayAdd, istDate } from '@/lib/pinax-forge/ist';
import {
  laneEntryAllowed,
  laneForceFlatAt,
  shouldSquareOffAll,
} from '@/lib/nexus-pulse/lanes';
import { openNexusPaperTrade, updateOpenTrades } from '@/lib/nexus-pulse/paper-broker';
import {
  NEXUS_B_LANES as NEXUS_LANES,
  NEXUS_PULSE_B_RULES as NEXUS_PULSE_RULES,
  NEXUS_B_UT_3M as NEXUS_UT_3M,
  SENSEX_INDEX_INSTRUMENT_KEY,
  type NexusBLaneId as NexusLaneId,
} from '@/lib/nexus-pulse-b/rules';
import { resampleMinutes } from '@/lib/nexus-pulse/resample';
import { evaluateUtV2Entry } from '@/lib/nexus-pulse/signals';
import { runUtBot } from '@/lib/nexus-pulse/ut-bot';
import { loadNexusBSession as loadNexusSession, saveNexusBSession as saveNexusSession } from '@/lib/nexus-pulse-b/session-store';
import { archiveNexusBClosedTrades as archiveClosedTrades, clearNexusBArchiveDay as clearArchiveDay } from '@/lib/nexus-pulse-b/trade-archive';
import type { NexusAtmBoard, NexusAtmLegQuote, NexusPulseSession, NexusPulseSettings } from '@/lib/nexus-pulse-b/types';
import type { Candle } from '@/lib/nejoic';

const DEFAULT_ACTIVE_LANES: NexusLaneId[] = ['morning_open_stop_15'];

/** Cache 1m Sensex candles ~45s â€” need closed bars for Sector 7 B. */
let candleCache: { at: number; candles: Candle[] } | null = null;
const CANDLE_TTL_MS = 45_000;
/** Sector 7 B needs enough 1m history (ATR warm-up). */
const MIN_1M_BARS = 80;

/** ATM CE/PE instrument cache â€” avoid option-chain storm every tick. */
let atmLegCache: {
  at: number;
  anchorSpot: number;
  atmStrike: number;
  expiry: string | null;
  ce: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string };
  pe: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string };
} | null = null;
const ATM_CACHE_TTL_MS = 3 * 60_000;

function defaultSettings(): NexusPulseSettings {
  return {
    activeLanes: [...DEFAULT_ACTIVE_LANES],
    stopAfterLossEnabled: false,
    stopAfterLossInr: 3000,
  };
}

function normalizeSession(session: NexusPulseSession): NexusPulseSession {
  const raw = session as NexusPulseSession & { settings?: Partial<NexusPulseSettings>; guard?: NexusPulseSession['guard'] };
  return {
    ...session,
    settings: {
      ...defaultSettings(),
      ...raw.settings,
      activeLanes: Array.isArray(raw.settings?.activeLanes) && raw.settings.activeLanes.length
        ? raw.settings.activeLanes.filter((x): x is NexusLaneId => x === 'current_bans' || x === 'morning_open_stop_15')
        : [...DEFAULT_ACTIVE_LANES],
    },
    guard: raw.guard ?? { blockedNewEntries: false, reason: null, dayNetAtDecision: 0 },
  };
}

function sessionDayNet(session: NexusPulseSession): number {
  const realized = session.closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const unrealized = session.openTrades.reduce((s, t) => {
    const mark = t.markPremium ?? t.entryPremium;
    const gross = (mark - t.entryPremium) * t.qty * t.lotSize;
    return s + gross - NEXUS_PULSE_RULES.roundTripCostInr;
  }, 0);
  return Math.round((realized + unrealized) * 100) / 100;
}

function guardState(session: NexusPulseSession): NexusPulseSession['guard'] {
  const dayNet = sessionDayNet(session);
  const limit = Math.max(0, session.settings.stopAfterLossInr || 0);
  if (session.settings.stopAfterLossEnabled && limit > 0 && dayNet <= -limit) {
    return {
      blockedNewEntries: true,
      reason: `Loss guard hit: ${dayNet.toFixed(0)} <= -${limit.toFixed(0)}`,
      dayNetAtDecision: dayNet,
    };
  }
  return { blockedNewEntries: false, reason: null, dayNetAtDecision: dayNet };
}

function shell(sessionDate: string, spot: number): NexusPulseSession {
  const now = new Date().toISOString();
  return {
    sessionDate,
    startedAt: now,
    updatedAt: now,
    spot,
    board: null,
    ut3m: null,
    ut5m: null,
    lastSignal: null,
    settings: defaultSettings(),
    guard: { blockedNewEntries: false, reason: null, dayNetAtDecision: 0 },
    openTrades: [],
    closedTrades: [],
    autoPaused: false,
  };
}

function mergeCandles(a: Candle[], b: Candle[]): Candle[] {
  const map = new Map<string, Candle>();
  for (const c of [...a, ...b]) map.set(c.t, c);
  return [...map.values()].sort((x, y) => x.t.localeCompare(y.t));
}

async function loadOneMinuteCandles(accessToken: string, sessionDate: string): Promise<Candle[]> {
  const now = Date.now();
  if (
    candleCache &&
    now - candleCache.at < CANDLE_TTL_MS &&
    candleCache.candles.length >= MIN_1M_BARS
  ) {
    return candleCache.candles;
  }

  const [hist, intra] = await Promise.all([
    fetchUpstoxHistoricalWindow({
      accessToken,
      instrumentKey: SENSEX_INDEX_INSTRUMENT_KEY,
      unit: 'minutes',
      interval: 1,
      fromDate: dayAdd(sessionDate, -3),
      toDate: dayAdd(sessionDate, -1),
    }),
    fetchUpstoxIntradayCandles({
      accessToken,
      instrumentKey: SENSEX_INDEX_INSTRUMENT_KEY,
      unit: 'minutes',
      interval: 1,
    }),
  ]);

  const candles = mergeCandles(hist.candles || [], intra.candles || []);
  if (candles.length) {
    candleCache = { at: now, candles };
  }
  return candles.length ? candles : candleCache?.candles ?? [];
}

async function liveSensexSpot(accessToken: string, fallback: number): Promise<number> {
  try {
    const quotes = await fetchUpstoxQuotes(accessToken, [SENSEX_INDEX_INSTRUMENT_KEY]);
    const q =
      quotes.find((x) => x.instrumentKey.includes('SENSEX')) ??
      quotes.find((x) => x.symbol.toUpperCase().includes('SENSEX')) ??
      quotes[0];
    if (q && q.lastPrice > 0) return q.lastPrice;
  } catch {
    /* keep fallback */
  }
  return fallback;
}

function legFromQuote(
  meta: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string },
  quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>
): NexusAtmLegQuote | null {
  const key = meta.instrumentKey.replace(/:/g, '|');
  const q = quotes.find(
    (row) =>
      row.instrumentKey.replace(/:/g, '|') === key ||
      (() => {
        const sym = String(row.symbol || '').toUpperCase();
        // Robust strike match: extract digits before CE/PE token (e.g. "NIFTY23900CE").
        const m = sym.match(/(\d{2,7})(?:\s*)?(CE|PE)\b/);
        const strikeFromSym = m ? Number(m[1]) : NaN;
        if (Number.isFinite(strikeFromSym) && strikeFromSym > 0) return strikeFromSym === meta.strike;
        // Fallback: plain contains.
        return sym.includes(String(meta.strike));
      })()
  );
  if (!q || q.lastPrice <= 0) return null;
  return {
    instrumentKey: meta.instrumentKey,
    tradingSymbol: meta.tradingSymbol,
    strike: meta.strike,
    expiry: meta.expiry,
    ltp: q.lastPrice,
    bid: q.bestBid ?? null,
    ask: q.bestAsk ?? null,
  };
}

/** Refresh ATM CE/PE board (ATM Lab style). Re-resolve strikes when spot drifts. */
export async function refreshAtmBoard(
  accessToken: string,
  spot: number,
  opts?: {
    fastQuotes?: boolean;
    allowReselect?: boolean;
    lockedCe?: boolean;
    lockedPe?: boolean;
    lockedCeMeta?: NexusAtmLegQuote | null;
    lockedPeMeta?: NexusAtmLegQuote | null;
  }
): Promise<NexusAtmBoard> {
  const now = Date.now();
  const needResolve =
    !atmLegCache ||
    now - atmLegCache.at > ATM_CACHE_TTL_MS ||
    Math.abs(spot - atmLegCache.anchorSpot) >= NEXUS_PULSE_RULES.atmReselectSpotDrift;

  if (needResolve && spot > 0) {
    const picked = await pickSensexOptions({
      accessToken,
      spot,
      wantedSide: 'CE',
    });
    const ce = picked.candidates.find((c) => c.side === 'CE');
    const pe = picked.candidates.find((c) => c.side === 'PE');
    if (ce && pe) {
      atmLegCache = {
        at: now,
        anchorSpot: spot,
        atmStrike: ce.strike,
        expiry: picked.expiry ?? ce.expiry ?? null,
        ce: {
          instrumentKey: ce.instrumentKey,
          tradingSymbol: ce.tradingSymbol,
          strike: ce.strike,
          expiry: ce.expiry,
        },
        pe: {
          instrumentKey: pe.instrumentKey,
          tradingSymbol: pe.tradingSymbol,
          strike: pe.strike,
          expiry: pe.expiry,
        },
      };
    }
  }

  if (!atmLegCache) {
    return {
      spot,
      atmStrike: spot > 0 ? Math.round(spot / NEXUS_PULSE_RULES.strikeStep) * NEXUS_PULSE_RULES.strikeStep : 0,
      expiry: null,
      ce: null,
      pe: null,
      quotedAt: new Date().toISOString(),
      note: 'ATM CE/PE not resolved yet â€” check Upstox option chain',
    };
  }

  // If a trade is already open on CE/PE, force the board's strike keys to match it.
  if (opts?.lockedCe && opts.lockedCeMeta) {
    atmLegCache.ce = {
      instrumentKey: opts.lockedCeMeta.instrumentKey,
      tradingSymbol: opts.lockedCeMeta.tradingSymbol,
      strike: opts.lockedCeMeta.strike,
      expiry: opts.lockedCeMeta.expiry,
    };
  }
  if (opts?.lockedPe && opts.lockedPeMeta) {
    atmLegCache.pe = {
      instrumentKey: opts.lockedPeMeta.instrumentKey,
      tradingSymbol: opts.lockedPeMeta.tradingSymbol,
      strike: opts.lockedPeMeta.strike,
      expiry: opts.lockedPeMeta.expiry,
    };
  }

  const keys = [
    SENSEX_INDEX_INSTRUMENT_KEY,
    atmLegCache.ce.instrumentKey,
    atmLegCache.pe.instrumentKey,
  ];
  const quoteOpts = opts?.fastQuotes ? { maxCacheAgeMs: 700 } : undefined;
  const quotes = await fetchUpstoxQuotes(accessToken, keys, quoteOpts);
  const niftyQ =
    quotes.find((x) => x.instrumentKey.includes('SENSEX')) ??
    quotes.find((x) => x.symbol.toUpperCase().includes('SENSEX'));
  const liveSpot = niftyQ && niftyQ.lastPrice > 0 ? niftyQ.lastPrice : spot;
  const ce = legFromQuote(atmLegCache.ce, quotes);
  const pe = legFromQuote(atmLegCache.pe, quotes);

  const lockedCe = Boolean(opts?.lockedCe);
  const lockedPe = Boolean(opts?.lockedPe);

  const ceNeedsShift = Boolean(ce && ce.ltp < NEXUS_PULSE_RULES.minPremiumFloor && !lockedCe);
  const peNeedsShift = Boolean(pe && pe.ltp < NEXUS_PULSE_RULES.minPremiumFloor && !lockedPe);

  if (opts?.allowReselect !== false && (ceNeedsShift || peNeedsShift)) {
    const picked = await pickSensexOptions({
      accessToken,
      spot: liveSpot,
      wantedSide: 'CE',
    });
    const nextCe = picked.candidates.find((c) => c.side === 'CE') ?? null;
    const nextPe = picked.candidates.find((c) => c.side === 'PE') ?? null;

    if (ceNeedsShift && nextCe) {
      atmLegCache.ce = {
        instrumentKey: nextCe.instrumentKey,
        tradingSymbol: nextCe.tradingSymbol,
        strike: nextCe.strike,
        expiry: nextCe.expiry,
      };
    }
    if (peNeedsShift && nextPe) {
      atmLegCache.pe = {
        instrumentKey: nextPe.instrumentKey,
        tradingSymbol: nextPe.tradingSymbol,
        strike: nextPe.strike,
        expiry: nextPe.expiry,
      };
    }

    atmLegCache.at = now;
    atmLegCache.anchorSpot = liveSpot;
    return refreshAtmBoard(accessToken, liveSpot, { ...opts, allowReselect: false });
  }

  return {
    spot: liveSpot,
    atmStrike: atmLegCache.atmStrike,
    expiry: atmLegCache.expiry,
    ce,
    pe,
    quotedAt: new Date().toISOString(),
  };
}

/** Fast terminal quotes only â€” no Sector 7 B candle / entry logic. */
export async function quoteNexusBBoardOnly(
  accessToken: string
): Promise<{ board: NexusAtmBoard; spot: number; latencyMs: number }> {
  const t0 = Date.now();
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  let hint = existing?.spot || existing?.board?.spot || 0;
  if (hint <= 0) {
    hint = await liveSensexSpot(accessToken, 0);
  }
  const board = await refreshAtmBoard(accessToken, hint > 0 ? hint : 0, {
    fastQuotes: true,
  });
  if (existing && board.spot > 0) {
    await saveNexusSession({
      ...existing,
      spot: board.spot,
      board,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }
  return { board, spot: board.spot, latencyMs: Date.now() - t0 };
}

export async function initNexusBSession(accessToken: string): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  if (existing) return tickNexusBSession(accessToken, normalizeSession(existing));

  const spot = await liveSensexSpot(accessToken, 0);
  const session = shell(sessionDate, spot);
  await saveNexusSession(session);
  return tickNexusBSession(accessToken, session);
}

export async function tickNexusBSession(
  accessToken: string,
  sessionIn?: NexusPulseSession
): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  let session = normalizeSession(
    sessionIn ?? (await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0)
  );

  // Warm Sector 7 B with prior days + today; quote Sensex for true live spot.
  const oneMin = await loadOneMinuteCandles(accessToken, sessionDate);
  const candleSpot = oneMin.length ? oneMin[oneMin.length - 1].close : session.spot;
  let spot = await liveSensexSpot(accessToken, candleSpot);
  const candles3m = resampleMinutes(oneMin, 3);
  const candles5m = resampleMinutes(oneMin, 5);

  // ATM Labâ€“style board: Sensex + ATM CE/PE LTP every tick
  let board: NexusAtmBoard | null = session.board ?? null;
  try {
    const ceOpen = session.openTrades.some((t) => t.status === 'open' && t.side === 'CE');
    const peOpen = session.openTrades.some((t) => t.status === 'open' && t.side === 'PE');
    const ceTrade = session.openTrades.find((t) => t.status === 'open' && t.side === 'CE') ?? null;
    const peTrade = session.openTrades.find((t) => t.status === 'open' && t.side === 'PE') ?? null;

    board = await refreshAtmBoard(accessToken, spot > 0 ? spot : candleSpot, {
      lockedCe: ceOpen,
      lockedPe: peOpen,
      lockedCeMeta: ceTrade
        ? {
            instrumentKey: ceTrade.instrumentKey,
            tradingSymbol: ceTrade.tradingSymbol,
            strike: ceTrade.strike,
            expiry: ceTrade.expiry,
            ltp: ceTrade.markPremium ?? ceTrade.entryPremium,
            bid: null,
            ask: null,
          }
        : null,
      lockedPeMeta: peTrade
        ? {
            instrumentKey: peTrade.instrumentKey,
            tradingSymbol: peTrade.tradingSymbol,
            strike: peTrade.strike,
            expiry: peTrade.expiry,
            ltp: peTrade.markPremium ?? peTrade.entryPremium,
            bid: null,
            ask: null,
          }
        : null,
    });
    if (board.spot > 0) spot = board.spot;
  } catch {
    /* keep previous board */
  }

  const quoteKeys = new Set<string>();
  for (const t of session.openTrades) quoteKeys.add(t.instrumentKey);

  const quotes = quoteKeys.size ? await fetchUpstoxQuotes(accessToken, [...quoteKeys]) : [];

  const { decision, ut3m, ut5m } = evaluateUtV2Entry({
    candles3m,
    candles5m,
  });

  const ltpMap = new Map<string, number>();
  for (const t of session.openTrades) {
    const key = t.instrumentKey.replace(/:/g, '|');
    const q = quotes.find(
      (row) =>
        row.instrumentKey.replace(/:/g, '|') === key ||
        row.symbol.toUpperCase().includes(String(t.strike))
    );
    if (q && q.lastPrice > 0) ltpMap.set(t.instrumentKey, q.lastPrice);
  }

  const pos5m = ut5m.last?.pos ?? 0;

  const bars3Edge = runUtBot(candles3m, NEXUS_UT_3M);
  const last3Edge = bars3Edge.length ? bars3Edge[bars3Edge.length - 1] : null;
  const prev3Edge = bars3Edge.length > 1 ? bars3Edge[bars3Edge.length - 2] : null;
  const ut3mSellEdge = Boolean(
    last3Edge &&
      prev3Edge &&
      last3Edge.t !== prev3Edge.t &&
      last3Edge.sell &&
      !prev3Edge.sell
  );
  const ut3mBuyEdge = Boolean(
    last3Edge &&
      prev3Edge &&
      last3Edge.t !== prev3Edge.t &&
      last3Edge.buy &&
      !prev3Edge.buy
  );

  let openTrades = [...session.openTrades];
  let closedTrades = [...session.closedTrades];

  const { stillOpen, closed } = updateOpenTrades(openTrades, ltpMap, {
    ut3mSellEdge,
    ut3mBuyEdge,
    pos5m: pos5m as -1 | 0 | 1,
    forceFlat: laneForceFlatAt('morning_open_stop_15'),
    squareOff: shouldSquareOffAll(),
  });
  openTrades = stillOpen;
  closedTrades.push(...closed);

  session = { ...session, openTrades, closedTrades };
  const guard = guardState(session);

  if (!guard.blockedNewEntries && !session.autoPaused && decision.side !== 'FLAT' && decision.new3mEdge) {
    const lanesNeedingEntry = session.settings.activeLanes.filter((laneId) => {
      if (openTrades.some((t) => t.laneId === laneId && t.status === 'open')) return false;
      return laneEntryAllowed(laneId).ok;
    });

    if (lanesNeedingEntry.length) {
      // One option pick for both lanes â€” not 2Ã— chain/quote storm
      const { picked } = await pickSensexOptions({
        accessToken,
        spot,
        wantedSide: decision.side,
      });
      if (picked) {
        for (const laneId of lanesNeedingEntry) {
          openTrades.push(
            openNexusPaperTrade({
              laneId,
              side: decision.side,
              instrumentKey: picked.instrumentKey,
              tradingSymbol: picked.tradingSymbol,
              strike: picked.strike,
              expiry: picked.expiry,
              entryPremium: picked.premium,
              entrySpot: spot,
              lotSize: picked.lotSize || NEXUS_PULSE_RULES.sensexLotSize,
            })
          );
        }
      }
    }
  }

  session = {
    ...session,
    updatedAt: new Date().toISOString(),
    spot,
    board,
    ut3m,
    ut5m,
    lastSignal: decision,
    guard: guardState({ ...session, openTrades, closedTrades }),
    openTrades,
    closedTrades,
  };

  await saveNexusSession(session);

  // Durable dated archive (separate from session file) â€” paper now; live when enabled.
  const mode = NEXUS_PULSE_RULES.liveOrdersAllowed ? 'live' : 'paper';
  await archiveClosedTrades({
    sessionDate: session.sessionDate,
    mode: 'paper',
    trades: session.closedTrades,
  }).catch(() => undefined);
  if (mode === 'live') {
    await archiveClosedTrades({
      sessionDate: session.sessionDate,
      mode: 'live',
      trades: session.closedTrades,
    }).catch(() => undefined);
  }

  return session;
}

export function nexusBLaneLabels(): typeof NEXUS_LANES {
  return NEXUS_LANES;
}

export { getBearerToken };

export async function updateNexusBSettings(
  sessionDate: string,
  patch: Partial<NexusPulseSettings>
): Promise<NexusPulseSession> {
  const session = normalizeSession((await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0));
  const activeLanes = Array.isArray(patch.activeLanes)
    ? patch.activeLanes.filter((x): x is NexusLaneId => x === 'current_bans' || x === 'morning_open_stop_15')
    : session.settings.activeLanes;
  session.settings = {
    ...session.settings,
    ...patch,
    activeLanes: activeLanes.length ? activeLanes : [...DEFAULT_ACTIVE_LANES],
    stopAfterLossInr: Math.max(0, Number(patch.stopAfterLossInr ?? session.settings.stopAfterLossInr) || 0),
  };
  session.guard = guardState(session);
  await saveNexusSession(session);
  return session;
}

export async function resetNexusBPaperSession(
  sessionDate: string
): Promise<NexusPulseSession> {
  const existing = normalizeSession((await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0));
  const next: NexusPulseSession = {
    ...shell(sessionDate, existing.spot || 0),
    board: existing.board ?? null,
    settings: existing.settings,
    guard: guardState({
      ...existing,
      openTrades: [],
      closedTrades: [],
      board: existing.board ?? null,
    }),
  };
  await saveNexusSession(next);
  await clearArchiveDay('paper', sessionDate).catch(() => undefined);
  return next;
}
