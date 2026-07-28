/**
 * GoldPulse session — dual-strategy paper desk (15m + 30m).
 */

import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import {
  GOLD_PULSE_RULES,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_LABEL,
  GOLD_YAHOO_SYMBOL,
} from '@/lib/gold-pulse/rules';
import { goldStrategyParams } from '@/lib/gold-pulse/strategies';
import type { GoldStrategyId } from '@/lib/gold-pulse/strategies';
import { openGoldPaperTrade, updateOpenGoldTrades } from '@/lib/gold-pulse/paper-broker';
import { goldEntryRangeOk, goldEntryUtcHourAllowed } from '@/lib/gold-pulse/entry-filters';
import { evaluateGoldUtEntry } from '@/lib/gold-pulse/signals';
import {
  goldSessionDate,
  loadGoldSession,
  saveGoldSession,
} from '@/lib/gold-pulse/session-store';
import {
  archiveGoldClosedTrades,
  clearGoldArchiveDay,
} from '@/lib/gold-pulse/trade-archive';
import type { GoldPulseSession } from '@/lib/gold-pulse/types';
import type { Candle } from '@/lib/nejoic';

let cacheEntry: { at: number; candles: Candle[]; spot: number } | null = null;
let cacheHtf: { at: number; candles: Candle[]; spot: number } | null = null;
const TTL = 45_000;

function normalizeSession(session: GoldPulseSession): GoldPulseSession {
  return {
    ...session,
    paperStrategyId: session.paperStrategyId ?? null,
  };
}

function shell(sessionDate: string, spot: number): GoldPulseSession {
  const now = new Date().toISOString();
  return {
    sessionDate,
    startedAt: now,
    updatedAt: now,
    spot,
    symbol: GOLD_YAHOO_SYMBOL,
    dataSource: 'yahoo',
    paperStrategyId: null,
    utEntry: null,
    utHtf: null,
    lastSignal: null,
    openTrades: [],
    closedTrades: [],
    autoPaused: false,
    lastError: null,
  };
}

async function loadYahooTf(
  interval: '15m' | '30m',
  cache: typeof cacheEntry
): Promise<{ candles: Candle[]; spot: number; cache: NonNullable<typeof cacheEntry> }> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    return { candles: cache.candles, spot: cache.spot, cache };
  }
  const r = await fetchYahooCandles(
    GOLD_YAHOO_SYMBOL,
    interval,
    200,
    GOLD_YAHOO_LABEL,
    '1mo'
  );
  if (!r.ok || !r.candles?.length) {
    if (cache) return { candles: cache.candles, spot: cache.spot, cache };
    throw new Error(r.error || `Yahoo ${interval} failed for ${GOLD_YAHOO_SYMBOL}`);
  }
  const next = {
    at: now,
    candles: r.candles,
    spot: r.spot || r.candles[r.candles.length - 1].close,
  };
  return { candles: next.candles, spot: next.spot, cache: next };
}

export async function setGoldPaperStrategy(
  strategyId: GoldStrategyId | null
): Promise<GoldPulseSession> {
  const sessionDate = goldSessionDate();
  const existing = normalizeSession(
    (await loadGoldSession(sessionDate)) ?? shell(sessionDate, 0)
  );
  const next: GoldPulseSession = {
    ...existing,
    paperStrategyId: strategyId,
    updatedAt: new Date().toISOString(),
  };
  await saveGoldSession(next);
  return next;
}

export async function initGoldSession(): Promise<GoldPulseSession> {
  const sessionDate = goldSessionDate();
  const existing = await loadGoldSession(sessionDate);
  if (existing) return tickGoldSession(normalizeSession(existing));
  const session = shell(sessionDate, 0);
  await saveGoldSession(session);
  return tickGoldSession(session);
}

