/**
 * PinaxForge session engine — init + tick orchestration (server-only).
 */

import { fetchUpstoxQuotes } from '@/lib/upstox-market';
import {
  fetchUpstoxIntradayCandles,
  fetchUpstoxHistoricalWindow,
  NIFTY_INDEX_INSTRUMENT_KEY,
} from '@/lib/upstox-historical';
import { fetchUpstoxOptionGreeks } from '@/lib/upstox-options';
import { runPriceAction } from '@/lib/price-action';
import { dayAdd, isBeforeEntryCutoff, isSessionOpen, istDate, istCalendarDate } from '@/lib/pinax-forge/ist';
import {
  appendPinaxJournalBatch,
  readPinaxJournal,
} from '@/lib/pinax-forge/journal-store';
import {
  buildPinaxMorningContext,
  buildTradingZones,
  readPinaxMorningDesk,
  splitSessionCandles,
} from '@/lib/pinax-forge/morning-desk';
import { pickPinaxOptions } from '@/lib/pinax-forge/option-picker';
import {
  buildTradeLtpMap,
  markOpenTrades,
  maybeMarketFlipExit,
  formatTradeExcursion,
  openPaperTrade,
  updatePaperTrades,
} from '@/lib/pinax-forge/paper-broker';
import { summarizePinaxPerformance } from '@/lib/pinax-forge/performance';
import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import { checkEntryRisk, defaultStopLossPremium, hasOpenPaperTrade } from '@/lib/pinax-forge/risk-engine';
import {
  assessNiftyMovementQuality,
  inPostExitCooldown,
  inPostTargetCooldown,
} from '@/lib/pinax-forge/trade-skill';
import {
  rehydrateLiveWatch,
  startLiveWatchForSession,
  stopLiveWatchIfFlat,
} from '@/lib/pinax-forge/live-watch';
import { loadPinaxSession, savePinaxSession } from '@/lib/pinax-forge/session-store';
import { scanPinaxSetups } from '@/lib/pinax-forge/setup-1m';
import { buildPinaxTuningProfile, defaultTuningProfile } from '@/lib/pinax-forge/tuning';
import type {
  PinaxForgeSession,
  PinaxJournalEntry,
  PinaxSetupSignal,
} from '@/lib/pinax-forge/types';

function niftySpot(quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>): number {
  const q =
    quotes.find((x) => x.instrumentKey.includes('Nifty 50')) ??
    quotes.find((x) => x.symbol.includes('NIFTY')) ??
    quotes[0];
  return q?.lastPrice ?? 0;
}

async function loadCandles(accessToken: string, sessionDate: string) {
  const fromDate = dayAdd(sessionDate, -5);
  const hist = await fetchUpstoxHistoricalWindow({
    accessToken,
    instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
    unit: 'minutes',
    interval: 1,
    fromDate,
    toDate: dayAdd(sessionDate, -1),
  });
  const intra = await fetchUpstoxIntradayCandles({
    accessToken,
    instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
    unit: 'minutes',
    interval: 1,
  });
  const all = [...(hist.candles || []), ...(intra.candles || [])];
  return all.sort((a, b) => a.t.localeCompare(b.t));
}

function emptyPerformance() {
  return summarizePinaxPerformance([], []);
}

function normalizeSession(session: PinaxForgeSession): PinaxForgeSession {
  return {
    ...session,
    autoPaused: session.autoPaused ?? false,
    blockedSetupKeys: session.blockedSetupKeys ?? [],
    tuning: session.tuning ?? defaultTuningProfile(),
    pendingTake: session.pendingTake ?? null,
  };
}

function buildSessionShell(sessionDate: string, spot: number): PinaxForgeSession {
  const now = new Date().toISOString();
  return {
    sessionDate,
    startedAt: now,
    updatedAt: now,
    spot,
    morningContext: {
      sessionDate,
      priorDays: [],
      pdh: null,
      pdl: null,
      priorClose: null,
      threeDayTrend: 'SIDEWAYS',
      threeDayNote: 'Loading…',
    },
    morningRead: null,
    zones: [],
    priceAction: {
      support: null,
      resistance: null,
      trend: 0,
      lastLabel: null,
      structureText: '',
    },
    optionCandidates: [],
    openTrades: [],
    closedTrades: [],
    lastSetups: [],
    recentJournal: [],
    performance: emptyPerformance(),
    entryCutoffReached: false,
    autoPaused: false,
    blockedSetupKeys: [],
    tuning: defaultTuningProfile(),
    pendingTake: null,
  };
}

