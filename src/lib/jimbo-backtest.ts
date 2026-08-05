/**
 * Jimbo paper CCI backtest — Upstox original prices only.
 * Equity OHLC: Upstox Historical V3.
 * Option entry/exit: Upstox option contract OHLC (active or expired instruments).
 * No Yahoo · no modelled premiums.
 */

import {
  computeCci,
  detectZeroCrossAt,
  priceActionConfirm,
  type OhlcBar,
} from '@/lib/cci';
import {
  JIMBO_SESSION_CLOSE_HHMM,
  resolveJimboScanUniverse,
  roundJimboStrike,
  type JimboScanScope,
  type JimboSettings,
} from '@/lib/jimbo';
import { resolveInstrumentKeys } from '@/lib/instruments';
import {
  evaluatePaperPremiumExit,
  isJimboEntryPremiumAllowed,
  JIMBO_MIN_OPTION_ENTRY_PREMIUM,
  roundPremium,
} from '@/lib/paper-exit';
import { inTradeWindow } from '@/lib/option-sim';
import {
  fetchIndexOptionContracts,
  pickAtmContract,
  type OptionSide,
} from '@/lib/upstox-options';
import {
  fetchUpstoxHistoricalWindow,
  fetchUpstoxInstrumentRange,
  type UpstoxHistCandle,
} from '@/lib/upstox-historical';
import { UPSTOX_API_BASE } from '@/lib/upstox';

export type JimboBacktestTrade = {
  id: string;
  symbol: string;
  option: 'CE' | 'PE';
  strike: number;
  spot: number;
  lots: number;
  lotSize: number;
  entryAt: string;
  exitAt: string;
  entryPremium: number;
  exitPremium: number;
  pnl: number;
  exitWhy: string;
  cciPrev: number;
  cciCurr: number;
  cciPeriod: number;
  crossDir: 'up_through_zero' | 'down_through_zero';
  confidence: number;
  paDetail: string;
  note: string;
  instrumentKey?: string;
  tradingSymbol?: string;
  priceSource: 'upstox';
};

export type JimboBacktestResult = {
  ok: true;
  fromDate: string;
  toDate: string;
  timeframe: string;
  yahooInterval?: string;
  scanned: number;
  candleOk: number;
  trades: JimboBacktestTrade[];
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  note: string;
  backupPath?: string;
  barsInWindow?: number;
  dataFromDate?: string | null;
  dataToDate?: string | null;
  emptyReason?: 'no_history_in_range' | 'no_setups' | 'ok' | 'no_token';
  priceSource: 'upstox';
};

export type JimboBacktestOpts = {
  accessToken: string;
  settings: Pick<
    JimboSettings,
    | 'cciPeriod'
    | 'requirePaConfirm'
    | 'minConfidence'
    | 'primaryTimeframe'
    | 'scanScope'
    | 'maxLiquidityRank'
    | 'stopLossPoints'
    | 'targetPoints'
    | 'trailingStopPoints'
    | 'trailingActivatePoints'
    | 'mfeProfitTrail'
    | 'mfeTrailTriggerPts'
    | 'mfeTrailKeepFrac'
    | 'maxLotsPerTrade'
    | 'enforceMaxLossLimit'
    | 'enforceDailyTargetLimit'
    | 'enforceMaxTradesLimit'
    | 'dailyMaxLoss'
    | 'dailyProfitTarget'
    | 'maxTradesPerDay'
  >;
  focusSymbols?: string[];
  fromDate?: string;
  toDate?: string;
  lookbackDays?: number;
  maxTradesTotal?: number;
};

function ymdFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function parseDayStartMs(ymd: string): number {
  return new Date(`${ymd}T00:00:00+05:30`).getTime();
}

