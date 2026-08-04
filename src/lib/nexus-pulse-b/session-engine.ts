/**
 * NexusPulse Sector 7 B session tick — Sensex Sector 7 B signals + dual-lane paper (isolated from Sector 7 A).
 * Rate-aware: Sensex 1m candles + quotes; Sensex option quotes when in trade.
 */

import { fetchUpstoxQuotes, getBearerToken } from '@/lib/upstox-market';
import {
  fetchUpstoxHistoricalWindow,
  fetchUpstoxIntradayCandles,
} from '@/lib/upstox-historical';
import { pickSensexOptions, sensexPremiumInEntryBand } from '@/lib/nexus-pulse-b/option-picker';
import { dayAdd, istDate } from '@/lib/pinax-forge/ist';
import {
  laneEntryAllowed,
  laneForceFlatAt,
  shouldSquareOffAll,
} from '@/lib/nexus-pulse/lanes';
import { openNexusPaperTrade, paintDisplayMark, updateOpenTrades } from '@/lib/nexus-pulse/paper-broker';
import {
  NEXUS_B_LANES as NEXUS_LANES,
  NEXUS_PULSE_B_RULES as NEXUS_PULSE_RULES,
  NEXUS_B_UT_3M as NEXUS_UT_3M,
  NEXUS_B_UT_5M as NEXUS_UT_5M,
  SENSEX_INDEX_INSTRUMENT_KEY,
  type NexusBLaneId as NexusLaneId,
} from '@/lib/nexus-pulse-b/rules';
import { lastClosedBar, resampleMinutes } from '@/lib/nexus-pulse/resample';
import {
  fillMarksFromStudyOptionTape,
  isTfBarFullyClosed,
  studyOptionPremiumAt,
} from '@/lib/nexus-pulse/study-option-marks';
import {
  lastClosedTfAtOrBefore,
  studyDaySession1m,
  studyWantSide,
  studyWarmupReady,
} from '@/lib/nexus-pulse/study-parity';
import { evaluateUtV2Entry } from '@/lib/nexus-pulse/signals';
import { runUtBot } from '@/lib/nexus-pulse/ut-bot';
import { loadNexusBSession as loadNexusSession, saveNexusBSession as saveNexusSession } from '@/lib/nexus-pulse-b/session-store';
import {
  archiveNexusBClosedTrades as archiveClosedTrades,
  clearNexusBArchiveDay as clearArchiveDay,
  loadNexusBArchiveDay as loadArchiveDay,
} from '@/lib/nexus-pulse-b/trade-archive';
import type { NexusAtmBoard, NexusAtmLegQuote, NexusPulseSession, NexusPulseSettings } from '@/lib/nexus-pulse-b/types';
import type { Candle } from '@/lib/nejoic';

const DEFAULT_ACTIVE_LANES: NexusLaneId[] = ['morning_open_stop_15'];

/**
 * If the desk session lost closedTrades (board/tick race) but archive still
 * has them, merge archive back. Clear paper also clears archive, so this
 * does not undo an intentional wipe.
 */
async function hydrateClosedFromArchive(
  session: NexusPulseSession
): Promise<NexusPulseSession> {
  try {
    const day = await loadArchiveDay('paper', session.sessionDate);
    const archived = (day.trades || []).filter((t) => t.status === 'closed');
    if (!archived.length) return session;
    const byId = new Map(session.closedTrades.map((t) => [t.id, t]));
    let added = 0;
    for (const t of archived) {
      if (byId.has(t.id)) continue;
      byId.set(t.id, t);
      added += 1;
    }
    if (!added) return session;
    const closedTrades = Array.from(byId.values()).sort((a, b) =>
      String(a.closedAt || a.openedAt).localeCompare(String(b.closedAt || b.openedAt))
    );
    return { ...session, closedTrades };
  } catch {
    return session;
  }
}

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