export async function initPinaxSession(accessToken: string): Promise<PinaxForgeSession> {
  const sessionDate = istDate();
  const existing = await loadPinaxSession(sessionDate);
  if (existing) {
    const session = normalizeSession(existing);
    // Rehydrate WS live-watch if server restarted with an open paper position.
    if (session.openTrades.some((t) => t.status === 'open')) {
      await startLiveWatchForSession(accessToken, session);
    }
    return session;
  }

  const quotes = await fetchUpstoxQuotes(accessToken, [NIFTY_INDEX_INSTRUMENT_KEY]);
  const spot = niftySpot(quotes);
  const candles = await loadCandles(accessToken, sessionDate);
  const { today, prior } = splitSessionCandles(candles, sessionDate);
  const morningContext = buildPinaxMorningContext(prior, sessionDate);
  const morningRead = readPinaxMorningDesk(today, morningContext, spot);
  const pa = runPriceAction(today.length ? today : candles.slice(-120), {
    leftBars: 5,
    rightBars: 5,
  });
  const zones = buildTradingZones(morningContext, morningRead, pa.support, pa.resistance);

  const side = morningRead?.bias === 'DOWN' ? 'PE' : 'CE';
  const { candidates, picked, error } = await pickPinaxOptions({
    accessToken,
    spot,
    wantedSide: side,
  });

  const journal: PinaxJournalEntry[] = [
    {
      at: new Date().toISOString(),
      type: 'INFO',
      message: `PinaxForge session started · spot ${spot.toFixed(1)} · bias ${morningRead?.bias ?? '—'}`,
    },
  ];
  if (error) {
    journal.push({ at: new Date().toISOString(), type: 'INFO', message: `Option scan: ${error}` });
  }
  if (picked) {
    journal.push({
      at: new Date().toISOString(),
      type: 'INFO',
      message: `Front-week ${picked.side} ${picked.strike} exp ${picked.expiry} @ ₹${picked.premium} · paper entries follow analysis`,
    });
  }

  await appendPinaxJournalBatch(sessionDate, journal);

  const tuning = await buildPinaxTuningProfile(sessionDate);

  const session: PinaxForgeSession = {
    ...buildSessionShell(sessionDate, spot),
    morningContext,
    morningRead,
    zones,
    priceAction: {
      support: pa.support,
      resistance: pa.resistance,
      trend: pa.trend,
      lastLabel: pa.lastLabel,
      structureText: pa.structureText,
    },
    optionCandidates: candidates,
    recentJournal: journal,
    performance: emptyPerformance(),
    tuning,
  };

  await savePinaxSession(session);
  return session;
}

const recentSetupKeys = new Map<string, number>();
const backgroundTakeKeys = new Map<string, number>();
const missingLtpLogKeys = new Map<string, number>();
/** First tick we saw no LTP for this open trade id — orphan force-exit timer. */
const missingLtpSince = new Map<string, number>();
const DEDUPE_MS = 15 * 60 * 1000;

function setupDedupeKey(signal: PinaxSetupSignal): string {
  return `${signal.kind}:${signal.side}:${Math.round(signal.level)}`;
}

/** True only if we already successfully entered this setup recently. */
function wasRecentlyEntered(signal: PinaxSetupSignal): boolean {
  const last = recentSetupKeys.get(setupDedupeKey(signal));
  return Boolean(last && Date.now() - last < DEDUPE_MS);
}

function markSetupEntered(signal: PinaxSetupSignal): void {
  recentSetupKeys.set(setupDedupeKey(signal), Date.now());
}

function shouldLogBackgroundTake(signal: PinaxSetupSignal): boolean {
  const key = setupDedupeKey(signal);
  const last = backgroundTakeKeys.get(key);
  const now = Date.now();
  if (last && now - last < 5 * 60 * 1000) return false;
  backgroundTakeKeys.set(key, now);
  return true;
}

function shouldLogMissingLtp(tradeId: string): boolean {
  const last = missingLtpLogKeys.get(tradeId);
  const now = Date.now();
  if (last && now - last < 5 * 60 * 1000) return false;
  missingLtpLogKeys.set(tradeId, now);
  return true;
}

