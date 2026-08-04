/**
 * NexusPulse real-option session study — port of BOTS backtest_session_real_options.py
 * Signals: Nifty 3m UT (KV=1, ATR=10) + 5m agree (ATR=14). PnL from Upstox option 1m closes (ATM).
 */

import {
  fetchExpiredExpiries,
  fetchExpiredOptionContracts,
  fetchInstrumentDayCandles,
  fetchOptionContractList,
  loadOptionDayCloses,
  NIFTY_UNDERLYING_KEY,
  premiumAtOrBefore,
  type UpstoxOptionContractRow,
} from '@/lib/upstox-expired-instruments';
import { istDate } from '@/lib/pinax-forge/ist';
import { laneEntryAllowed, laneForceFlatAt, shouldSquareOffAll } from '@/lib/nexus-pulse/lanes';
import { resampleMinutes } from '@/lib/nexus-pulse/resample';
import { NEXUS_PULSE_RULES, type NexusLaneId } from '@/lib/nexus-pulse/rules';
import { runUtBot } from '@/lib/nexus-pulse/ut-bot';
import { shouldTrailExit } from '@/lib/nexus-pulse/paper-broker';
import { loadStudyRunCache, saveStudyRunCache } from '@/lib/nexus-pulse/study-cache';
import {
  STUDY_1M_WARMUP_BARS,
  lastClosedTfAtOrBefore,
  sessionSliceCash,
  studyWantSide,
} from '@/lib/nexus-pulse/study-parity';
import type { Candle } from '@/lib/nejoic';
import type { NexusPaperTrade } from '@/lib/nexus-pulse/types';

export type NexusRealOptionStudyRun = {
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  days: number;
  note: string;
  premiumModel: string;
  optionFetches: number;
  optionMisses: number;
  /** Individual study trades — shown in desk Closed trades bar after run. */
  trades: NexusPaperTrade[];
  cachedAt?: string;
  fromCache?: boolean;
  byLane: Partial<
    Record<
      NexusLaneId,
      { totalTrades: number; wins: number; losses: number; winRate: number; grossPnl: number; netPnl: number }
    >
  >;
};

