/**
 * NexusPulse session tick — Sector 7 A signals + dual-lane paper (isolated).
 * Rate-aware: 1m candles (hist warmup + intraday), Nifty quote for live spot, option quotes only when in trade.
 */

import { fetchUpstoxQuotes, getBearerToken } from '@/lib/upstox-market';
import {
  fetchUpstoxHistoricalWindow,
  fetchUpstoxIntradayCandles,
  NIFTY_INDEX_INSTRUMENT_KEY,
} from '@/lib/upstox-historical';
import { pickPinaxOptions } from '@/lib/pinax-forge/option-picker';
import { dayAdd, istDate } from '@/lib/pinax-forge/ist';
import {
  laneEntryAllowed,
  laneForceFlatAt,
  shouldSquareOffAll,
} from '@/lib/nexus-pulse/lanes';
import { openNexusPaperTrade, updateOpenTrades } from '@/lib/nexus-pulse/paper-broker';
import { NEXUS_LANES, NEXUS_PULSE_RULES, NEXUS_UT_3M, NEXUS_UT_5M, type NexusLaneId } from '@/lib/nexus-pulse/rules';
import { lastClosedBar, resampleMinutes } from '@/lib/nexus-pulse/resample';
import { evaluateUtV2Entry } from '@/lib/nexus-pulse/signals';
import { runUtBot } from '@/lib/nexus-pulse/ut-bot';
import { loadNexusSession, saveNexusSession } from '@/lib/nexus-pulse/session-store';
import { archiveClosedTrades, clearArchiveDay } from '@/lib/nexus-pulse/trade-archive';
import type { NexusAtmBoard, NexusAtmLegQuote, NexusPulseSession, NexusPulseSettings } from '@/lib/nexus-pulse/types';
import type { Candle } from '@/lib/nejoic';

const DEFAULT_ACTIVE_LANES: NexusLaneId[] = ['morning_open_stop_15'];

/** Cache 1m Nifty candles ~45s — need closed bars for Sector 7 A. */
let candleCache: { at: number; candles: Candle[] } | null = null;
const CANDLE_TTL_MS = 45_000;
/** Sector 7 A needs enough 1m history (ATR warm-up). */
const MIN_1M_BARS = 80;

/** ATM CE/PE instrument cache — avoid option-chain storm every tick. */
let atmLegCache: {
  at: number;
  anchorSpot: number;
  atmStrike: number;
  expiry: string | null;
  ce: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string };
  pe: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string };
} | null = null;
const ATM_CACHE_TTL_MS = 3 * 60_000;

function openTradesHaveKeys(trades: { instrumentKey: string }[]): boolean {
  return trades.some((t) => Boolean(t.instrumentKey));
}

