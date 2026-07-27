/**
 * GoldPulse session — Yahoo GC=F 5m + 15m UT paper (isolated agent).
 */

import { fetchYahooCandles } from '@/lib/yahoo-nifty';
import {
  GOLD_PULSE_RULES,
  GOLD_UT_ENTRY,
  GOLD_UT_HTF,
  GOLD_YAHOO_LABEL,
  GOLD_YAHOO_SYMBOL,
} from '@/lib/gold-pulse/rules';
import { openGoldPaperTrade, updateOpenGoldTrades } from '@/lib/gold-pulse/paper-broker';
import { evaluateGoldUtEntry } from '@/lib/gold-pulse/signals';
import {
  goldSessionDate,
  loadGoldSession,
  saveGoldSession,
} from '@/lib/gold-pulse/session-store';
import type { GoldPulseSession } from '@/lib/gold-pulse/types';
import type { Candle } from '@/lib/nejoic';

let cache5: { at: number; candles: Candle[]; spot: number } | null = null;
let cache15: { at: number; candles: Candle[]; spot: number } | null = null;
const TTL = 45_000;

function shell(sessionDate: string, spot: number): GoldPulseSession {
  const now = new Date().toISOString();
  return {
    sessionDate,
    startedAt: now,
    updatedAt: now,
    spot,
    symbol: GOLD_YAHOO_SYMBOL,
    dataSource: 'yahoo',
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
  interval: '5m' | '15m',
  cache: typeof cache5
): Promise<{ candles: Candle[]; spot: number; cache: NonNullable<typeof cache5> }> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    return { candles: cache.candles, spot: cache.spot, cache };
  }
  const r = await fetchYahooCandles(GOLD_YAHOO_SYMBOL, interval, 200, GOLD_YAHOO_LABEL);
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

export async function initGoldSession(): Promise<GoldPulseSession> {
  const sessionDate = goldSessionDate();
  const existing = await loadGoldSession(sessionDate);
  if (existing) return tickGoldSession(existing);
  const session = shell(sessionDate, 0);
  await saveGoldSession(session);
  return tickGoldSession(session);
}

export async function tickGoldSession(
  sessionIn?: GoldPulseSession
): Promise<GoldPulseSession> {
  const sessionDate = goldSessionDate();
  let session =
    sessionIn ?? (await loadGoldSession(sessionDate)) ?? shell(sessionDate, 0);

  try {
    const e5 = await loadYahooTf('5m', cache5);
    cache5 = e5.cache;
    const e15 = await loadYahooTf('15m', cache15);
    cache15 = e15.cache;

    const spot = e5.spot || e15.spot || session.spot;
    const { decision, utEntry, utHtf } = evaluateGoldUtEntry({
      candlesEntry: e5.candles,
      candlesHtf: e15.candles,
    });

    const entryPos = (utEntry.last?.pos ?? 0) as -1 | 0 | 1;
    const htfPos = (utHtf.last?.pos ?? 0) as -1 | 0 | 1;

    const updated = updateOpenGoldTrades(session.openTrades, spot, {
      entryPos,
      htfPos,
    });

    let openTrades = updated.open;
    const closedTrades = [...session.closedTrades, ...updated.closed];

    if (
      !session.autoPaused &&
      openTrades.length === 0 &&
      decision.newEntryEdge &&
      (decision.side === 'LONG' || decision.side === 'SHORT')
    ) {
      openTrades = [
        openGoldPaperTrade({
          side: decision.side,
          price: spot,
          symbol: GOLD_YAHOO_SYMBOL,
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
      lastSignal: decision,
      openTrades,
      closedTrades,
      lastError: null,
    };
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

export function goldPulsePollMs(session: GoldPulseSession): number {
  return session.openTrades.length
    ? GOLD_PULSE_RULES.tickPollMsInTrade
    : GOLD_PULSE_RULES.tickPollMsFlat;
}

export { GOLD_UT_ENTRY, GOLD_UT_HTF };