/** Prefer bias-aligned TAKE. UP→CE, DOWN→PE. SIDEWAYS only at high confidence. */
function pickEntryTake(
  setups: PinaxSetupSignal[],
  deskBias: 'UP' | 'DOWN' | 'SIDEWAYS'
): PinaxSetupSignal | undefined {
  const takes = setups.filter((s) => s.decision === 'TAKE');
  if (!takes.length) return undefined;

  if (deskBias === 'UP' || deskBias === 'DOWN') {
    const aligned = takes.filter((s) =>
      deskBias === 'DOWN' ? s.side === 'PE' : s.side === 'CE'
    );
    // Pro desk: do not take against firm bias — wait for aligned chance.
    if (!aligned.length) return undefined;
    return [...aligned].sort((a, b) => b.confidence - a.confidence)[0];
  }

  const strong = takes.filter(
    (s) => s.confidence >= PINAX_FORGE_RULES.sidewaysMinConfidence
  );
  if (!strong.length) return undefined;
  return [...strong].sort((a, b) => b.confidence - a.confidence)[0];
}

function pickOppositeTake(
  setups: PinaxSetupSignal[],
  openSide: 'CE' | 'PE'
): PinaxSetupSignal | undefined {
  return setups
    .filter((s) => s.decision === 'TAKE' && s.side !== openSide)
    .sort((a, b) => b.confidence - a.confidence)[0];
}

