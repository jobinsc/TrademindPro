/**
 * PinaxForge live watch — WS-driven mark / SL / TARGET / trail / TIME for open paper trades.
 * HTTP 1s poll remains the fallback when WS is down or LTP cache is stale.
 */

import { NIFTY_INDEX_INSTRUMENT_KEY } from '@/lib/upstox-historical';
import { istDate } from '@/lib/pinax-forge/ist';
import { appendPinaxJournalBatch } from '@/lib/pinax-forge/journal-store';
import {
  formatTradeExcursion,
  markOpenTrades,
  updatePaperTrades,
} from '@/lib/pinax-forge/paper-broker';
import { summarizePinaxPerformance } from '@/lib/pinax-forge/performance';
import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import { loadPinaxSession, savePinaxSession } from '@/lib/pinax-forge/session-store';
import {
  pinaxUpstoxWsFeed,
  WS_LTP_FRESH_MS,
} from '@/lib/pinax-forge/upstox-ws-feed';
import type { PinaxForgeSession, PinaxJournalEntry, PinaxPaperTrade } from '@/lib/pinax-forge/types';

const MARK_PERSIST_MS = 400;

let accessToken: string | null = null;
let unsubLtp: (() => void) | null = null;
let watchChain: Promise<void> = Promise.resolve();
let lastPersistAt = 0;
let lastHandledTradeKey: string | null = null;

function withLock(fn: () => Promise<void>): Promise<void> {
  const run = watchChain.then(fn, fn);
  watchChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function ltpMapFromWs(trades: PinaxPaperTrade[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of trades) {
    const ltp = pinaxUpstoxWsFeed.getCachedLtp(t.instrumentKey, WS_LTP_FRESH_MS);
    if (ltp != null) map.set(t.instrumentKey, ltp);
  }
  return map;
}

function niftySpotFromWs(fallback: number): number {
  const spot = pinaxUpstoxWsFeed.getCachedLtp(NIFTY_INDEX_INSTRUMENT_KEY, WS_LTP_FRESH_MS);
  return spot != null && spot > 0 ? spot : fallback;
}

async function applyTick(instrumentKey: string): Promise<void> {
  const sessionDate = istDate();
  const session = await loadPinaxSession(sessionDate);
  if (!session || session.openTrades.length === 0) {
    await syncLiveWatchSubscriptions([]);
    return;
  }

  const open = session.openTrades.filter((t) => t.status === 'open');
  if (!open.length) {
    await syncLiveWatchSubscriptions([]);
    return;
  }

  // Ignore ticks for instruments we are not watching (e.g. Nifty-only while flat option key mismatch)
  const relevant = open.some((t) => {
    const a = t.instrumentKey.replace(/\|/g, ':');
    const b = instrumentKey.replace(/\|/g, ':');
    return a === b || t.instrumentKey === instrumentKey;
  });
  const isNifty = instrumentKey.includes('Nifty 50');
  if (!relevant && !isNifty) return;

  const ltpMap = ltpMapFromWs(open);
  if (ltpMap.size === 0) return;

  const spot = niftySpotFromWs(session.spot);
  const entryCutoffReached = session.entryCutoffReached;
  const { stillOpen, closed, trailNotes } = updatePaperTrades(
    open,
    ltpMap,
    entryCutoffReached && open.length > 0,
    spot
  );

  const journalBatch: PinaxJournalEntry[] = [];
  for (const tn of trailNotes) {
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'INFO',
      tradeId: tn.tradeId,
      message: tn.note,
    });
  }

  let closedTrades = [...session.closedTrades];
  for (const ex of closed) {
    closedTrades.push(ex.trade);
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'EXIT',
      tradeId: ex.trade.id,
      message: `${ex.exitReason} @ ₹${ex.exitPremium} · net ₹${ex.trade.netPnl ?? 0} · ${formatTradeExcursion(ex.trade)} · WS`,
      detail: {
        rr: ex.rrAchieved,
        highPremium: ex.trade.highPremium ?? null,
        lowPremium: ex.trade.lowPremium ?? null,
        maxFavorablePts: ex.trade.maxFavorablePts ?? 0,
        maxAdversePts: ex.trade.maxAdversePts ?? 0,
        everProfit: Boolean(ex.trade.everProfit),
        source: 'upstox-ws',
        slipMax: PINAX_FORGE_RULES.maxSlippagePts,
      },
    });
  }

  const marked = markOpenTrades(stillOpen, ltpMap, spot);
  const now = Date.now();
  const mustPersist = closed.length > 0 || trailNotes.length > 0;
  const throttleOk = now - lastPersistAt >= MARK_PERSIST_MS;

  if (!mustPersist && !throttleOk) {
    // Keep in-memory session marks for next persist without writing every ms
    return;
  }

  lastPersistAt = now;
  if (journalBatch.length) {
    await appendPinaxJournalBatch(sessionDate, journalBatch);
  }

  const next: PinaxForgeSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    spot,
    openTrades: marked,
    closedTrades,
    performance: summarizePinaxPerformance(marked, closedTrades),
  };
  await savePinaxSession(next);

  if (closed.length > 0 || marked.length === 0) {
    await syncLiveWatchSubscriptions(marked);
  }
}