function parseDayEndMs(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999+05:30`).getTime();
}

function mapTfToUpstox(tf: string | undefined): {
  unit: 'minutes' | 'hours' | 'days';
  interval: number;
  expiredInterval: string;
} {
  switch (tf) {
    case '1m':
      return { unit: 'minutes', interval: 1, expiredInterval: '1minute' };
    case '2m':
      return { unit: 'minutes', interval: 2, expiredInterval: '1minute' };
    case '3m':
      return { unit: 'minutes', interval: 3, expiredInterval: '3minute' };
    case '15m':
      return { unit: 'minutes', interval: 15, expiredInterval: '15minute' };
    case '30m':
      return { unit: 'minutes', interval: 30, expiredInterval: '30minute' };
    case '1H':
      return { unit: 'hours', interval: 1, expiredInterval: '30minute' };
    case '1D':
      return { unit: 'days', interval: 1, expiredInterval: 'day' };
    case '5m':
    default:
      return { unit: 'minutes', interval: 5, expiredInterval: '5minute' };
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function upstoxJson<T>(url: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Upstox fetch failed');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Upstox ${res.status}: ${text.slice(0, 220)}`);
  return JSON.parse(text) as T;
}

type ContractRow = {
  instrument_key?: string;
  trading_symbol?: string;
  strike_price?: number;
  instrument_type?: string;
  option_type?: string;
  expiry?: string;
  lot_size?: number;
};

async function listExpiries(token: string, underlyingKey: string): Promise<string[]> {
  try {
    const url = new URL(`${UPSTOX_API_BASE}/expired-instruments/expiries`);
    url.searchParams.set('instrument_key', underlyingKey);
    const json = await upstoxJson<{ data?: string[] }>(url.toString(), token);
    return (json.data || []).map((d) => String(d).slice(0, 10)).sort();
  } catch {
    return [];
  }
}

async function fetchExpiredContracts(
  token: string,
  underlyingKey: string,
  expiry: string
): Promise<ContractRow[]> {
  const url = new URL(`${UPSTOX_API_BASE}/expired-instruments/option/contract`);
  url.searchParams.set('instrument_key', underlyingKey);
  url.searchParams.set('expiry_date', expiry);
  const json = await upstoxJson<{ data?: ContractRow[] }>(url.toString(), token);
  return Array.isArray(json.data) ? json.data : [];
}

function pickExpiry(expiries: string[], tradeDay: string): string | null {
  const future = expiries.filter((e) => e >= tradeDay);
  if (future.length) return future[0];
  return expiries.length ? expiries[expiries.length - 1] : null;
}

async function resolveAtmOption(opts: {
  token: string;
  underlyingKey: string;
  spot: number;
  side: OptionSide;
  tradeDay: string;
  preferredStrike: number;
}): Promise<{
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  lotSize: number;
  expiry: string;
  expired: boolean;
} | null> {
  // Prefer live chain (covers current/near expiries), then expired catalogue.
  let rows: ContractRow[] = [];
  let expired = false;
  let expiry = '';
  try {
    rows = await fetchIndexOptionContracts(opts.token, opts.underlyingKey);
  } catch {
    rows = [];
  }

  const liveExpiries = [
    ...new Set(rows.map((r) => String(r.expiry || '').slice(0, 10)).filter(Boolean)),
  ].sort();
  expiry = pickExpiry(liveExpiries, opts.tradeDay) || '';

  if (expiry) {
    rows = rows.filter((r) => String(r.expiry || '').slice(0, 10) === expiry);
  }

  if (!rows.length) {
    const expiredList = await listExpiries(opts.token, opts.underlyingKey);
    expiry = pickExpiry(expiredList, opts.tradeDay) || '';
    if (!expiry) return null;
    rows = await fetchExpiredContracts(opts.token, opts.underlyingKey, expiry);
    expired = true;
    await pause(120);
  }

  const contract = pickAtmContract(rows, opts.spot, opts.side, opts.preferredStrike);
  if (!contract?.instrumentKey) return null;
  return {
    instrumentKey: contract.instrumentKey,
    tradingSymbol: contract.tradingSymbol,
    strike: contract.strike,
    lotSize: contract.lotSize || 1,
    expiry: contract.expiry || expiry,
    expired,
  };
}