/** Use last closed 1m option candle close as mark (study tape.premiumAt style). */
async function fillMarksFromOption1mClose(
  accessToken: string,
  markMap: Map<string, number>,
  trades: { instrumentKey: string }[]
): Promise<void> {
  const keys = [...new Set(trades.map((t) => t.instrumentKey).filter(Boolean))];
  await Promise.all(
    keys.map(async (instrumentKey) => {
      try {
        const { candles } = await fetchUpstoxIntradayCandles({
          accessToken,
          instrumentKey,
          unit: 'minutes',
          interval: 1,
        });
        const closed = lastClosedBar(candles, 1);
        if (closed && closed.close > 0) markMap.set(instrumentKey, closed.close);
      } catch {
        /* keep quote LTP fallback already in map */
      }
    })
  );
}

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
    lastConsumed3mTs: session.lastConsumed3mTs ?? null,
    lastExitEval1mTs: session.lastExitEval1mTs ?? null,
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
    lastConsumed3mTs: null,
    lastExitEval1mTs: null,
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
      instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
      unit: 'minutes',
      interval: 1,
      fromDate: dayAdd(sessionDate, -3),
      toDate: dayAdd(sessionDate, -1),
    }),
    fetchUpstoxIntradayCandles({
      accessToken,
      instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
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

async function liveNiftySpot(accessToken: string, fallback: number): Promise<number> {
  try {
    const quotes = await fetchUpstoxQuotes(accessToken, [NIFTY_INDEX_INSTRUMENT_KEY]);
    const q =
      quotes.find((x) => x.instrumentKey.includes('Nifty 50')) ??
      quotes.find((x) => x.symbol.toUpperCase().includes('NIFTY')) ??
      quotes[0];
    if (q && q.lastPrice > 0) return q.lastPrice;
  } catch {
    /* keep fallback */
  }
  return fallback;
}

function legSideFromMeta(meta: {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry?: string;
}): 'CE' | 'PE' | null {
  const sym = String(meta.tradingSymbol || meta.instrumentKey || '').toUpperCase();
  if (/\bCE\b/.test(sym) || /CE\s*\d/.test(sym) || /CE$/.test(sym) || sym.endsWith('CE')) return 'CE';
  if (/\bPE\b/.test(sym) || /PE\s*\d/.test(sym) || /PE$/.test(sym) || sym.endsWith('PE')) return 'PE';
  return null;
}

/** Parse strike+side from Upstox symbols like "NIFTY 24200 PE" or "NIFTY2680424200PE". */
function strikeSideFromSymbol(symRaw: string): { strike: number; side: 'CE' | 'PE' } | null {
  const sym = String(symRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const compact = sym.match(/(?:NIFTY|SENSEX|BANKNIFTY)(\d{2})(\d{2})(\d{2})(\d{3,6})(CE|PE)$/);
  if (compact) {
    return { strike: Number(compact[4]), side: compact[5] as 'CE' | 'PE' };
  }
  const spaced = String(symRaw || '')
    .toUpperCase()
    .match(/(\d{3,7})\s*(CE|PE)\b/);
  if (spaced) return { strike: Number(spaced[1]), side: spaced[2] as 'CE' | 'PE' };
  const tail = sym.match(/(\d{3,7})(CE|PE)$/);
  if (tail) return { strike: Number(tail[1]), side: tail[2] as 'CE' | 'PE' };
  return null;
}

function legFromQuote(
  meta: { instrumentKey: string; tradingSymbol: string; strike: number; expiry?: string },
  quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>
): NexusAtmLegQuote | null {
  const key = meta.instrumentKey.replace(/:/g, '|');
  const wantedSide = legSideFromMeta(meta);
  const q = quotes.find((row) => {
    const rowKey = row.instrumentKey.replace(/:/g, '|');
    if (rowKey === key) return true;
    // Upstox often returns map keys like NSE_FO:NIFTY2680424200PE — match token suffix.
    if (key.includes('|') && rowKey.endsWith(key.slice(key.indexOf('|')))) return true;

    const parsed =
      strikeSideFromSymbol(row.symbol) ||
      strikeSideFromSymbol(row.instrumentKey) ||
      null;
    if (!parsed) return false;
    if (parsed.strike !== meta.strike) return false;
    if (wantedSide && parsed.side !== wantedSide) return false;
    return true;
  });
  if (!q) return null;
  const ltp =
    q.lastPrice > 0
      ? q.lastPrice
      : q.bestBid && q.bestAsk
        ? (q.bestBid + q.bestAsk) / 2
        : q.bestAsk || q.bestBid || 0;
  if (ltp <= 0) {
    return {
      instrumentKey: meta.instrumentKey,
      tradingSymbol: meta.tradingSymbol,
      strike: meta.strike,
      expiry: meta.expiry,
      ltp: 0,
      bid: q.bestBid ?? null,
      ask: q.bestAsk ?? null,
    };
  }
  return {
    instrumentKey: meta.instrumentKey,
    tradingSymbol: meta.tradingSymbol,
    strike: meta.strike,
    expiry: meta.expiry,
    ltp,
    bid: q.bestBid ?? null,
    ask: q.bestAsk ?? null,
  };
}

function metaFromLeg(leg: NexusAtmLegQuote): {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  expiry?: string;
} {
  return {
    instrumentKey: leg.instrumentKey,
    tradingSymbol: leg.tradingSymbol,
    strike: leg.strike,
    expiry: leg.expiry,
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
    Math.abs(spot - atmLegCache.anchorSpot) >= 40;

  if (needResolve && spot > 0) {
    const picked = await pickPinaxOptions({
      accessToken,
      spot,
      wantedSide: 'CE',
      minPremiumFloor: NEXUS_PULSE_RULES.minPremiumFloor,
    });
    const ce = picked.candidates.find((c) => c.side === 'CE');
    const pe = picked.candidates.find((c) => c.side === 'PE');
    if (ce && pe) {
      atmLegCache = {
        at: now,
        anchorSpot: spot,
        atmStrike: Math.round(spot / 50) * 50,
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

  // Open trades must seed the board even when the option-chain pick failed —
  // otherwise locks never apply (they used to run only after this early return).
  if (!atmLegCache && (opts?.lockedCeMeta || opts?.lockedPeMeta)) {
    const ceLock = opts.lockedCeMeta;
    const peLock = opts.lockedPeMeta;
    if (ceLock && peLock) {
      atmLegCache = {
        at: now,
        anchorSpot: spot,
        atmStrike: Math.round(spot / 50) * 50 || ceLock.strike,
        expiry: ceLock.expiry ?? peLock.expiry ?? null,
        ce: metaFromLeg(ceLock),
        pe: metaFromLeg(peLock),
      };
    } else if (ceLock || peLock) {
      const locked = (ceLock ?? peLock)!;
      const picked = spot > 0
        ? await pickPinaxOptions({
            accessToken,
            spot,
            wantedSide: ceLock ? 'PE' : 'CE',
            minPremiumFloor: NEXUS_PULSE_RULES.minPremiumFloor,
          })
        : null;
      const other = picked?.candidates.find((c) => c.side === (ceLock ? 'PE' : 'CE'));
      if (other) {
        atmLegCache = {
          at: now,
          anchorSpot: spot,
          atmStrike: Math.round(spot / 50) * 50 || locked.strike,
          expiry: locked.expiry ?? other.expiry ?? null,
          ce: ceLock
            ? metaFromLeg(ceLock)
            : {
                instrumentKey: other.instrumentKey,
                tradingSymbol: other.tradingSymbol,
                strike: other.strike,
                expiry: other.expiry,
              },
          pe: peLock
            ? metaFromLeg(peLock)
            : {
                instrumentKey: other.instrumentKey,
                tradingSymbol: other.tradingSymbol,
                strike: other.strike,
                expiry: other.expiry,
              },
        };
      }
    }
  }

  if (!atmLegCache) {
    return {
      spot,
      atmStrike: spot > 0 ? Math.round(spot / 50) * 50 : 0,
      expiry: null,
      ce: null,
      pe: null,
      quotedAt: new Date().toISOString(),
      note: 'ATM CE/PE not resolved yet - check Upstox option chain',
    };
  }

  // If a trade is already open on CE/PE, force the board's strike keys to match it.
  if (opts?.lockedCe && opts.lockedCeMeta) {
    atmLegCache.ce = metaFromLeg(opts.lockedCeMeta);
  }
  if (opts?.lockedPe && opts.lockedPeMeta) {
    atmLegCache.pe = metaFromLeg(opts.lockedPeMeta);
  }

  const keys = [
    NIFTY_INDEX_INSTRUMENT_KEY,
    atmLegCache.ce.instrumentKey,
    atmLegCache.pe.instrumentKey,
  ];
  const quoteOpts = opts?.fastQuotes ? { maxCacheAgeMs: 700 } : undefined;
  const quotes = await fetchUpstoxQuotes(accessToken, keys, quoteOpts);
  const niftyQ =
    quotes.find((x) => x.instrumentKey.includes('Nifty 50')) ??
    quotes.find((x) => x.symbol.toUpperCase().includes('NIFTY'));
  const liveSpot = niftyQ && niftyQ.lastPrice > 0 ? niftyQ.lastPrice : spot;
  let ce = legFromQuote(atmLegCache.ce, quotes);
  let pe = legFromQuote(atmLegCache.pe, quotes);

  // Keep strike identity on the board even when Upstox omits an option LTP.
  if (!ce) {
    ce = opts?.lockedCeMeta
      ? { ...opts.lockedCeMeta }
      : {
          instrumentKey: atmLegCache.ce.instrumentKey,
          tradingSymbol: atmLegCache.ce.tradingSymbol,
          strike: atmLegCache.ce.strike,
          expiry: atmLegCache.ce.expiry,
          ltp: 0,
          bid: null,
          ask: null,
        };
  }
  if (!pe) {
    pe = opts?.lockedPeMeta
      ? { ...opts.lockedPeMeta }
      : {
          instrumentKey: atmLegCache.pe.instrumentKey,
          tradingSymbol: atmLegCache.pe.tradingSymbol,
          strike: atmLegCache.pe.strike,
          expiry: atmLegCache.pe.expiry,
          ltp: 0,
          bid: null,
          ask: null,
        };
  }

  const lockedCe = Boolean(opts?.lockedCe);
  const lockedPe = Boolean(opts?.lockedPe);

  // Study-aligned: keep strict ATM on the board — do not walk strikes when cheap.
  const allowPremiumWalk =
    !NEXUS_PULSE_RULES.matchRealOptionStudy && NEXUS_PULSE_RULES.minPremiumFloor > 0;
  const ceNeedsShift = Boolean(
    allowPremiumWalk && ce && ce.ltp > 0 && ce.ltp < NEXUS_PULSE_RULES.minPremiumFloor && !lockedCe
  );
  const peNeedsShift = Boolean(
    allowPremiumWalk && pe && pe.ltp > 0 && pe.ltp < NEXUS_PULSE_RULES.minPremiumFloor && !lockedPe
  );

  if (opts?.allowReselect !== false && (ceNeedsShift || peNeedsShift)) {
    const picked = await pickPinaxOptions({
      accessToken,
      spot: liveSpot,
      wantedSide: 'CE',
      minPremiumFloor: NEXUS_PULSE_RULES.minPremiumFloor,
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

/** Fast terminal quotes only — no Sector 7 A candle / entry logic. */
export async function quoteNexusBoardOnly(
  accessToken: string
): Promise<{ board: NexusAtmBoard; spot: number; latencyMs: number }> {
  const t0 = Date.now();
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  const live = await liveNiftySpot(accessToken, existing?.spot || existing?.board?.spot || 0);
  const hint = live > 0 ? live : existing?.spot || existing?.board?.spot || 0;
  const ceTrade = existing?.openTrades.find((t) => t.status === 'open' && t.side === 'CE') ?? null;
  const peTrade = existing?.openTrades.find((t) => t.status === 'open' && t.side === 'PE') ?? null;
  const board = await refreshAtmBoard(accessToken, hint > 0 ? hint : 0, {
    fastQuotes: true,
    lockedCe: Boolean(ceTrade),
    lockedPe: Boolean(peTrade),
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

export async function initNexusSession(accessToken: string): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  // Fast Start: board quotes only — full candle tick runs on /tick poll.
  const base = normalizeSession(existing ?? shell(sessionDate, 0));
  if (!existing) {
    await saveNexusSession(base);
  }
  try {
    const { board, spot } = await quoteNexusBoardOnly(accessToken);
    const next: NexusPulseSession = {
      ...base,
      spot: spot > 0 ? spot : base.spot,
      board,
      updatedAt: new Date().toISOString(),
    };
    await saveNexusSession(next);
    return next;
  } catch {
    return base;
  }
}

export async function tickNexusSession(
  accessToken: string,
  sessionIn?: NexusPulseSession
): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  let session = normalizeSession(
    sessionIn ?? (await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0)
  );

  // Warm Sector 7 A with prior days + today; quote Nifty for true live spot.
  const oneMin = await loadOneMinuteCandles(accessToken, sessionDate);
  const candleSpot = oneMin.length ? oneMin[oneMin.length - 1].close : session.spot;
  let spot = await liveNiftySpot(accessToken, candleSpot);
  const candles3m = resampleMinutes(oneMin, 3);
  const candles5m = resampleMinutes(oneMin, 5);

  // ATM Lab–style board: Nifty + ATM CE/PE LTP every tick
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

  const pos5mSnap = ut5m.last?.pos ?? 0;

  // Closed bars only — ignore in-progress 3m/5m (stops ~50s UT_5M flips from stale candles).
  const bars3Study = runUtBot(candles3m, NEXUS_UT_3M);
  const bars5Study = runUtBot(candles5m, NEXUS_UT_5M);
  const last3Study = lastClosedBar(bars3Study, 3);
  const last5Study = lastClosedBar(bars5Study, 5);
  const t3 = last3Study?.t ?? null;
  const buy3 = Boolean(last3Study?.buy);
  const sell3 = Boolean(last3Study?.sell);
  const pos5m = (last5Study?.pos ?? pos5mSnap) as -1 | 0 | 1;
  let lastConsumed3mTs = session.lastConsumed3mTs ?? null;
  let lastExitEval1mTs = session.lastExitEval1mTs ?? null;
  const fresh3m = Boolean(t3 && t3 !== lastConsumed3mTs);

  // Study decides trail/UT once per closed 1m bar (option close), not every LTP poll.
  const closed1m = lastClosedBar(oneMin, 1);
  const t1 = closed1m?.t ?? null;
  const newClosed1m = Boolean(t1 && t1 !== lastExitEval1mTs);
  const sq = shouldSquareOffAll();
  const forceFlat = laneForceFlatAt('morning_open_stop_15');
  const studyExitsEnabled = newClosed1m || sq || forceFlat;

  // Prefer option 1m candle close as mark when doing study exits (matches PDF engine).
  if (studyExitsEnabled && openTradesHaveKeys(session.openTrades)) {
    await fillMarksFromOption1mClose(accessToken, ltpMap, session.openTrades);
  }

  let openTrades = [...session.openTrades];
  let closedTrades = [...session.closedTrades];

  const { stillOpen, closed } = updateOpenTrades(openTrades, ltpMap, {
    ut3mSellEdge: studyExitsEnabled && fresh3m && sell3,
    ut3mBuyEdge: studyExitsEnabled && fresh3m && buy3,
    pos5m: studyExitsEnabled && fresh3m ? pos5m : 0,
    forceFlat,
    squareOff: sq,
    studyExitsEnabled,
  });
  openTrades = stillOpen;
  closedTrades.push(...closed);
  if (newClosed1m && t1) lastExitEval1mTs = t1;

  // Study: UT_3M exit sets last3mTs and blocks same-bar reverse.
  if (t3 && closed.some((c) => c.exitReason === 'UT_3M')) {
    lastConsumed3mTs = t3;
  }

  session = { ...session, openTrades, closedTrades, lastConsumed3mTs, lastExitEval1mTs };
  const guard = guardState(session);

  // Re-check after UT_3M may have consumed this 3m bar (no reverse on same bar).
  const freshForEntry = Boolean(t3 && t3 !== lastConsumed3mTs);

  // Study entry only on a closed 1m bar + fresh 3m signal (exact PDF loop).
  const wantSide: 'CE' | 'PE' | null =
    newClosed1m && freshForEntry && buy3 && pos5m === 1
      ? 'CE'
      : newClosed1m && freshForEntry && sell3 && pos5m === -1
        ? 'PE'
        : null;

  if (!guard.blockedNewEntries && !session.autoPaused && wantSide) {
    const lanesNeedingEntry = session.settings.activeLanes.filter((laneId) => {
      if (openTrades.some((t) => t.laneId === laneId && t.status === 'open')) return false;
      return laneEntryAllowed(laneId).ok;
    });

    if (lanesNeedingEntry.length) {
      const { picked } = await pickPinaxOptions({
        accessToken,
        spot,
        wantedSide: wantSide,
        minPremiumFloor: NEXUS_PULSE_RULES.minPremiumFloor,
      });
      // Strict ATM: prefer closed 1m option close as entry (study tape), else LTP.
      if (picked && picked.premium > 0) {
        const entryMap = new Map<string, number>([[picked.instrumentKey, picked.premium]]);
        await fillMarksFromOption1mClose(accessToken, entryMap, [
          { instrumentKey: picked.instrumentKey },
        ]);
        const entryPremium = entryMap.get(picked.instrumentKey) || picked.premium;
        if (entryPremium > 0) {
          for (const laneId of lanesNeedingEntry) {
            openTrades.push(
              openNexusPaperTrade({
                laneId,
                side: wantSide,
                instrumentKey: picked.instrumentKey,
                tradingSymbol: picked.tradingSymbol,
                strike: picked.strike,
                expiry: picked.expiry,
                entryPremium,
                entrySpot: spot,
                lotSize: picked.lotSize,
              })
            );
          }
          if (t3) lastConsumed3mTs = t3;
        }
      }
    }
  }

  // Keep lastSignal UI in sync with study-style decision (not only new3mEdge).
  const studyDecision =
    wantSide != null
      ? {
          ...decision,
          side: wantSide,
          reason:
            wantSide === 'CE'
              ? 'Sector 7 A: 3m Buy + 5m long → long CE (study bar)'
              : 'Sector 7 A: 3m Sell + 5m short → long PE (study bar)',
          buy3m: buy3,
          sell3m: sell3,
          pos5m: pos5m as -1 | 0 | 1,
          new3mEdge: freshForEntry && ((buy3 && pos5m === 1) || (sell3 && pos5m === -1)),
        }
      : {
          ...decision,
          side: 'FLAT' as const,
          buy3m: buy3,
          sell3m: sell3,
          pos5m: pos5m as -1 | 0 | 1,
          new3mEdge: false,
          reason: !freshForEntry
            ? 'Sector 7 A: 3m bar already consumed (study gate)'
            : decision.reason,
        };

  session = {
    ...session,
    updatedAt: new Date().toISOString(),
    spot,
    board,
    ut3m,
    ut5m,
    lastSignal: studyDecision,
    lastConsumed3mTs,
    lastExitEval1mTs,
    guard: guardState({ ...session, openTrades, closedTrades }),
    openTrades,
    closedTrades,
  };

  await saveNexusSession(session);

  // Durable dated archive (separate from session file) — paper now; live when enabled.
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

export function nexusLaneLabels(): typeof NEXUS_LANES {
  return NEXUS_LANES;
}

export { getBearerToken };

export async function updateNexusSettings(
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

export async function resetNexusPaperSession(
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
