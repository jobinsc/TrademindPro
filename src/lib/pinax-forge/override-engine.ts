/**
 * PinaxForge manual overrides — force take/skip, pause auto, close trade.
 */

import { fetchUpstoxQuotes } from '@/lib/upstox-market';
import { fetchUpstoxOptionGreeks } from '@/lib/upstox-options';
import {
  appendPinaxJournalBatch,
  readPinaxJournal,
} from '@/lib/pinax-forge/journal-store';
import { istDate } from '@/lib/pinax-forge/ist';
import { pickPinaxOptions } from '@/lib/pinax-forge/option-picker';
import {
  startLiveWatchForSession,
  stopLiveWatchIfFlat,
} from '@/lib/pinax-forge/live-watch';
import {
  buildTradeLtpMap,
  closePaperTradeManual,
  markOpenTrades,
  openPaperTrade,
  resolveTradeLtp,
} from '@/lib/pinax-forge/paper-broker';
import { summarizePinaxPerformance } from '@/lib/pinax-forge/performance';
import { checkEntryRisk, defaultStopLossPremium } from '@/lib/pinax-forge/risk-engine';
import { loadPinaxSession, savePinaxSession } from '@/lib/pinax-forge/session-store';
import { buildPinaxTuningProfile, setupBlockKey } from '@/lib/pinax-forge/tuning';
import type {
  PinaxForgeSession,
  PinaxJournalEntry,
  PinaxOverrideAction,
  PinaxSetupSignal,
} from '@/lib/pinax-forge/types';

export type PinaxOverrideRequest = {
  action: PinaxOverrideAction;
  setupId?: string;
  tradeId?: string;
  note?: string;
};

function normalizeSession(session: PinaxForgeSession): PinaxForgeSession {
  return {
    ...session,
    autoPaused: session.autoPaused ?? false,
    blockedSetupKeys: session.blockedSetupKeys ?? [],
    tuning: session.tuning ?? {
      updatedAt: new Date().toISOString(),
      sampleTrades: 0,
      minConfidence: 70,
      kindBonus: {
        BREAK_RETEST: 0,
        REJECTION_WICK: 0,
        STRUCTURE_HL_LH_PLUS_LEVEL: 0,
      },
      kindStats: {
        BREAK_RETEST: { wins: 0, losses: 0, winRate: 0 },
        REJECTION_WICK: { wins: 0, losses: 0, winRate: 0 },
        STRUCTURE_HL_LH_PLUS_LEVEL: { wins: 0, losses: 0, winRate: 0 },
      },
      notes: [],
    },
  };
}

function findSetup(session: PinaxForgeSession, setupId: string): PinaxSetupSignal | null {
  return session.lastSetups.find((s) => s.id === setupId) ?? null;
}