function openTradesHaveKeys(trades: { instrumentKey: string }[]): boolean {
  return trades.some((t) => Boolean(t.instrumentKey));
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

/** Parse strike+side from Upstox symbols like "SENSEX 77400 PE" or "SENSEX26804277400PE". */
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
    /** Skip option-chain pick — only quote existing/seeded/locked legs (fast Start). */
    quotesOnly?: boolean;
    seedFromBoard?: NexusAtmBoard | null;
    lockedCe?: boolean;
    lockedPe?: boolean;
    lockedCeMeta?: NexusAtmLegQuote | null;
    lockedPeMeta?: NexusAtmLegQuote | null;
  }
): Promise<NexusAtmBoard> {
  const now = Date.now();

  // Warm cache from last saved board so Start doesn't re-pick the full Sensex chain.
  if (!atmLegCache && opts?.seedFromBoard?.ce && opts?.seedFromBoard?.pe) {
    atmLegCache = {
      at: now,
      anchorSpot: opts.seedFromBoard.spot || spot,
      atmStrike: opts.seedFromBoard.atmStrike || opts.seedFromBoard.ce.strike,
      expiry: opts.seedFromBoard.expiry ?? opts.seedFromBoard.ce.expiry ?? null,
      ce: metaFromLeg(opts.seedFromBoard.ce),
      pe: metaFromLeg(opts.seedFromBoard.pe),
    };
  }

  const needResolve =
    !opts?.quotesOnly &&
    (!atmLegCache ||
      now - atmLegCache.at > ATM_CACHE_TTL_MS ||
      Math.abs(spot - atmLegCache.anchorSpot) >= NEXUS_PULSE_RULES.atmReselectSpotDrift);

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
        atmStrike: Math.round(spot / NEXUS_PULSE_RULES.strikeStep) * NEXUS_PULSE_RULES.strikeStep,
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

  // Open trades must seed the board even when the option-chain pick failed.
  if (!atmLegCache && (opts?.lockedCeMeta || opts?.lockedPeMeta)) {
    const ceLock = opts.lockedCeMeta;
    const peLock = opts.lockedPeMeta;
    const step = NEXUS_PULSE_RULES.strikeStep;
    if (ceLock && peLock) {
      atmLegCache = {
        at: now,
        anchorSpot: spot,
        atmStrike: Math.round(spot / step) * step || ceLock.strike,
        expiry: ceLock.expiry ?? peLock.expiry ?? null,
        ce: metaFromLeg(ceLock),
        pe: metaFromLeg(peLock),
      };
    } else if (ceLock || peLock) {
      const locked = (ceLock ?? peLock)!;
      const picked = spot > 0
        ? await pickSensexOptions({ accessToken, spot, wantedSide: ceLock ? 'PE' : 'CE' })
        : null;
      const other = picked?.candidates.find((c) => c.side === (ceLock ? 'PE' : 'CE'));
      if (other) {
        atmLegCache = {
          at: now,
          anchorSpot: spot,
          atmStrike: Math.round(spot / step) * step || locked.strike,
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
      atmStrike: spot > 0 ? Math.round(spot / NEXUS_PULSE_RULES.strikeStep) * NEXUS_PULSE_RULES.strikeStep : 0,
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
  let ce = legFromQuote(atmLegCache.ce, quotes);
  let pe = legFromQuote(atmLegCache.pe, quotes);

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

  // Study-aligned: keep strict ATM — do not walk for ₹250–300 band.
  const allowBandWalk = !NEXUS_PULSE_RULES.matchRealOptionStudy;
  const ceNeedsShift = Boolean(
    allowBandWalk &&
      ce &&
      ce.ltp > 0 &&
      (ce.ltp < NEXUS_PULSE_RULES.premiumBandMin || ce.ltp > NEXUS_PULSE_RULES.premiumBandMax) &&
      !lockedCe
  );
  const peNeedsShift = Boolean(
    allowBandWalk &&
      pe &&
      pe.ltp > 0 &&
      (pe.ltp < NEXUS_PULSE_RULES.premiumBandMin || pe.ltp > NEXUS_PULSE_RULES.premiumBandMax) &&
      !lockedPe
  );

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

/** Fast terminal quotes only — no Sector 7 B candle / entry logic. */
export async function quoteNexusBBoardOnly(
  accessToken: string,
  opts?: { allowResolve?: boolean }
): Promise<{ board: NexusAtmBoard; spot: number; latencyMs: number }> {
  const t0 = Date.now();
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  const live = await liveSensexSpot(accessToken, existing?.spot || existing?.board?.spot || 0);
  const hint = live > 0 ? live : existing?.spot || existing?.board?.spot || 0;
  const ceTrade = existing?.openTrades.find((t) => t.status === 'open' && t.side === 'CE') ?? null;
  const peTrade = existing?.openTrades.find((t) => t.status === 'open' && t.side === 'PE') ?? null;
  const hasSeed = Boolean(existing?.board?.ce && existing?.board?.pe) || Boolean(ceTrade || peTrade);
  const quotesOnly = opts?.allowResolve === true ? false : hasSeed;
  const board = await refreshAtmBoard(accessToken, hint > 0 ? hint : 0, {
    fastQuotes: true,
    quotesOnly,
    allowReselect: !quotesOnly,
    seedFromBoard: existing?.board ?? null,
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
  // Do NOT persist session from board poll — concurrent /tick fills/closes were
  // getting wiped by stale full-session rewrites. Board is returned to the client;
  // /tick and /init own durable session writes.
  return { board, spot: board.spot, latencyMs: Date.now() - t0 };
}

export async function initNexusBSession(accessToken: string): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  // Fast Start: do NOT run full candle tick here — Upstox rate-limits make that hang
  // the UI for minutes. Board quotes only; strategy tick catches up via /tick poll.
  let base = normalizeSession(existing ?? shell(sessionDate, 0));
  base = await hydrateClosedFromArchive(base);
  if (!existing || base.closedTrades.length !== (existing.closedTrades?.length ?? 0)) {
    await saveNexusSession(base);
  }
  try {
    const { board, spot } = await quoteNexusBBoardOnly(accessToken, {
      allowResolve: !(existing?.board?.ce && existing?.board?.pe),
    });
    // Prefer disk latest after board quote (may have concurrent tick fills).
    let latest = (await loadNexusSession(sessionDate)) ?? base;
    latest = await hydrateClosedFromArchive(latest);
    const next: NexusPulseSession = {
      ...latest,
      spot: spot > 0 ? spot : latest.spot,
      board,
      updatedAt: new Date().toISOString(),
    };
    await saveNexusSession(next);
    return next;
  } catch {
    return base;
  }
}

export async function tickNexusBSession(
  accessToken: string,
  sessionIn?: NexusPulseSession
): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  let session = normalizeSession(
    sessionIn ?? (await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0)
  );
  session = await hydrateClosedFromArchive(session);

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

  // Study parity: same-day session 1m only + fully closed 3m/5m (no half-built 5m flicker).
  const day1m = studyDaySession1m(oneMin, sessionDate);
  const bars3Study = runUtBot(resampleMinutes(day1m, 3), NEXUS_UT_3M);
  const bars5Study = runUtBot(resampleMinutes(day1m, 5), NEXUS_UT_5M);
  const closed1m = lastClosedBar(day1m.length ? day1m : oneMin, 1);
  const t1 = closed1m?.t ?? null;
  const tsMs = t1 ? new Date(t1).getTime() : Date.now();
  const last3Study = lastClosedTfAtOrBefore(bars3Study, 3, tsMs);
  const last5Study = lastClosedTfAtOrBefore(bars5Study, 5, tsMs);
  const t3 = last3Study?.t ?? null;
  const buy3 = Boolean(last3Study?.buy);
  const sell3 = Boolean(last3Study?.sell);
  const pos5m = (last5Study?.pos ?? 0) as -1 | 0 | 1;
  let lastConsumed3mTs = session.lastConsumed3mTs ?? null;
  let lastExitEval1mTs = session.lastExitEval1mTs ?? null;
  const fresh3m = Boolean(t3 && t3 !== lastConsumed3mTs);
  const warmedUp = studyWarmupReady(day1m, t1);

  const newClosed1m = Boolean(t1 && t1 !== lastExitEval1mTs);
  const sq = shouldSquareOffAll();
  const forceFlat = laneForceFlatAt('morning_open_stop_15');
  const studyExitsEnabled = newClosed1m || sq || forceFlat;
  const strictStudy = NEXUS_PULSE_RULES.matchRealOptionStudy;

  const markMap = new Map<string, number>();
  if (studyExitsEnabled && openTradesHaveKeys(session.openTrades) && t1) {
    await fillMarksFromStudyOptionTape(accessToken, markMap, session.openTrades, {
      day: sessionDate,
      tsMs,
    });
  }
  if (sq || forceFlat || !strictStudy) {
    for (const [k, v] of ltpMap) {
      if (!markMap.has(k) && v > 0) markMap.set(k, v);
    }
  }

  let openTrades = [...session.openTrades];
  let closedTrades = [...session.closedTrades];

  const { stillOpen, closed } = updateOpenTrades(openTrades, markMap, {
    ut3mSellEdge: studyExitsEnabled && fresh3m && sell3,
    ut3mBuyEdge: studyExitsEnabled && fresh3m && buy3,
    pos5m: studyExitsEnabled && fresh3m ? pos5m : 0,
    forceFlat,
    squareOff: sq,
    studyExitsEnabled,
  });
  openTrades = stillOpen.map((t) => {
    const ltp = ltpMap.get(t.instrumentKey);
    return ltp && ltp > 0 ? paintDisplayMark(t, ltp) : t;
  });
  closedTrades.push(...closed);
  if (newClosed1m && t1) lastExitEval1mTs = t1;

  if (t3 && closed.some((c) => c.exitReason === 'UT_3M')) {
    lastConsumed3mTs = t3;
  }

  session = { ...session, openTrades, closedTrades, lastConsumed3mTs, lastExitEval1mTs };
  const guard = guardState(session);

  const freshForEntry = Boolean(t3 && t3 !== lastConsumed3mTs);
  const t3Confirmed = Boolean(t3 && isTfBarFullyClosed(t3, 3));
  const aligned = studyWantSide({ buy3, sell3, pos5: pos5m });
  const wantSide: 'CE' | 'PE' | null =
    newClosed1m && warmedUp && t3Confirmed && freshForEntry ? aligned : null;

  if (!guard.blockedNewEntries && !session.autoPaused && wantSide) {
    const lanesNeedingEntry = session.settings.activeLanes.filter((laneId) => {
      if (openTrades.some((t) => t.laneId === laneId && t.status === 'open')) return false;
      return laneEntryAllowed(laneId).ok;
    });

    if (lanesNeedingEntry.length) {
      const { picked } = await pickSensexOptions({
        accessToken,
        spot,
        wantedSide: wantSide,
        strictAtm: NEXUS_PULSE_RULES.matchRealOptionStudy,
      });
      if (picked?.instrumentKey && t1) {
        const entryPremiumRaw = await studyOptionPremiumAt({
          accessToken,
          instrumentKey: picked.instrumentKey,
          day: sessionDate,
          tsMs,
        });
        const entryPremium = strictStudy
          ? entryPremiumRaw && entryPremiumRaw > 0
            ? entryPremiumRaw
            : 0
          : entryPremiumRaw && entryPremiumRaw > 0
            ? entryPremiumRaw
            : picked.premium;
        if (entryPremium > 0 && sensexPremiumInEntryBand(entryPremium)) {
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
                lotSize: picked.lotSize || NEXUS_PULSE_RULES.sensexLotSize,
              })
            );
          }
          if (t3) lastConsumed3mTs = t3;
        }
      }
    }
  }

  const studyDecision =
    wantSide != null
      ? {
          ...decision,
          side: wantSide,
          reason:
            wantSide === 'CE'
              ? 'Sector 7 B: 3m Buy + 5m long → long CE (study bar)'
              : 'Sector 7 B: 3m Sell + 5m short → long PE (study bar)',
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
          reason: !warmedUp
            ? 'Sector 7 B: study warm-up (first 40×1m bars — no entries yet)'
            : !t3Confirmed
              ? 'Sector 7 B: waiting for 3m bar to close (study-confirmed signal)'
              : !freshForEntry
                ? 'Sector 7 B: 3m bar already consumed (study gate)'
                : 'No aligned Sector 7 B entry',
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