function ensureLtpHandler(): void {
  if (unsubLtp) return;
  unsubLtp = pinaxUpstoxWsFeed.onLtp((instrumentKey) => {
    void withLock(() => applyTick(instrumentKey));
  });
}

export function getPinaxWsFeedStatus() {
  return pinaxUpstoxWsFeed.getStatus();
}

/** Prefer WS LTP when fresh; otherwise use HTTP/greeks map from caller. */
export function mergeWsPreferredLtpMap(
  trades: PinaxPaperTrade[],
  httpMap: Map<string, number>
): Map<string, number> {
  const out = new Map(httpMap);
  for (const t of trades) {
    const ws = pinaxUpstoxWsFeed.getCachedLtp(t.instrumentKey, WS_LTP_FRESH_MS);
    if (ws != null) out.set(t.instrumentKey, ws);
  }
  return out;
}

export async function syncLiveWatchSubscriptions(
  openTrades: PinaxPaperTrade[],
  token?: string
): Promise<void> {
  if (token) accessToken = token.trim();
  const open = openTrades.filter((t) => t.status === 'open');
  const keys = open.length
    ? [NIFTY_INDEX_INSTRUMENT_KEY, ...open.map((t) => t.instrumentKey)]
    : [];

  const tradeKey = open.map((t) => t.instrumentKey).sort().join('|') || null;
  lastHandledTradeKey = tradeKey;

  if (!keys.length) {
    if (pinaxUpstoxWsFeed.getStatus().subscribedCount > 0) {
      await pinaxUpstoxWsFeed.setSubscriptions([]);
    }
    return;
  }

  if (!accessToken) return;
  ensureLtpHandler();
  try {
    await pinaxUpstoxWsFeed.ensureConnected(accessToken);
    await pinaxUpstoxWsFeed.setSubscriptions(keys);
  } catch {
    // HTTP poll remains fallback
  }
}

/** Call after ENTRY fill or on init/tick rehydrate when open position exists. */
export async function startLiveWatchForSession(
  token: string,
  session: PinaxForgeSession
): Promise<void> {
  accessToken = token.trim();
  ensureLtpHandler();
  await syncLiveWatchSubscriptions(session.openTrades, token);
}

/** Call after EXIT / flat — unsubscribe option (+ Nifty when flat). */
export async function stopLiveWatchIfFlat(
  openTrades: PinaxPaperTrade[]
): Promise<void> {
  await syncLiveWatchSubscriptions(openTrades);
}

/** Rehydrate from disk after server restart. */
export async function rehydrateLiveWatch(token: string): Promise<void> {
  accessToken = token.trim();
  const session = await loadPinaxSession(istDate());
  if (!session?.openTrades.some((t) => t.status === 'open')) {
    await syncLiveWatchSubscriptions([]);
    return;
  }
  await startLiveWatchForSession(token, session);
}

/** Expose for paper-broker resolve without circular import issues. */
export function getFreshWsLtp(instrumentKey: string): number | null {
  return pinaxUpstoxWsFeed.getCachedLtp(instrumentKey, WS_LTP_FRESH_MS);
}

/** Debug helper — last subscribed trade key fingerprint. */
export function getLiveWatchDebug() {
  return {
    ...pinaxUpstoxWsFeed.getStatus(),
    lastHandledTradeKey,
  };
}