export async function tickPinaxSession(accessToken: string): Promise<PinaxForgeSession> {
  const sessionDate = istDate();
  let session = normalizeSession(
    (await loadPinaxSession(sessionDate)) ?? buildSessionShell(sessionDate, 0)
  );

  // Ensure WS watch is running whenever a position is open (poll is fallback).
  if (session.openTrades.some((t) => t.status === 'open')) {
    await rehydrateLiveWatch(accessToken).catch(() => undefined);
  }

  const tuning = await buildPinaxTuningProfile(sessionDate);
  session.tuning = tuning;

  const quotes = await fetchUpstoxQuotes(accessToken, [NIFTY_INDEX_INSTRUMENT_KEY]);
  const spot = niftySpot(quotes);
  const candles = await loadCandles(accessToken, sessionDate);
  const { today, prior } = splitSessionCandles(candles, sessionDate);

  const morningContext =
    session.morningContext.priorDays.length > 0
      ? session.morningContext
      : buildPinaxMorningContext(prior, sessionDate);
  const morningRead = readPinaxMorningDesk(today, morningContext, spot);
  const pa = runPriceAction(today.length ? today : candles.slice(-120), {
    leftBars: 5,
    rightBars: 5,
  });
  const zones = buildTradingZones(morningContext, morningRead, pa.support, pa.resistance);

  const setups = scanPinaxSetups({
    candles: today,
    sessionDate: session.sessionDate,
    zones,
    morningBias: morningRead?.bias ?? 'SIDEWAYS',
    support: pa.support,
    resistance: pa.resistance,
    spot,
    tuning,
    blockedSetupKeys: session.blockedSetupKeys,
  });

  const journalBatch: PinaxJournalEntry[] = [];
  let openTrades = [...session.openTrades];
  let closedTrades = [...session.closedTrades];

  const entryCutoffReached = !isBeforeEntryCutoff(PINAX_FORGE_RULES.sessionEntryCutoffIst);

  const quoteKeys = new Set<string>([NIFTY_INDEX_INSTRUMENT_KEY]);
  for (const t of openTrades) quoteKeys.add(t.instrumentKey);

  for (const s of setups) {
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'SETUP',
      setupId: s.id,
      message: `${s.kind} ${s.side} @ ${s.level.toFixed(0)} · ${s.decision} (${s.confidence}%)`,
      detail: {
        reasons: s.reasons,
        spot: s.spot,
        ...(s.skipReason ? { skipReason: s.skipReason } : {}),
        alignedWithBias: s.alignedWithBias,
      },
    });
  }

  const openKeys = openTrades.map((t) => t.instrumentKey);
  const manageQuotes = await fetchUpstoxQuotes(accessToken, [...quoteKeys]);
  const manageGreeks =
    openKeys.length > 0
      ? await fetchUpstoxOptionGreeks(accessToken, openKeys).catch(() => [])
      : [];
  const ltpMap = buildTradeLtpMap(openTrades, {
    quotes: manageQuotes,
    greeks: manageGreeks,
  });

  const deskBias = morningRead?.bias ?? 'SIDEWAYS';
  const nowMs = Date.now();

  for (const t of openTrades) {
    if (t.status !== 'open') continue;
    if (ltpMap.has(t.instrumentKey)) {
      missingLtpSince.delete(t.id);
      continue;
    }
    if (!missingLtpSince.has(t.id)) missingLtpSince.set(t.id, nowMs);
    if (shouldLogMissingLtp(t.id)) {
      const waitedSec = Math.round((nowMs - (missingLtpSince.get(t.id) ?? nowMs)) / 1000);
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'INFO',
        tradeId: t.id,
        message: `Open ${t.side} ${t.strike} — no option LTP yet (${waitedSec}s); SL mark deferred`,
      });
    }
  }

  let { stillOpen, closed, trailNotes } = updatePaperTrades(
    openTrades,
    ltpMap,
    entryCutoffReached && openTrades.length > 0,
    spot
  );
  let closedThisTick = closed.length > 0;
  openTrades = markOpenTrades(stillOpen, ltpMap, spot);

  for (const tn of trailNotes) {
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'INFO',
      tradeId: tn.tradeId,
      message: tn.note,
    });
  }

  // Drastic market flip: firm bias reversal + strong opposite TAKE → close first.
  // Orphan (no LTP): close only — do not auto flip-enter (avoids cost churn).
  let flippedThisTick = false;
  let flipTake: PinaxSetupSignal | undefined;
  if (
    !closedThisTick &&
    openTrades.length === 1 &&
    !entryCutoffReached &&
    !session.autoPaused
  ) {
    const open = openTrades[0];
    const oppositeTake = pickOppositeTake(setups, open.side);
    const deskAgreesWithOpen =
      (open.side === 'CE' && deskBias === 'UP') ||
      (open.side === 'PE' && deskBias === 'DOWN');
    const missingForMs = missingLtpSince.has(open.id)
      ? nowMs - (missingLtpSince.get(open.id) as number)
      : 0;
    const orphanForce =
      Boolean(oppositeTake) &&
      !deskAgreesWithOpen &&
      missingForMs >= PINAX_FORGE_RULES.missingLtpForceExitMs;

    if (oppositeTake) {
      const flip = maybeMarketFlipExit({
        trade: open,
        deskBias,
        oppositeTakeConfidence: oppositeTake.confidence,
        markPremium: ltpMap.get(open.instrumentKey) ?? open.markPremium ?? null,
        nowMs,
      });
      // Orphan: missing LTP too long — close at last mark; no auto opposite ENTRY.
      const forceOrphan = !flip && orphanForce && oppositeTake.confidence >= 70;
      const exit =
        flip ??
        (forceOrphan
          ? (() => {
              const px =
                open.markPremium != null && open.markPremium > 0
                  ? open.markPremium
                  : Math.min(open.stopLossPremium, open.entryPremium * 0.85);
              return {
                trade: {
                  ...open,
                  status: 'closed' as const,
                  closedAt: new Date().toISOString(),
                  exitPremium: Math.round(px * 100) / 100,
                  markPremium: Math.round(px * 100) / 100,
                  exitReason: 'ADVERSE' as const,
                  grossPnl:
                    Math.round(
                      (px - open.entryPremium) * open.qty * open.lotSize * 100
                    ) / 100,
                  netPnl:
                    Math.round(
                      ((px - open.entryPremium) * open.qty * open.lotSize -
                        PINAX_FORGE_RULES.roundTripCostInr) *
                        100
                    ) / 100,
                },
                exitReason: 'ADVERSE' as const,
                exitPremium: Math.round(px * 100) / 100,
              };
            })()
          : null);

      if (exit) {
        closed.push(exit);
        closedThisTick = true;
        // Drastic flip: close wrong side. Auto opposite ENTRY only if explicitly enabled.
        if (!forceOrphan && PINAX_FORGE_RULES.autoEnterOnFlip) {
          flippedThisTick = true;
          flipTake = oppositeTake;
        } else if (!forceOrphan) {
          flippedThisTick = true;
          flipTake = undefined;
          journalBatch.push({
            at: new Date().toISOString(),
            type: 'INFO',
            tradeId: open.id,
            message:
              'Drastic flip closed — re-analyse before next ENTRY (no instant opposite fill)',
          });
        }
        missingLtpSince.delete(open.id);
        openTrades = [];
        journalBatch.push({
          at: new Date().toISOString(),
          type: 'OVERRIDE',
          tradeId: open.id,
          setupId: oppositeTake.id,
          message: forceOrphan
            ? `Orphan close — no LTP ${Math.round(missingForMs / 1000)}s · close ${open.side} (no auto flip-entry)`
            : `Drastic market flip — close ${open.side}${PINAX_FORGE_RULES.autoEnterOnFlip ? `, take ${oppositeTake.side}` : ' (wait for fresh analysis)'}`,
          detail: {
            deskBias,
            oppositeConfidence: oppositeTake.confidence,
            exitPremium: exit.exitPremium,
            missingLtpMs: missingForMs,
            orphanForce: Boolean(forceOrphan),
            autoFlipEntry: Boolean(!forceOrphan && PINAX_FORGE_RULES.autoEnterOnFlip),
          },
        });
      }
    }
  }

  for (const ex of closed) {
    closedTrades.push(ex.trade);
    missingLtpSince.delete(ex.trade.id);
    const flipNote =
      flippedThisTick && ex.exitReason === 'ADVERSE'
        ? ` · Drastic flip — close ${ex.trade.side}, take ${flipTake?.side ?? 'other'}`
        : '';
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'EXIT',
      tradeId: ex.trade.id,
      message: `${ex.exitReason} @ ₹${ex.exitPremium} · net ₹${ex.trade.netPnl ?? 0} · ${formatTradeExcursion(ex.trade)}${flipNote}`,
      detail: {
        rr: ex.rrAchieved,
        highPremium: ex.trade.highPremium ?? null,
        lowPremium: ex.trade.lowPremium ?? null,
        maxFavorablePts: ex.trade.maxFavorablePts ?? 0,
        maxAdversePts: ex.trade.maxAdversePts ?? 0,
        everProfit: Boolean(ex.trade.everProfit),
        firstProfitAt: ex.trade.firstProfitAt ?? null,
        markPathPoints: ex.trade.markPath?.length ?? 0,
        ...(flippedThisTick && ex.exitReason === 'ADVERSE'
          ? { marketFlip: true, deskBias, drastic: true }
          : {}),
      },
    });
  }

  // EXIT → unsubscribe option (+ Nifty when flat). WS live-watch stops driving marks.
  if (closed.length > 0) {
    await stopLiveWatchIfFlat(openTrades);
  }

  // Analysis always continues (SETUP lines above). Entry only when flat + after 09:15 IST.
  // Prefer bias-aligned TAKE (DOWN→PE). After flip, prefer the opposite TAKE that flipped us.
  // Fall back to pendingTake stashed while blocked — survives empty-setup close ticks.
  const positionOpen = hasOpenPaperTrade(openTrades);
  const marketOpen = isSessionOpen(PINAX_FORGE_RULES.sessionEntryOpenIst);
  let pendingTake = session.pendingTake ?? null;
  if (pendingTake && istCalendarDate(pendingTake.at) !== session.sessionDate) {
    pendingTake = null;
  }
  const liveEntryTake =
    flippedThisTick && flipTake && PINAX_FORGE_RULES.autoEnterOnFlip
      ? flipTake
      : pickEntryTake(setups, deskBias);

  if (liveEntryTake && positionOpen) pendingTake = liveEntryTake;
  if (flippedThisTick && flipTake && PINAX_FORGE_RULES.autoEnterOnFlip) {
    pendingTake = flipTake;
  }

  const pendingStillFresh =
    Boolean(pendingTake) &&
    istCalendarDate(pendingTake!.at) === session.sessionDate &&
    Date.now() - new Date(pendingTake!.at).getTime() < 25 * 60 * 1000 &&
    (deskBias === 'SIDEWAYS' ||
      (deskBias === 'DOWN' && pendingTake!.side === 'PE') ||
      (deskBias === 'UP' && pendingTake!.side === 'CE'));

  let entryTake = liveEntryTake ?? (pendingStillFresh ? pendingTake! : undefined);
  if (entryTake && istCalendarDate(entryTake.at) !== session.sessionDate) {
    entryTake = undefined;
  }

  if (
    entryTake &&
    positionOpen &&
    !entryCutoffReached &&
    marketOpen &&
    !session.autoPaused &&
    shouldLogBackgroundTake(entryTake)
  ) {
    journalBatch.push({
      at: new Date().toISOString(),
      type: 'INFO',
      setupId: entryTake.id,
      message: `Analysis TAKE kept in background · ${entryTake.kind} ${entryTake.side} @ ${entryTake.level.toFixed(0)} — waiting for current trade to close`,
    });
  }

  // After close / when flat: enter bias-aligned TAKE only after analyse cooldown.
  // Never skip cooldown for flip/close same tick — pro desk re-reads the market.
  const skipDedupe = false;
  if (
    entryTake &&
    !entryCutoffReached &&
    !session.autoPaused &&
    !positionOpen &&
    (skipDedupe || !wasRecentlyEntered(entryTake))
  ) {
    if (!marketOpen) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: `Before ${PINAX_FORGE_RULES.sessionEntryOpenIst} IST — no paper ENTRY (NSE FO not live)`,
      });
    } else if (inPostExitCooldown(closedTrades)) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: `Post-exit analyse window ${PINAX_FORGE_RULES.postExitCooldownMs / 60000}m — watch market, then decide`,
      });
    } else {
    const moveQ = assessNiftyMovementQuality(today);
    if (!moveQ.ok) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: moveQ.reason,
        detail: { movePts: moveQ.movePts, rangePts: moveQ.rangePts },
      });
    } else if (inPostTargetCooldown(closedTrades)) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: `Post-TARGET cooldown ${PINAX_FORGE_RULES.postTargetCooldownMs / 60000}m — bank wins, don't revenge`,
      });
    } else {
    const { picked } = await pickPinaxOptions({
      accessToken,
      spot,
      wantedSide: entryTake.side,
    });
    const sl = picked ? defaultStopLossPremium(picked.premium) : 0;
    const risk = checkEntryRisk({
      openTrades,
      closedTrades,
      signal: { ...entryTake, decision: 'TAKE' },
      hasOption: Boolean(picked),
      hasStopLoss: Boolean(picked && sl > 0),
    });

    if (risk.allowed && picked) {
      const trade = openPaperTrade({
        setupId: entryTake.id,
        setupKind: entryTake.kind,
        candidate: picked,
        entrySpot: spot,
      });
      openTrades.push(trade);
      markSetupEntered(entryTake);
      pendingTake = null;
      const expiryNote = trade.expiry ? ` · exp ${trade.expiry}` : '';
      const afterCloseNote = closedThisTick
        ? ' (first good analysis after close)'
        : liveEntryTake
          ? ''
          : ' (pending TAKE after flat)';
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'ENTRY',
        tradeId: trade.id,
        setupId: entryTake.id,
        message: `Paper BUY ${trade.side} ${trade.strike} @ ₹${trade.entryPremium} · SL ₹${trade.stopLossPremium}${expiryNote}${afterCloseNote}`,
        detail: {
          reasons: entryTake.reasons,
          expiry: trade.expiry,
          deskBias,
          fromPending: !liveEntryTake,
          movement: moveQ,
        },
      });
      // ENTRY → subscribe CE/PE + Nifty on Upstox Market Data V3 WS.
      await startLiveWatchForSession(accessToken, {
        ...session,
        openTrades,
        spot,
      });
    } else if (!picked) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: 'No front-week option quote available',
      });
    } else if (!risk.allowed) {
      journalBatch.push({
        at: new Date().toISOString(),
        type: 'SKIP',
        setupId: entryTake.id,
        message: risk.reason,
      });
    }
    }
    }
  }

  if (!pendingStillFresh) {
    pendingTake = null;
  }

  if (journalBatch.length) {
    await appendPinaxJournalBatch(sessionDate, journalBatch);
  }

  const recentJournal = await readPinaxJournal(sessionDate, 80);
  const side = morningRead?.bias === 'DOWN' ? 'PE' : 'CE';
  const { candidates } = await pickPinaxOptions({ accessToken, spot, wantedSide: side });

  session = {
    ...session,
    updatedAt: new Date().toISOString(),
    spot,
    morningContext,
    morningRead,
    zones,
    priceAction: {
      support: pa.support,
      resistance: pa.resistance,
      trend: pa.trend,
      lastLabel: pa.lastLabel,
      structureText: pa.structureText,
    },
    optionCandidates: candidates,
    openTrades,
    closedTrades,
    lastSetups: setups,
    recentJournal,
    performance: summarizePinaxPerformance(openTrades, closedTrades),
    entryCutoffReached,
    autoPaused: session.autoPaused,
    blockedSetupKeys: session.blockedSetupKeys,
    tuning,
    pendingTake,
  };

  await savePinaxSession(session);
  return session;
}