export async function tickGoldSession(
  sessionIn?: GoldPulseSession
): Promise<GoldPulseSession> {
  const sessionDate = goldSessionDate();
  let session = normalizeSession(
    sessionIn ?? (await loadGoldSession(sessionDate)) ?? shell(sessionDate, 0)
  );

  const paperId = session.paperStrategyId;
  const paperParams = paperId ? goldStrategyParams(paperId) : null;

  try {
    const eEntry = await loadYahooTf('15m', cacheEntry);
    cacheEntry = eEntry.cache;
    const eHtf = await loadYahooTf('30m', cacheHtf);
    cacheHtf = eHtf.cache;

    const spot = eEntry.spot || eHtf.spot || session.spot;
    const { decision, utEntry, utHtf } = evaluateGoldUtEntry({
      candlesEntry: eEntry.candles,
      candlesHtf: eHtf.candles,
    });

    const entryPos = (utEntry.last?.pos ?? 0) as -1 | 0 | 1;
    const htfPos = (utHtf.last?.pos ?? 0) as -1 | 0 | 1;

    const fallbackParams = goldStrategyParams('v12_max');
    const updated = updateOpenGoldTrades(session.openTrades, spot, {
      entryPos,
      htfPos,
      params: paperParams ?? fallbackParams,
    });

    let openTrades = updated.open;
    const closedTrades = [...session.closedTrades, ...updated.closed];

    let side = decision.side;
    if (paperParams) {
      if (side === 'LONG' && paperParams.sideMode === 'SHORT') side = 'FLAT';
      if (side === 'SHORT' && paperParams.sideMode === 'LONG') side = 'FLAT';
    }

    const lastClosedAt = closedTrades.reduce((latest, t) => {
      const ts = t.closedAt ? new Date(t.closedAt).getTime() : 0;
      return ts > latest ? ts : latest;
    }, 0);

    const cooldownOk =
      !paperParams ||
      paperParams.reentryCooldownMs <= 0 ||
      !lastClosedAt ||
      Date.now() - lastClosedAt >= paperParams.reentryCooldownMs;

    const dayOpens =
      closedTrades.filter(
        (t) =>
          t.openedAt?.slice(0, 10) === sessionDate &&
          (!paperId || t.strategyId === paperId)
      ).length + openTrades.length;

    const dayOk =
      !paperParams ||
      paperParams.maxTradesPerDay <= 0 ||
      dayOpens < paperParams.maxTradesPerDay;

    if (
      paperId &&
      paperParams &&
      !session.autoPaused &&
      openTrades.length === 0 &&
      cooldownOk &&
      dayOk &&
      decision.newEntryEdge &&
      (side === 'LONG' || side === 'SHORT') &&
      goldEntryUtcHourAllowed(paperParams) &&
      goldEntryRangeOk(paperParams, eEntry.candles)
    ) {
      openTrades = [
        openGoldPaperTrade({
          side,
          price: spot,
          symbol: GOLD_YAHOO_SYMBOL,
          strategyId: paperId,
          params: paperParams,
        }),
      ];
    }

    session = {
      ...session,
      sessionDate,
      updatedAt: new Date().toISOString(),
      spot,
      utEntry,
      utHtf,
      lastSignal: {
        ...decision,
        side,
        newEntryEdge: decision.newEntryEdge && side !== 'FLAT',
      },
      openTrades,
      closedTrades,
      lastError: null,
    };

    await archiveGoldClosedTrades({
      sessionDate,
      trades: closedTrades,
    }).catch(() => undefined);
  } catch (e) {
    session = {
      ...session,
      updatedAt: new Date().toISOString(),
      lastError: e instanceof Error ? e.message : 'Tick failed',
    };
  }

  await saveGoldSession(session);
  return session;
}

export async function resetGoldPaperSession(
  sessionDate?: string
): Promise<GoldPulseSession> {
  const date = sessionDate || goldSessionDate();
  const existing = await loadGoldSession(date);
  const next = shell(date, existing?.spot || 0);
  next.paperStrategyId = existing ? normalizeSession(existing).paperStrategyId : null;
  await saveGoldSession(next);
  await clearGoldArchiveDay(date).catch(() => undefined);
  return next;
}

export function goldPulsePollMs(session: GoldPulseSession): number {
  return session.openTrades.length
    ? GOLD_PULSE_RULES.tickPollMsInTrade
    : GOLD_PULSE_RULES.tickPollMsFlat;
}

export { GOLD_UT_ENTRY, GOLD_UT_HTF };
