/**
 * PinaxForge paper broker — simulated fills at Upstox LTP. No live orders.
 */

import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import {
  buildTargetPremiums,
  defaultStopLossPremium,
  paperLotQty,
} from '@/lib/pinax-forge/risk-engine';
import {
  applyLockProfitTrail,
  shouldTimeStopNeverGreen,
} from '@/lib/pinax-forge/trade-skill';
import type {
  PinaxOptionCandidate,
  PinaxPaperTrade,
  PinaxSetupKind,
} from '@/lib/pinax-forge/types';
import type { UpstoxQuote } from '@/lib/upstox-market';
import { pinaxUpstoxWsFeed, WS_LTP_FRESH_MS } from '@/lib/pinax-forge/upstox-ws-feed';

function uid(): string {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function keyVariants(key: string): string[] {
  const raw = String(key || '').trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  out.add(raw.replace(/\|/g, ':'));
  out.add(raw.replace(/:/g, '|'));
  return [...out];
}

function identity(parts: string[]): string {
  return parts.join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type TradeLtpSource = {
  quotes: UpstoxQuote[];
  /** Optional Greeks last_price fallback (same keys Upstox returns). */
  greeks?: Array<{ instrumentKey: string; lastPrice: number }>;
};

/**
 * Resolve open-trade LTP with the same robustness as option-picker:
 * exact key → |/:` variants → trading-symbol match → Greeks last_price.
 * Exact Map.get(instrumentKey) alone fails when Upstox returns colon keys.
 */
export function resolveTradeLtp(
  trade: Pick<PinaxPaperTrade, 'instrumentKey' | 'tradingSymbol'>,
  source: TradeLtpSource
): number | null {
  // Prefer Upstox WS cache when fresh (<2s) — live-watch drives SL/target; poll is fallback.
  const wsLtp = pinaxUpstoxWsFeed.getCachedLtp(trade.instrumentKey, WS_LTP_FRESH_MS);
  if (wsLtp != null) return wsLtp;

  const variants = keyVariants(trade.instrumentKey);
  for (const key of variants) {
    const hit = source.quotes.find((q) => keyVariants(q.instrumentKey).includes(key));
    if (hit && hit.lastPrice > 0) return hit.lastPrice;
  }

  const sym = identity([trade.tradingSymbol]);
  if (sym) {
    const bySym = source.quotes.find((q) =>
      identity([q.instrumentKey, q.symbol]).includes(sym)
    );
    if (bySym && bySym.lastPrice > 0) return bySym.lastPrice;
  }

  const greeks = source.greeks ?? [];
  for (const key of variants) {
    const g = greeks.find((row) => keyVariants(row.instrumentKey).includes(key));
    if (g && g.lastPrice > 0) return g.lastPrice;
  }
  if (sym) {
    const gSym = greeks.find((row) => identity([row.instrumentKey]).includes(sym));
    if (gSym && gSym.lastPrice > 0) return gSym.lastPrice;
  }

  return null;
}

/** Build LTP map keyed by each trade's stored instrumentKey (robust resolve). */
export function buildTradeLtpMap(
  trades: PinaxPaperTrade[],
  source: TradeLtpSource
): Map<string, number> {
  const map = new Map<string, number>();
  for (const trade of trades) {
    const ltp = resolveTradeLtp(trade, source);
    if (ltp != null) map.set(trade.instrumentKey, ltp);
  }
  return map;
}

const MARK_PATH_MAX = 400;
const PROFIT_EPS = 0.5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Update MFE / MAE / everProfit / markPath from a live (or exit) premium. */
export function applyTradeExcursion(
  trade: PinaxPaperTrade,
  premium: number,
  opts?: { spot?: number; at?: string; recordPath?: boolean }
): PinaxPaperTrade {
  if (!Number.isFinite(premium) || premium <= 0) return trade;
  const at = opts?.at ?? new Date().toISOString();
  const delta = round2(premium - trade.entryPremium);
  const maxFavorablePts = round2(Math.max(trade.maxFavorablePts ?? 0, Math.max(0, delta)));
  const maxAdversePts = round2(Math.max(trade.maxAdversePts ?? 0, Math.max(0, -delta)));
  const highPremium = round2(
    Math.max(trade.highPremium ?? trade.entryPremium, premium)
  );
  const lowPremium = round2(
    Math.min(trade.lowPremium ?? trade.entryPremium, premium)
  );
  let everProfit = Boolean(trade.everProfit);
  let firstProfitAt = trade.firstProfitAt;
  if (!everProfit && delta >= PROFIT_EPS) {
    everProfit = true;
    firstProfitAt = at;
  }

  let markPath = trade.markPath ? [...trade.markPath] : [];
  if (opts?.recordPath !== false) {
    const last = markPath[markPath.length - 1];
    // Keep trail useful but not identical spam every tick at same px
    if (!last || Math.abs(last.premium - premium) >= 0.05 || markPath.length < 2) {
      markPath.push({
        at,
        premium: round2(premium),
        ...(opts?.spot != null && Number.isFinite(opts.spot)
          ? { spot: round2(opts.spot) }
          : {}),
      });
      if (markPath.length > MARK_PATH_MAX) {
        markPath = markPath.slice(-MARK_PATH_MAX);
      }
    }
  }

  return {
    ...trade,
    markPremium: round2(premium),
    highPremium,
    lowPremium,
    maxFavorablePts,
    maxAdversePts,
    everProfit,
    firstProfitAt,
    markPath,
  };
}

export function openPaperTrade(opts: {
  setupId: string;
  setupKind: PinaxSetupKind;
  candidate: PinaxOptionCandidate;
  entryPremium?: number;
  entrySpot?: number;
}): PinaxPaperTrade {
  const entryPremium = opts.entryPremium ?? opts.candidate.premium;
  const stopLossPremium = defaultStopLossPremium(entryPremium);
  const targetPremiums = buildTargetPremiums(entryPremium, stopLossPremium);
  const lotSize = opts.candidate.lotSize || 65;
  const openedAt = new Date().toISOString();

  return {
    id: uid(),
    openedAt,
    status: 'open',
    side: opts.candidate.side,
    instrumentKey: opts.candidate.instrumentKey,
    tradingSymbol: opts.candidate.tradingSymbol,
    strike: opts.candidate.strike,
    expiry: opts.candidate.expiry,
    qty: paperLotQty(),
    lotSize,
    entryPremium,
    entrySpot: opts.entrySpot,
    stopLossPremium,
    initialStopLossPremium: stopLossPremium,
    targetPremiums,
    setupKind: opts.setupKind,
    setupId: opts.setupId,
    highPremium: round2(entryPremium),
    lowPremium: round2(entryPremium),
    maxFavorablePts: 0,
    maxAdversePts: 0,
    everProfit: false,
    markPath: [
      {
        at: openedAt,
        premium: round2(entryPremium),
        ...(opts.entrySpot != null ? { spot: round2(opts.entrySpot) } : {}),
      },
    ],
  };
}

export type PaperExitReason = 'SL' | 'TARGET' | 'EOD' | 'MANUAL' | 'ADVERSE' | 'TIME';

export type ExitUpdate = {
  trade: PinaxPaperTrade;
  exitReason: PaperExitReason;
  exitPremium: number;
  rrAchieved?: number;
};

/**
 * Paper SL fill when live LTP touches the armed stop (order-window style).
 * Slip only clips the fill: never worse than SL − maxSlippage.
 * Example: SL 115.40, late LTP 108 → fill 114.90 (not 108). Does not freeze marks.
 */
export function paperStopFill(ltp: number, stopLossPremium: number): number {
  const slip = PINAX_FORGE_RULES.maxSlippagePts;
  const worst = round2(stopLossPremium - slip);
  return round2(Math.max(ltp, worst));
}

/** Paper target fill on touch — slip only caps the fill, marks stay live LTP. */
export function paperTargetFill(ltp: number, targetPremium: number): number {
  const slip = PINAX_FORGE_RULES.maxSlippagePts;
  const best = round2(targetPremium + slip);
  return round2(Math.min(ltp, best));
}

export function updatePaperTrades(
  openTrades: PinaxPaperTrade[],
  ltpByKey: Map<string, number>,
  forceEod = false,
  spot?: number
): {
  stillOpen: PinaxPaperTrade[];
  closed: ExitUpdate[];
  trailNotes: Array<{ tradeId: string; note: string }>;
} {
  const stillOpen: PinaxPaperTrade[] = [];
  const closed: ExitUpdate[] = [];
  const trailNotes: Array<{ tradeId: string; note: string }> = [];

  for (const trade of openTrades) {
    if (trade.status !== 'open') continue;
    const ltp = ltpByKey.get(trade.instrumentKey);
    if (ltp == null && !forceEod) {
      stillOpen.push(trade);
      continue;
    }
    const px = ltp ?? trade.entryPremium;
    let marked = applyTradeExcursion(trade, px, { spot, recordPath: true });
    if (!marked.initialStopLossPremium) {
      marked = { ...marked, initialStopLossPremium: marked.stopLossPremium };
    }

    const trailed = applyLockProfitTrail(marked);
    marked = trailed.trade;
    if (trailed.trailed && trailed.note) {
      trailNotes.push({ tradeId: marked.id, note: trailed.note });
    }

    if (forceEod) {
      closed.push(closeTrade(marked, px, 'EOD'));
      continue;
    }

    // Time-stop: never green too long → cut hope (fill at mark, not gap fantasy).
    if (shouldTimeStopNeverGreen(marked)) {
      closed.push(closeTrade(marked, px, 'TIME'));
      continue;
    }

    if (px <= marked.stopLossPremium) {
      const fill = paperStopFill(px, marked.stopLossPremium);
      closed.push(closeTrade(marked, fill, 'SL'));
      continue;
    }

    const hitTarget = marked.targetPremiums.find((t) => px >= t.price);
    if (hitTarget) {
      const fill = paperTargetFill(px, hitTarget.price);
      closed.push(closeTrade(marked, fill, 'TARGET', hitTarget.rr));
      continue;
    }

    stillOpen.push(marked);
  }

  return { stillOpen, closed, trailNotes };
}

/**
 * Drastic market flip only — close open CE/PE when desk bias has firmly reversed
 * AND a strong opposite TAKE is firing. Not every opposite candle / SIDEWAYS noise.
 * Does NOT open the new side; caller may enter once flat same tick.
 */
export function maybeMarketFlipExit(opts: {
  trade: PinaxPaperTrade;
  deskBias: 'UP' | 'DOWN' | 'SIDEWAYS';
  oppositeTakeConfidence: number;
  markPremium: number | null;
  minOppositeConfidence?: number;
  nowMs?: number;
}): ExitUpdate | null {
  const minConf =
    opts.minOppositeConfidence ?? PINAX_FORGE_RULES.marketFlipMinConfidence;
  if (opts.oppositeTakeConfidence < minConf) return null;

  const deskOpposite =
    (opts.trade.side === 'CE' && opts.deskBias === 'DOWN') ||
    (opts.trade.side === 'PE' && opts.deskBias === 'UP');
  if (PINAX_FORGE_RULES.marketFlipRequireBiasOpposite && !deskOpposite) {
    return null;
  }

  const nowMs = opts.nowMs ?? Date.now();
  const opened = new Date(opts.trade.openedAt).getTime();
  if (
    Number.isFinite(opened) &&
    nowMs - opened < PINAX_FORGE_RULES.marketFlipMinHoldMs
  ) {
    return null;
  }

  const mark = opts.markPremium;
  const exitPx =
    mark != null && mark > 0
      ? mark
      : Math.min(opts.trade.stopLossPremium, opts.trade.entryPremium * 0.85);
  return closeTrade(opts.trade, Math.round(exitPx * 100) / 100, 'ADVERSE');
}

/** @deprecated Prefer maybeMarketFlipExit — kept for any residual callers. */
export function maybeAdverseExit(opts: {
  trade: PinaxPaperTrade;
  spot: number;
  oppositeTakeConfidence: number;
  markPremium: number | null;
  minOppositeConfidence?: number;
  deskBias?: 'UP' | 'DOWN' | 'SIDEWAYS';
}): ExitUpdate | null {
  if (opts.deskBias) {
    return maybeMarketFlipExit({
      trade: opts.trade,
      deskBias: opts.deskBias,
      oppositeTakeConfidence: opts.oppositeTakeConfidence,
      markPremium: opts.markPremium,
      minOppositeConfidence: opts.minOppositeConfidence,
    });
  }
  return null;
}

function closeTrade(
  trade: PinaxPaperTrade,
  exitPremium: number,
  exitReason: PaperExitReason,
  rrAchieved?: number
): ExitUpdate {
  const withPath = applyTradeExcursion(trade, exitPremium, { recordPath: true });
  const gross =
    (exitPremium - withPath.entryPremium) * withPath.qty * withPath.lotSize;
  const net = gross - PINAX_FORGE_RULES.roundTripCostInr;
  const closed: PinaxPaperTrade = {
    ...withPath,
    status: 'closed',
    closedAt: new Date().toISOString(),
    exitPremium,
    markPremium: round2(exitPremium),
    grossPnl: Math.round(gross * 100) / 100,
    netPnl: Math.round(net * 100) / 100,
    exitReason,
    rrAchieved,
  };
  return { trade: closed, exitReason, exitPremium, rrAchieved };
}

export function closePaperTradeManual(
  trade: PinaxPaperTrade,
  exitPremium: number
): PinaxPaperTrade {
  return closeTrade(trade, exitPremium, 'MANUAL').trade;
}

export function markOpenTrades(
  openTrades: PinaxPaperTrade[],
  ltpByKey: Map<string, number>,
  spot?: number
): PinaxPaperTrade[] {
  return openTrades.map((t) => {
    const ltp = ltpByKey.get(t.instrumentKey);
    if (ltp == null) return t;
    let marked = applyTradeExcursion(t, ltp, { spot, recordPath: true });
    if (!marked.initialStopLossPremium) {
      marked = { ...marked, initialStopLossPremium: marked.stopLossPremium };
    }
    marked = applyLockProfitTrail(marked).trade;
    const gross = (ltp - marked.entryPremium) * marked.qty * marked.lotSize;
    const net = gross - PINAX_FORGE_RULES.roundTripCostInr;
    return {
      ...marked,
      grossPnl: Math.round(gross * 100) / 100,
      netPnl: Math.round(net * 100) / 100,
    };
  });
}

/** Short text for journal / EOD: High/Low after entry, MFE, MAE, ever green. */
export function formatTradeExcursion(trade: PinaxPaperTrade): string {
  const high =
    trade.highPremium ?? trade.entryPremium + (trade.maxFavorablePts ?? 0);
  const low =
    trade.lowPremium ?? trade.entryPremium - (trade.maxAdversePts ?? 0);
  const mfe = trade.maxFavorablePts ?? 0;
  const mae = trade.maxAdversePts ?? 0;
  const ever = trade.everProfit ? 'yes' : 'never';
  return `High ₹${round2(high)} · Low ₹${round2(low)} · up +₹${mfe} · down -₹${mae} · everProfit ${ever}`;
}