async function fetchOptionBars(opts: {
  token: string;
  instrumentKey: string;
  fromDate: string;
  toDate: string;
  unit: 'minutes' | 'hours' | 'days';
  interval: number;
  expiredInterval: string;
  expired: boolean;
}): Promise<UpstoxHistCandle[]> {
  if (!opts.expired) {
    const live = await fetchUpstoxInstrumentRange({
      accessToken: opts.token,
      instrumentKey: opts.instrumentKey,
      unit: opts.unit,
      interval: opts.interval,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      pauseMs: 140,
    });
    if (live.ok && live.candles.length) return live.candles;
  }

  // Expired instruments historical (path interval names differ)
  const encoded = encodeURIComponent(opts.instrumentKey);
  const url =
    `${UPSTOX_API_BASE}/expired-instruments/historical-candle/` +
    `${encoded}/${opts.expiredInterval}/${opts.toDate}/${opts.fromDate}`;
  try {
    const json = await upstoxJson<{
      data?: { candles?: [string, number, number, number, number, number?, number?][] };
    }>(url, opts.token);
    const raw = json.data?.candles || [];
    return raw
      .map((row) => ({
        t: new Date(row[0]).toISOString(),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5] ?? 0),
        oi: Number(row[6] ?? 0),
      }))
      .filter((b) => Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => a.t.localeCompare(b.t));
  } catch {
    // Last try: single-window V3
    const one = await fetchUpstoxHistoricalWindow({
      accessToken: opts.token,
      instrumentKey: opts.instrumentKey,
      unit: opts.unit,
      interval: opts.interval,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
    });
    return one.ok ? one.candles : [];
  }
}

type Series = {
  symbol: string;
  name: string;
  lotSize: number;
  underlyingKey: string;
  bars: OhlcBar[];
  cci: (number | null)[];
};

type Cand = {
  t: string;
  symbol: string;
  underlyingKey: string;
  lotSize: number;
  bias: 'CE' | 'PE';
  strike: number;
  spot: number;
  conf: number;
  cciPrev: number;
  cciCurr: number;
  cciPeriod: number;
  crossDir: 'up_through_zero' | 'down_through_zero';
  paDetail: string;
  note: string;
};

/**
 * Run Jimbo CCI backtest on Upstox original equity + option prices.
 */