const STRIKE_STEP = 50;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function weekdays(fromDate: string, toDate: string): string[] {
  if (fromDate > toDate) return [];
  const out: string[] = [];
  const start = new Date(`${fromDate}T12:00:00Z`);
  const end = new Date(`${toDate}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

function atmStrike(spot: number): number {
  return Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
}

class OptionTape {
  private expiries: string[] | null = null;
  private contracts = new Map<string, UpstoxOptionContractRow[]>();
  private liveByExpiry = new Map<string, UpstoxOptionContractRow[]>();
  private closes = new Map<string, Map<number, number>>();
  misses = 0;
  fetches = 0;

  constructor(
    private accessToken: string,
    private todayIso: string
  ) {}

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async allExpiries(): Promise<string[]> {
    if (this.expiries) return this.expiries;
    const expired = await fetchExpiredExpiries(this.accessToken);
    await this.sleep(120);
    const live = await fetchOptionContractList(this.accessToken);
    await this.sleep(120);
    const liveEx = [
      ...new Set(live.map((c) => String(c.expiry ?? '').slice(0, 10)).filter(Boolean)),
    ].sort();
    this.expiries = [...new Set([...expired, ...liveEx])].sort();
    return this.expiries;
  }

  async nearestExpiry(day: string): Promise<string | null> {
    const ex = await this.allExpiries();
    for (const e of ex) {
      if (e >= day) return e;
    }
    return null;
  }

  private async contractsFor(expiry: string): Promise<UpstoxOptionContractRow[]> {
    if (this.contracts.has(expiry)) return this.contracts.get(expiry)!;
    const today = this.todayIso.slice(0, 10);
    let rows: UpstoxOptionContractRow[] = [];
    if (expiry < today) {
      rows = await fetchExpiredOptionContracts(this.accessToken, expiry);
      await this.sleep(120);
    } else {
      if (!this.liveByExpiry.size) {
        const live = await fetchOptionContractList(this.accessToken);
        for (const c of live) {
          const ek = String(c.expiry ?? '').slice(0, 10);
          const list = this.liveByExpiry.get(ek) ?? [];
          list.push(c);
          this.liveByExpiry.set(ek, list);
        }
      }
      rows = [...(this.liveByExpiry.get(expiry) ?? [])];
    }
    this.contracts.set(expiry, rows);
    return rows;
  }

  async pick(day: string, spot: number, option: 'CE' | 'PE'): Promise<{ strike: number; ik: string } | null> {
    const expiry = await this.nearestExpiry(day);
    if (!expiry) return null;
    const strike = atmStrike(spot);
    const want = option.toUpperCase();
    const rows = await this.contractsFor(expiry);
    let best: UpstoxOptionContractRow | null = null;
    let bestDist = 1e18;
    for (const c of rows) {
      if (String(c.instrument_type ?? '').toUpperCase() !== want) continue;
      const s = Number(c.strike_price ?? 0);
      const dist = Math.abs(s - strike);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (!best || bestDist > STRIKE_STEP) return null;
    const ik = String(best.instrument_key ?? '');
    if (!ik) return null;
    return { strike: Number(best.strike_price), ik };
  }

  private async loadCloses(ik: string, day: string): Promise<Map<number, number>> {
    const key = `${ik}|${day}`;
    if (this.closes.has(key)) return this.closes.get(key)!;
    this.fetches += 1;
    const map = await loadOptionDayCloses(this.accessToken, ik, day, this.todayIso);
    await this.sleep(180);
    this.closes.set(key, map);
    return map;
  }

  async premiumAt(ik: string, day: string, tsMs: number): Promise<number | null> {
    const closes = await this.loadCloses(ik, day);
    if (!closes.size) {
      this.misses += 1;
      return null;
    }
    const p = premiumAtOrBefore(closes, tsMs);
    if (p == null) this.misses += 1;
    return p;
  }
}

async function backtestDay(
  df1m: Candle[],
  laneId: NexusLaneId,
  tape: OptionTape,
  day: string,
  lot: number
): Promise<NexusPaperTrade[]> {
  if (df1m.length < 80) return [];

  const bars3 = runUtBot(resampleMinutes(df1m, 3), { keyValue: 1, atrPeriod: 10 });
  const bars5 = runUtBot(resampleMinutes(df1m, 5), { keyValue: 1, atrPeriod: 14 });

  const trades: NexusPaperTrade[] = [];
  let openSide: 'CE' | 'PE' | null = null;
  let openIk = '';
  let openStrike = 0;
  let entryPrem = 0;
  let entrySpot = 0;
  let entryTs = '';
  let maxUp = 0;
  let lastMark = 0;
  let last3mTs: string | null = null;

  for (let i = STUDY_1M_WARMUP_BARS; i < df1m.length; i++) {
    const bar = df1m[i];
    const barAt = new Date(bar.t);
    const tsMs = barAt.getTime();
    const spot = bar.close;

    const r3 = lastClosedTfAtOrBefore(bars3, 3, tsMs);
    const r5 = lastClosedTfAtOrBefore(bars5, 5, tsMs);
    if (!r3 || !r5) continue;

    const buy3 = r3.buy;
    const sell3 = r3.sell;
    const pos5 = r5.pos;
    const t3 = r3.t;

    const closeTrade = (reason: NexusPaperTrade['exitReason'], exitPrem: number) => {
      const gross = round2((exitPrem - entryPrem) * lot);
      const net = round2(gross - NEXUS_PULSE_RULES.roundTripCostInr);
      trades.push({
        id: `study-${day}-${trades.length}`,
        laneId,
        openedAt: entryTs,
        closedAt: bar.t,
        status: 'closed',
        side: openSide!,
        instrumentKey: openIk,
        tradingSymbol: openIk,
        strike: openStrike,
        qty: 1,
        lotSize: lot,
        entryPremium: round2(entryPrem),
        entrySpot,
        stopLossPremium: 0,
        exitPremium: round2(exitPrem),
        exitReason: reason,
        highPremium: round2(entryPrem + maxUp),
        lowPremium: round2(entryPrem),
        maxFavorablePts: round2(maxUp),
        maxAdversePts: 0,
        grossPnl: gross,
        netPnl: net,
      });
      openSide = null;
      openIk = '';
      maxUp = 0;
      lastMark = 0;
    };

    if (openSide) {
      const p = (await tape.premiumAt(openIk, day, tsMs)) ?? lastMark ?? entryPrem;
      lastMark = p;
      const up = Math.max(0, p - entryPrem);
      maxUp = Math.max(maxUp, up);

      const markTrade: NexusPaperTrade = {
        id: 'study-open',
        laneId,
        openedAt: entryTs,
        status: 'open',
        side: openSide,
        instrumentKey: openIk,
        tradingSymbol: openIk,
        strike: openStrike,
        qty: 1,
        lotSize: lot,
        entryPremium: entryPrem,
        entrySpot,
        stopLossPremium: 0,
        markPremium: p,
        highPremium: entryPrem,
        lowPremium: entryPrem,
        maxFavorablePts: maxUp,
        maxAdversePts: 0,
      };

      if (shouldTrailExit(markTrade, p)) {
        closeTrade('TRAIL', p);
        continue;
      }
      if (shouldSquareOffAll(barAt)) {
        closeTrade('SQ', p);
        continue;
      }
      if (laneId === 'morning_open_stop_15' && laneForceFlatAt(laneId, barAt)) {
        closeTrade('LANE_B_15', p);
        continue;
      }
      if (t3 !== last3mTs) {
        if (openSide === 'CE' && sell3) {
          closeTrade('UT_3M', p);
          last3mTs = t3;
          continue;
        }
        if (openSide === 'PE' && buy3) {
          closeTrade('UT_3M', p);
          last3mTs = t3;
          continue;
        }
        if (openSide === 'CE' && pos5 === -1) closeTrade('UT_5M', p);
        else if (openSide === 'PE' && pos5 === 1) closeTrade('UT_5M', p);
      }
    }

    if (shouldSquareOffAll(barAt) || openSide) continue;
    if (!laneEntryAllowed(laneId, barAt).ok) continue;
    if (t3 === last3mTs) continue;

    let want = studyWantSide({ buy3, sell3, pos5 });
    if (!want) continue;

    const picked = await tape.pick(day, spot, want);
    if (!picked) continue;
    const prem = await tape.premiumAt(picked.ik, day, tsMs);
    if (prem == null || prem <= 0) continue;

    openSide = want;
    openIk = picked.ik;
    openStrike = picked.strike;
    entrySpot = spot;
    entryPrem = prem;
    entryTs = bar.t;
    maxUp = 0;
    lastMark = prem;
    last3mTs = t3;
  }

  if (openSide) {
    const bar = df1m[df1m.length - 1];
    const tsMs = new Date(bar.t).getTime();
    const p = ((await tape.premiumAt(openIk, day, tsMs)) ?? lastMark) || entryPrem;
    const gross = round2((p - entryPrem) * lot);
    trades.push({
      id: `study-${day}-eod`,
      laneId,
      openedAt: entryTs,
      closedAt: bar.t,
      status: 'closed',
      side: openSide,
      instrumentKey: openIk,
      tradingSymbol: openIk,
      strike: openStrike,
      qty: 1,
      lotSize: lot,
      entryPremium: round2(entryPrem),
      entrySpot,
      stopLossPremium: 0,
      exitPremium: round2(p),
      exitReason: 'EOD',
      highPremium: round2(entryPrem + maxUp),
      lowPremium: round2(entryPrem),
      maxFavorablePts: round2(maxUp),
      maxAdversePts: 0,
      grossPnl: gross,
      netPnl: round2(gross - NEXUS_PULSE_RULES.roundTripCostInr),
    });
  }

  return trades;
}

function summarizeTrades(trades: NexusPaperTrade[]) {
  const wins = trades.filter((t) => (t.grossPnl ?? 0) > 0).length;
  const grossPnl = round1(trades.reduce((s, t) => s + (t.grossPnl ?? 0), 0));
  const netPnl = round2(trades.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const daySet = new Set(trades.map((t) => t.openedAt.slice(0, 10)));
  return {
    totalTrades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? round1((wins * 100) / trades.length) : 0,
    grossPnl,
    netPnl,
    days: daySet.size,
  };
}

/** Max ~31 calendar days — heavy Upstox option history fetches. */
export async function runNexusRealOptionStudy(opts: {
  accessToken: string;
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
  /** Skip disk cache and re-fetch Upstox (results for “today” can still move). */
  forceRefresh?: boolean;
}): Promise<NexusRealOptionStudyRun> {
  const todayIso = istDate();
  const fromDate = opts.fromDate.slice(0, 10);
  let toDate = opts.toDate.slice(0, 10);
  if (fromDate > toDate) {
    throw new Error('From date must be before to date');
  }
  const maxSpan = 31;
  const spanDays =
    (new Date(`${toDate}T12:00:00Z`).getTime() - new Date(`${fromDate}T12:00:00Z`).getTime()) /
    86_400_000;
  if (spanDays > maxSpan) {
    const clamp = new Date(`${fromDate}T12:00:00Z`);
    clamp.setUTCDate(clamp.getUTCDate() + maxSpan);
    toDate = clamp.toISOString().slice(0, 10);
  }

  const lanes =
    opts.activeLanes.length > 0
      ? opts.activeLanes
      : (['morning_open_stop_15'] as NexusLaneId[]);

  if (!opts.forceRefresh) {
    const cached = await loadStudyRunCache<NexusRealOptionStudyRun>({
      desk: 'nifty',
      fromDate,
      toDate,
      lanes,
    });
    if (cached?.trades) {
      return {
        ...cached,
        fromCache: true,
        note: `${cached.note || ''} · Served from cache (same rules; click Force refresh to re-pull Upstox).`.trim(),
      };
    }
  }

  const tape = new OptionTape(opts.accessToken, todayIso);
  const lot = NEXUS_PULSE_RULES.niftyLotSize;
  const days = weekdays(fromDate, toDate);
  const allTrades: NexusPaperTrade[] = [];

  for (const day of days) {
    let niftyDay: Candle[] = [];
    try {
      niftyDay = sessionSliceCash(
        await fetchInstrumentDayCandles(opts.accessToken, NIFTY_UNDERLYING_KEY, day, todayIso)
      );
    } catch {
      niftyDay = [];
    }
    if (niftyDay.length < 80) continue;

    for (const laneId of lanes) {
      const dayTrades = await backtestDay(niftyDay, laneId, tape, day, lot);
      allTrades.push(...dayTrades);
    }
  }

  const summary = summarizeTrades(allTrades);
  const byLane: NexusRealOptionStudyRun['byLane'] = {};
  for (const laneId of lanes) {
    byLane[laneId] = summarizeTrades(allTrades.filter((t) => t.laneId === laneId));
  }

  const includesToday = fromDate <= todayIso && toDate >= todayIso;
  const run: NexusRealOptionStudyRun = {
    fromDate,
    toDate,
    activeLanes: lanes,
    totalTrades: summary.totalTrades,
    wins: summary.wins,
    losses: summary.losses,
    winRate: summary.winRate,
    grossPnl: summary.grossPnl,
    netPnl: summary.netPnl,
    days: summary.days,
    premiumModel: 'REAL Upstox ATM option 1m close (expired + live FO)',
    optionFetches: tape.fetches,
    optionMisses: tape.misses,
    byLane,
    trades: allTrades.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt))),
    fromCache: false,
    note:
      'Same engine as D:\\BOTS\\NexusPulse backtest_session_real_options.py — UT 3m/5m + real option LTP path (ATM). Gross PnL = (exit−entry)×lot; net subtracts ₹70/trade (1 lot).' +
      (includesToday
        ? ' WARNING: range includes TODAY — live FO candles still form; Force refresh can change P&L until the session is closed. Past closed days are stable.'
        : '') +
      (tape.misses > 0 ? ` Option mark misses: ${tape.misses} (rate-limit / missing candles).` : ''),
  };

  await saveStudyRunCache({ desk: 'nifty', fromDate, toDate, lanes, run }).catch(() => undefined);
  return run;
}

/** Single-day replay — same trades as Real Option Study for one date. */
export async function replayNexusRealOptionsForDay(opts: {
  accessToken: string;
  date: string;
  activeLanes: NexusLaneId[];
}): Promise<{
  trades: NexusPaperTrade[];
  optionFetches: number;
  optionMisses: number;
  byLane: NexusRealOptionStudyRun['byLane'];
  premiumModel: string;
}> {
  const date = opts.date.slice(0, 10);
  const todayIso = istDate();
  const lanes =
    opts.activeLanes.length > 0
      ? opts.activeLanes
      : (['morning_open_stop_15'] as NexusLaneId[]);

  const tape = new OptionTape(opts.accessToken, todayIso);
  const lot = NEXUS_PULSE_RULES.niftyLotSize;

  const niftyDay = sessionSliceCash(
    await fetchInstrumentDayCandles(opts.accessToken, NIFTY_UNDERLYING_KEY, date, todayIso)
  );
  if (niftyDay.length < 80) {
    throw new Error(
      `Not enough Nifty 1m bars for ${date} (${niftyDay.length}) — market may be closed or Upstox history not ready yet`
    );
  }

  const allTrades: NexusPaperTrade[] = [];
  for (const laneId of lanes) {
    allTrades.push(...(await backtestDay(niftyDay, laneId, tape, date, lot)));
  }

  const byLane: NexusRealOptionStudyRun['byLane'] = {};
  for (const laneId of lanes) {
    byLane[laneId] = summarizeTrades(allTrades.filter((t) => t.laneId === laneId));
  }

  return {
    trades: allTrades.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt))),
    optionFetches: tape.fetches,
    optionMisses: tape.misses,
    byLane,
    premiumModel: 'REAL Upstox ATM option 1m close (expired + live FO)',
  };
}
