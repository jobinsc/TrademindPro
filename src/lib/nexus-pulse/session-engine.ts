/**
 * NexusPulse session tick — UT signals + dual-lane paper (isolated).
 * Rate-aware: one 1m candle pull (cached), one quote batch, option pick only on entry.
 */

import { fetchUpstoxQuotes, getBearerToken } from '@/lib/upstox-market';
import {
  fetchUpstoxIntradayCandles,
  NIFTY_INDEX_INSTRUMENT_KEY,
} from '@/lib/upstox-historical';
import { pickPinaxOptions } from '@/lib/pinax-forge/option-picker';
import { istDate } from '@/lib/pinax-forge/ist';
import {
  laneEntryAllowed,
  laneForceFlatAt,
  shouldSquareOffAll,
} from '@/lib/nexus-pulse/lanes';
import { openNexusPaperTrade, updateOpenTrades } from '@/lib/nexus-pulse/paper-broker';
import { NEXUS_LANES, NEXUS_PULSE_RULES, type NexusLaneId } from '@/lib/nexus-pulse/rules';
import { resampleMinutes } from '@/lib/nexus-pulse/resample';
import { evaluateUtV2Entry } from '@/lib/nexus-pulse/signals';
import { loadNexusSession, saveNexusSession } from '@/lib/nexus-pulse/session-store';
import { archiveClosedTrades } from '@/lib/nexus-pulse/trade-archive';
import type { NexusPulseSession } from '@/lib/nexus-pulse/types';
import type { Candle } from '@/lib/nejoic';

const LANES: NexusLaneId[] = ['current_bans', 'morning_open_stop_15'];

/** Cache 1m Nifty candles ~45s — UT only needs closed bars. */
let candleCache: { at: number; candles: Candle[] } | null = null;
const CANDLE_TTL_MS = 45_000;

function shell(sessionDate: string, spot: number): NexusPulseSession {
  const now = new Date().toISOString();
  return {
    sessionDate,
    startedAt: now,
    updatedAt: now,
    spot,
    ut3m: null,
    ut5m: null,
    lastSignal: null,
    openTrades: [],
    closedTrades: [],
    autoPaused: false,
  };
}

async function loadOneMinuteCandles(accessToken: string): Promise<Candle[]> {
  const now = Date.now();
  if (candleCache && now - candleCache.at < CANDLE_TTL_MS) {
    return candleCache.candles;
  }
  const intra = await fetchUpstoxIntradayCandles({
    accessToken,
    instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
    unit: 'minutes',
    interval: 1,
  });
  const candles = (intra.candles || []) as Candle[];
  if (candles.length) {
    candleCache = { at: now, candles };
  }
  return candles.length ? candles : candleCache?.candles ?? [];
}

export async function initNexusSession(accessToken: string): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  const existing = await loadNexusSession(sessionDate);
  if (existing) return tickNexusSession(accessToken, existing);

  // Init is the only place we fetch a Nifty quote; tick derives spot from cached 1m candles.
  const quotes = await fetchUpstoxQuotes(accessToken, [NIFTY_INDEX_INSTRUMENT_KEY]);
  const spot = quotes[0]?.lastPrice ?? 0;
  const session = shell(sessionDate, spot);
  await saveNexusSession(session);
  return tickNexusSession(accessToken, session);
}

export async function tickNexusSession(
  accessToken: string,
  sessionIn?: NexusPulseSession
): Promise<NexusPulseSession> {
  const sessionDate = istDate();
  let session =
    sessionIn ?? (await loadNexusSession(sessionDate)) ?? shell(sessionDate, 0);

  // UT needs closed candles only; derive spot from 1m candle close to avoid Nifty quote calls.
  // Quote calls happen only for open option legs, reducing Upstox 429 pressure.
  const oneMin = await loadOneMinuteCandles(accessToken);
  const spot = oneMin.length ? oneMin[oneMin.length - 1].close : session.spot;
  const candles3m = resampleMinutes(oneMin, 3);
  const candles5m = resampleMinutes(oneMin, 5);

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
  const ut3mBuy = Boolean(ut3m.last?.buy);
  const ut3mSell = Boolean(ut3m.last?.sell);

  let openTrades = [...session.openTrades];
  let closedTrades = [...session.closedTrades];

  const { stillOpen, closed } = updateOpenTrades(openTrades, ltpMap, {
    ut3mBuy,
    ut3mSell,
    pos5m: pos5m as -1 | 0 | 1,
    forceFlat: laneForceFlatAt('morning_open_stop_15'),
    squareOff: shouldSquareOffAll(),
  });
  openTrades = stillOpen;
  closedTrades.push(...closed);

  if (!session.autoPaused && decision.side !== 'FLAT' && decision.new3mEdge) {
    const lanesNeedingEntry = LANES.filter((laneId) => {
      if (openTrades.some((t) => t.laneId === laneId && t.status === 'open')) return false;
      return laneEntryAllowed(laneId).ok;
    });

    if (lanesNeedingEntry.length) {
      // One option pick for both lanes — not 2× chain/quote storm
      const { picked } = await pickPinaxOptions({
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
              lotSize: picked.lotSize,
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
    ut3m,
    ut5m,
    lastSignal: decision,
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