export async function runJimboPaperBacktest(
  opts: JimboBacktestOpts
): Promise<JimboBacktestResult> {
  const token = opts.accessToken?.trim();
  if (!token) {
    return {
      ok: true,
      fromDate: '',
      toDate: '',
      timeframe: opts.settings.primaryTimeframe || '5m',
      scanned: 0,
      candleOk: 0,
      trades: [],
      wins: 0,
      losses: 0,
      winRate: 0,
      netPnl: 0,
      emptyReason: 'no_token',
      priceSource: 'upstox',
      note: 'Connect Upstox — Jimbo backtest uses Upstox historical equity + option OHLC only (no simulation).',
    };
  }

  const tf = opts.settings.primaryTimeframe || '5m';
  const upstoxTf = mapTfToUpstox(tf);
  const todayYmd = ymdFromMs(Date.now());
  let toYmd = opts.toDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.toDate) ? opts.toDate : todayYmd;
  let fromYmd =
    opts.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)
      ? opts.fromDate
      : ymdFromMs(Date.now() - Math.max(7, Math.min(31, opts.lookbackDays ?? 30)) * 86400000);
  if (fromYmd > toYmd) {
    const tmp = fromYmd;
    fromYmd = toYmd;
    toYmd = tmp;
  }
  // Allow multi-month / 1-year studies via Upstox chunked history (no hard 28-day clamp).
  const spanDays = Math.max(
    1,
    Math.ceil((parseDayEndMs(toYmd) - parseDayStartMs(fromYmd)) / 86400000) + 1
  );
  const fromMs = parseDayStartMs(fromYmd);
  const toMs = parseDayEndMs(toYmd);

  const cciPeriod = Math.max(5, opts.settings.cciPeriod || 20);
  const requirePa = opts.settings.requirePaConfirm !== false;
  const minConf = opts.settings.minConfidence ?? 75;
  const lots = Math.min(3, Math.max(1, opts.settings.maxLotsPerTrade || 1));
  const maxTradesTotal =
    opts.maxTradesTotal != null && opts.maxTradesTotal > 0
      ? Math.floor(opts.maxTradesTotal)
      : 0;
  const enforceDayTrades = opts.settings.enforceMaxTradesLimit === true;
  const maxPerDay = Math.max(1, opts.settings.maxTradesPerDay || 10);
  const sessionEnd = `${String(JIMBO_SESSION_CLOSE_HHMM.hour).padStart(2, '0')}:${String(
    JIMBO_SESSION_CLOSE_HHMM.minute
  ).padStart(2, '0')}`;

  const exitPts = {
    stopLossPoints: opts.settings.stopLossPoints || 10,
    targetPoints: opts.settings.targetPoints || 18,
    trailingStopPoints: opts.settings.trailingStopPoints || 0,
    trailingActivatePoints: opts.settings.trailingActivatePoints || 0,
    mfeTrailEnabled: opts.settings.mfeProfitTrail !== false,
    mfeTrailTriggerPts: opts.settings.mfeTrailTriggerPts || 7,
    mfeTrailKeepFrac: opts.settings.mfeTrailKeepFrac ?? 0.5,
  };

  const universeAll = resolveJimboScanUniverse(
    (opts.settings.scanScope || 'liquid') as JimboScanScope,
    {
      focusSymbols: opts.focusSymbols,
      maxLiquidityRank: opts.settings.maxLiquidityRank,
    }
  );
  // Cap names so long Upstox runs finish (1y needs fewer names × more monthly chunks)
  const maxNames =
    spanDays > 180
      ? Math.min(8, universeAll.length)
      : spanDays > 60
        ? Math.min(12, universeAll.length)
        : opts.settings.scanScope === 'full'
          ? Math.min(25, universeAll.length)
          : Math.min(15, universeAll.length);
  const universe = universeAll.slice(0, maxNames);

  const resolved = await resolveInstrumentKeys(universe.map((u) => u.symbol));

  // Warm-up before fromDate for CCI
  const warmFrom = ymdFromMs(fromMs - Math.max(cciPeriod + 5, 40) * upstoxTf.interval * 60_000);

  const fetched = await mapPool(universe, 4, async (stock) => {
    const row = resolved.get(stock.symbol);
    if (!row?.instrumentKey) return null;
    const hist = await fetchUpstoxInstrumentRange({
      accessToken: token,
      instrumentKey: row.instrumentKey,
      unit: upstoxTf.unit,
      interval: upstoxTf.interval,
      fromDate: warmFrom < fromYmd ? warmFrom : fromYmd,
      toDate: toYmd,
      pauseMs: spanDays > 90 ? 140 : 100,
    });
    await pause(40);
    if (!hist.ok || hist.candles.length < cciPeriod + 5) return null;
    const bars: OhlcBar[] = hist.candles.map((c) => ({
      t: c.t,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    return {
      symbol: stock.symbol,
      name: stock.name,
      lotSize: stock.lotSize,
      underlyingKey: row.instrumentKey,
      bars,
      cci: computeCci(bars, cciPeriod),
    } satisfies Series;
  });

  const seriesList = fetched.filter((s): s is Series => Boolean(s));

  let barsInWindow = 0;
  let dataMinMs = Number.POSITIVE_INFINITY;
  let dataMaxMs = 0;
  for (const s of seriesList) {
    for (const b of s.bars) {
      const ms = new Date(b.t).getTime();
      if (ms < dataMinMs) dataMinMs = ms;
      if (ms > dataMaxMs) dataMaxMs = ms;
      if (ms >= fromMs && ms <= toMs) barsInWindow += 1;
    }
  }
  const dataFromYmd =
    Number.isFinite(dataMinMs) && dataMinMs < Number.POSITIVE_INFINITY
      ? ymdFromMs(dataMinMs)
      : null;
  const dataToYmd = dataMaxMs > 0 ? ymdFromMs(dataMaxMs) : null;

  const candidates: Cand[] = [];
  for (const s of seriesList) {
    for (let i = cciPeriod; i < s.bars.length; i++) {
      const bar = s.bars[i];
      const barMs = new Date(bar.t).getTime();
      if (barMs < fromMs || barMs > toMs) continue;
      if (!inTradeWindow(bar.t, '09:15', sessionEnd)) continue;
      const cross = detectZeroCrossAt(s.cci, i);
      if (!cross) continue;
      const slice = s.bars.slice(0, i + 1);
      const pa = priceActionConfirm(slice, cross.direction);
      if (requirePa && !pa.ok) continue;
      const bias: 'CE' | 'PE' =
        cross.direction === 'up_through_zero' ? 'CE' : 'PE';
      const spot = bar.close;
      const strike = roundJimboStrike(spot);
      const conf = Math.min(96, 78 + Math.min(10, Math.abs(cross.curr)));
      if (conf < minConf) continue;
      candidates.push({
        t: bar.t,
        symbol: s.symbol,
        underlyingKey: s.underlyingKey,
        lotSize: s.lotSize,
        bias,
        strike,
        spot,
        conf,
        cciPrev: Math.round(cross.prev * 10) / 10,
        cciCurr: Math.round(cross.curr * 10) / 10,
        cciPeriod,
        crossDir: cross.direction,
        paDetail: pa.detail,
        note: `CCI(${cciPeriod}) ${cross.prev.toFixed(1)}→${cross.curr.toFixed(1)} · ${
          cross.direction === 'up_through_zero' ? '− to + → CE' : '+ to − → PE'
        } · ${pa.detail}`,
      });
    }
  }
  candidates.sort((a, b) => {
    const c = a.t.localeCompare(b.t);
    if (c !== 0) return c;
    return b.conf - a.conf;
  });

  const trades: JimboBacktestTrade[] = [];
  let dayPnl = 0;
  let dayKey = '';
  let dayOpens = 0;
  let totalOpens = 0;
  let cursor = 0;
  let nextAllowedAt = '';
  let skippedNoOption = 0;
  const contractCache = new Map<
    string,
    Awaited<ReturnType<typeof resolveAtmOption>>
  >();

  while (cursor < candidates.length) {
    const c = candidates[cursor++];
    if (nextAllowedAt && c.t < nextAllowedAt) continue;

    const d = c.t.slice(0, 10);
    if (d !== dayKey) {
      dayKey = d;
      dayPnl = 0;
      dayOpens = 0;
    }
    if (maxTradesTotal > 0 && totalOpens >= maxTradesTotal) break;
    if (enforceDayTrades && dayOpens >= maxPerDay) continue;
    if (
      opts.settings.enforceMaxLossLimit &&
      dayPnl <= -Math.abs(opts.settings.dailyMaxLoss || 1500)
    ) {
      continue;
    }
    if (
      opts.settings.enforceDailyTargetLimit &&
      dayPnl >= (opts.settings.dailyProfitTarget || 2500)
    ) {
      continue;
    }

    const cacheKey = `${c.underlyingKey}|${d}|${c.bias}|${c.strike}`;
    let atm = contractCache.get(cacheKey) ?? null;
    if (!atm) {
      atm = await resolveAtmOption({
        token,
        underlyingKey: c.underlyingKey,
        spot: c.spot,
        side: c.bias,
        tradeDay: d,
        preferredStrike: c.strike,
      });
      contractCache.set(cacheKey, atm);
      await pause(80);
    }
    if (!atm) {
      skippedNoOption += 1;
      continue;
    }

    const entryDay = ymdFromMs(new Date(c.t).getTime());
    // Intraday only — pull option OHLC for the entry calendar day (IST), never overnight
    const optBars = await fetchOptionBars({
      token,
      instrumentKey: atm.instrumentKey,
      fromDate: entryDay,
      toDate: entryDay,
      unit: upstoxTf.unit,
      interval: upstoxTf.interval,
      expiredInterval: upstoxTf.expiredInterval,
      expired: atm.expired,
    });
    await pause(90);
    if (!optBars.length) {
      skippedNoOption += 1;
      continue;
    }

    const sameDay = optBars.filter((b) => {
      const day = ymdFromMs(new Date(b.t).getTime());
      return day === entryDay && b.t >= c.t && inTradeWindow(b.t, '09:15', sessionEnd);
    });
    if (!sameDay.length) continue;
    const entryBar = sameDay[0];
    const entryPremium = roundPremium(entryBar.close);
    if (!isJimboEntryPremiumAllowed(entryPremium)) continue;

    let peak = entryPremium;
    let exitAt = entryBar.t;
    let exitPremium = entryPremium;
    let exitWhy = 'eod_intraday';
    const tradeExitPts = exitPts;

    for (let i = 0; i < sameDay.length; i++) {
      const bar = sameDay[i];
      const prem = roundPremium(bar.close);
      peak = Math.max(peak, prem);
      exitAt = bar.t;
      exitPremium = prem;
      const exit = evaluatePaperPremiumExit(entryPremium, prem, peak, tradeExitPts);
      if (exit.shouldClose && exit.exitPremium != null) {
        exitPremium = exit.exitPremium;
        exitWhy = exit.reason || 'exit';
        break;
      }
      // Last bar of the session window → force flat (no overnight)
      if (i === sameDay.length - 1) {
        exitWhy = 'eod_intraday';
      }
    }

    // Safety: never keep a trade past entry day
    if (ymdFromMs(new Date(exitAt).getTime()) !== entryDay) {
      exitAt = sameDay[sameDay.length - 1].t;
      exitPremium = roundPremium(sameDay[sameDay.length - 1].close);
      exitWhy = 'eod_intraday';
    }

    const points = exitPremium - entryPremium;
    const lotSize = atm.lotSize > 0 ? atm.lotSize : c.lotSize;
    const pnl = Math.round(points * lotSize * lots);
    trades.push({
      id: `jb-${c.symbol}-${c.t}`,
      symbol: c.symbol,
      option: c.bias,
      strike: atm.strike || c.strike,
      spot: c.spot,
      lots,
      lotSize,
      entryAt: c.t,
      exitAt,
      entryPremium,
      exitPremium,
      pnl,
      exitWhy,
      cciPrev: c.cciPrev,
      cciCurr: c.cciCurr,
      cciPeriod: c.cciPeriod,
      crossDir: c.crossDir,
      confidence: c.conf,
      paDetail: c.paDetail,
      note: `${c.note} · ${atm.tradingSymbol || atm.instrumentKey} · Upstox OHLC`,
      instrumentKey: atm.instrumentKey,
      tradingSymbol: atm.tradingSymbol,
      priceSource: 'upstox',
    });

    dayPnl += pnl;
    dayOpens += 1;
    totalOpens += 1;
    nextAllowedAt = exitAt;
  }

  const wins = trades.filter((x) => x.pnl > 0).length;
  const losses = trades.filter((x) => x.pnl < 0).length;
  const netPnl = trades.reduce((s, x) => s + x.pnl, 0);

  const emptyReason: JimboBacktestResult['emptyReason'] =
    trades.length > 0
      ? 'ok'
      : barsInWindow === 0
        ? 'no_history_in_range'
        : 'no_setups';

  const caps = [
    `SL ${exitPts.stopLossPoints} / Tgt ${exitPts.targetPoints}`,
    `skip prem < ₹${JIMBO_MIN_OPTION_ENTRY_PREMIUM}`,
    exitPts.mfeTrailEnabled
      ? `MFE trail arm ${exitPts.mfeTrailTriggerPts} keep ${Math.round((exitPts.mfeTrailKeepFrac ?? 0.5) * 100)}%`
      : 'no MFE trail',
    enforceDayTrades ? `max ${maxPerDay}/day` : 'no day-trade cap',
    maxTradesTotal > 0 ? `max ${maxTradesTotal} total` : 'no total-trade cap',
  ].join(' · ');

  const rangeHint =
    emptyReason === 'no_history_in_range'
      ? ` No Upstox bars inside ${fromYmd}→${toYmd}. Data returned ${dataFromYmd || '?'}→${dataToYmd || '?'}.`
      : emptyReason === 'no_setups'
        ? ` Had ${barsInWindow} equity bars / ${candidates.length} CCI candidates; opened ${trades.length}; skipped ${skippedNoOption} (no Upstox option OHLC that day).`
        : '';

  return {
    ok: true,
    fromDate: fromYmd,
    toDate: toYmd,
    timeframe: tf,
    scanned: universeAll.length,
    candleOk: seriesList.length,
    trades,
    wins,
    losses,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    netPnl,
    barsInWindow,
    dataFromDate: dataFromYmd,
    dataToDate: dataToYmd,
    emptyReason,
    priceSource: 'upstox',
    note: `Upstox real-price study · equity V3 + option OHLC · intraday only (flat by 15:12, no overnight) · scanned ${seriesList.length}/${universe.length} names (cap ${maxNames}/${universeAll.length}) · ${spanDays}d · ${caps}.${rangeHint}`,
  };
}