export async function applyPinaxOverride(
  accessToken: string,
  req: PinaxOverrideRequest
): Promise<PinaxForgeSession> {
  const sessionDate = istDate();
  const loaded = await loadPinaxSession(sessionDate);
  if (!loaded) {
    throw new Error('No active session today — start paper session first.');
  }
  let session = normalizeSession(loaded);
  const journalEntries: PinaxJournalEntry[] = [];
  const now = new Date().toISOString();

  if (req.action === 'pause_auto') {
    session.autoPaused = true;
    journalEntries.push({
      at: now,
      type: 'OVERRIDE',
      message: req.note || 'Auto entries PAUSED by desk',
    });
  } else if (req.action === 'resume_auto') {
    session.autoPaused = false;
    journalEntries.push({
      at: now,
      type: 'OVERRIDE',
      message: req.note || 'Auto entries RESUMED',
    });
  } else if (req.action === 'force_skip') {
    const setup = req.setupId ? findSetup(session, req.setupId) : null;
    if (!setup) throw new Error('Setup not found — run a tick first so setups are visible.');
    const key = setupBlockKey(setup.kind, setup.side, setup.level);
    if (!session.blockedSetupKeys.includes(key)) {
      session.blockedSetupKeys.push(key);
    }
    journalEntries.push({
      at: now,
      type: 'OVERRIDE',
      setupId: setup.id,
      message: req.note || `Force SKIP ${setup.kind} ${setup.side} @ ${setup.level.toFixed(0)}`,
    });
  } else if (req.action === 'force_take') {
    const setup = req.setupId ? findSetup(session, req.setupId) : null;
    if (!setup) throw new Error('Setup not found — run a tick first.');
    const forced: PinaxSetupSignal = { ...setup, decision: 'TAKE', skipReason: undefined };
    const { picked } = await pickPinaxOptions({
      accessToken,
      spot: session.spot,
      wantedSide: forced.side,
    });
    const sl = picked ? defaultStopLossPremium(picked.premium) : 0;
    const risk = checkEntryRisk({
      openTrades: session.openTrades,
      closedTrades: session.closedTrades,
      signal: forced,
      hasOption: Boolean(picked),
      hasStopLoss: Boolean(picked && sl > 0),
    });
    if (!risk.allowed) throw new Error(risk.reason);
    if (!picked) throw new Error('No option in scan range');

    const trade = openPaperTrade({
      setupId: forced.id,
      setupKind: forced.kind,
      candidate: picked,
      entrySpot: session.spot,
    });
    session.openTrades = [...session.openTrades, trade];
    journalEntries.push({
      at: now,
      type: 'OVERRIDE',
      setupId: setup.id,
      tradeId: trade.id,
      message:
        req.note ||
        `Force TAKE ${trade.side} ${trade.strike} @ ₹${trade.entryPremium} (manual desk)`,
      detail: { setupKind: forced.kind },
    });
    journalEntries.push({
      at: now,
      type: 'ENTRY',
      tradeId: trade.id,
      setupId: setup.id,
      message: `Paper BUY ${trade.side} ${trade.strike} @ ₹${trade.entryPremium} · SL ₹${trade.stopLossPremium}`,
    });
    await startLiveWatchForSession(accessToken, session);
  } else if (req.action === 'close_trade') {
    const tradeId = req.tradeId;
    if (!tradeId) throw new Error('tradeId required');
    const idx = session.openTrades.findIndex((t) => t.id === tradeId && t.status === 'open');
    if (idx < 0) throw new Error('Open trade not found');
    const trade = session.openTrades[idx];
    const quotes = await fetchUpstoxQuotes(accessToken, [trade.instrumentKey]);
    const greeks = await fetchUpstoxOptionGreeks(accessToken, [trade.instrumentKey]).catch(
      () => []
    );
    const ltp =
      resolveTradeLtp(trade, { quotes, greeks }) ??
      trade.markPremium ??
      trade.entryPremium;
    const closed = closePaperTradeManual(trade, ltp);
    session.openTrades = session.openTrades.filter((t) => t.id !== tradeId);
    session.closedTrades = [...session.closedTrades, closed];
    journalEntries.push({
      at: now,
      type: 'OVERRIDE',
      tradeId: trade.id,
      message: req.note || `Manual CLOSE @ ₹${ltp} · net ₹${closed.netPnl ?? 0}`,
    });
    journalEntries.push({
      at: now,
      type: 'EXIT',
      tradeId: trade.id,
      message: `MANUAL @ ₹${ltp} · net ₹${closed.netPnl ?? 0}`,
    });
    await stopLiveWatchIfFlat(session.openTrades);
  } else {
    throw new Error(`Unknown override action: ${req.action}`);
  }

  if (journalEntries.length) {
    await appendPinaxJournalBatch(sessionDate, journalEntries);
  }

  // Refresh marks + tuning
  if (session.openTrades.length) {
    const keys = session.openTrades.map((t) => t.instrumentKey);
    const quotes = await fetchUpstoxQuotes(accessToken, keys);
    const greeks = await fetchUpstoxOptionGreeks(accessToken, keys).catch(() => []);
    const ltpMap = buildTradeLtpMap(session.openTrades, { quotes, greeks });
    session.openTrades = markOpenTrades(session.openTrades, ltpMap);
  }

  session.tuning = await buildPinaxTuningProfile(sessionDate);
  session.recentJournal = await readPinaxJournal(sessionDate, 80);
  session.performance = summarizePinaxPerformance(session.openTrades, session.closedTrades);
  session.updatedAt = now;

  await savePinaxSession(session);
  return session;
}
