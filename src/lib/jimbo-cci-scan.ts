/**
 * Jimbo CCI scan over full NSE equity F&O watchlist.
 * Live path: Yahoo OHLC for CCI + Upstox spot/ATM option LTP for matches.
 */

import {
  computeCci,
  detectZeroCross,
  priceActionConfirm,
  type OhlcBar,
} from '@/lib/cci';
import {
  isNseMarketOpen,
  resolveJimboScanUniverse,
  roundJimboStrike,
  type JimboScanScope,
  type JimboSettings,
  type JimboSignal,
} from '@/lib/jimbo';
import {
  NSE_EQUITY_FO_WATCHLIST,
  type JimboFoStock,
} from '@/lib/jimbo-fo-universe';
import { resolveInstrumentKeys } from '@/lib/instruments';
import { NEJOIC_TIMEFRAMES } from '@/lib/nejoic-options';
import { fetchUpstoxQuotes } from '@/lib/upstox-market';
import {
  fetchIndexOptionContracts,
  pickAtmContract,
  type OptionSide,
} from '@/lib/upstox-options';
import { fetchYahooCandles, type YahooInterval } from '@/lib/yahoo-nifty';
import { toYahooSymbol } from '@/lib/chart';

export type JimboCciScanResult = {
  signals: JimboSignal[];
  marketOpen: boolean;
  scanned: number;
  candleOk: number;
  atmOk: number;
  source: 'live' | 'offline';
  note?: string;
};

function mapTf(tf: string | undefined): YahooInterval {
  const yahoo = NEJOIC_TIMEFRAMES.find((t) => t.id === tf)?.yahoo ?? tf ?? '5m';
  if (
    yahoo === '1m' ||
    yahoo === '2m' ||
    yahoo === '5m' ||
    yahoo === '15m' ||
    yahoo === '30m' ||
    yahoo === '60m' ||
    yahoo === '1d'
  ) {
    return yahoo;
  }
  return '5m';
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

function scoreSignal(opts: {
  paOk: boolean;
  requirePa: boolean;
  changePct: number | null;
}): number {
  if (!opts.paOk && opts.requirePa) return 42;
  let conf = 78;
  if (opts.changePct != null && Number.isFinite(opts.changePct)) {
    conf += Math.min(10, Math.abs(opts.changePct));
  } else {
    conf += 4;
  }
  return Math.min(96, Math.round(conf));
}

export async function fetchStockAtmOptionLtp(opts: {
  accessToken: string;
  underlyingKey: string;
  spot: number;
  option: OptionSide;
  strike?: number;
}): Promise<{
  ok: boolean;
  ltp: number;
  strike: number;
  instrumentKey?: string;
  tradingSymbol?: string;
  lotSize?: number;
  expiry?: string;
  error?: string;
}> {
  try {
    const rows = await fetchIndexOptionContracts(opts.accessToken, opts.underlyingKey);
    const preferred = opts.strike ?? roundJimboStrike(opts.spot);
    const contract = pickAtmContract(rows, opts.spot, opts.option, preferred);
    if (!contract) {
      return { ok: false, ltp: 0, strike: preferred, error: 'No ATM contract' };
    }
    const quotes = await fetchUpstoxQuotes(opts.accessToken, [contract.instrumentKey]);
    const ltp = quotes[0]?.lastPrice ?? 0;
    if (!(ltp > 0)) {
      return {
        ok: false,
        ltp: 0,
        strike: contract.strike,
        instrumentKey: contract.instrumentKey,
        tradingSymbol: contract.tradingSymbol,
        lotSize: contract.lotSize,
        expiry: contract.expiry,
        error: 'No option LTP',
      };
    }
    return {
      ok: true,
      ltp: Math.round(ltp * 100) / 100,
      strike: contract.strike,
      instrumentKey: contract.instrumentKey,
      tradingSymbol: contract.tradingSymbol,
      lotSize: contract.lotSize,
      expiry: contract.expiry,
    };
  } catch (e) {
    return {
      ok: false,
      ltp: 0,
      strike: opts.strike ?? roundJimboStrike(opts.spot),
      error: e instanceof Error ? e.message : 'ATM quote failed',
    };
  }
}

/** Evaluate one FO name against CCI rules using provided OHLC. */
export function evaluateFoCciSetup(
  stock: JimboFoStock,
  bars: OhlcBar[],
  settings: Pick<JimboSettings, 'cciPeriod' | 'requirePaConfirm' | 'minConfidence'>,
  liveSpot?: number | null,
  changePct?: number | null
): JimboSignal | null {
  if (bars.length < Math.max(30, settings.cciPeriod + 5)) return null;
  const cci = computeCci(bars, settings.cciPeriod);
  const cross = detectZeroCross(cci, 4);
  if (!cross) return null;

  const pa = priceActionConfirm(bars, cross.direction);
  const requirePa = settings.requirePaConfirm !== false;
  const paOk = requirePa ? pa.ok : true;
  const spot =
    liveSpot && liveSpot > 0
      ? liveSpot
      : bars[bars.length - 1]?.close ?? 0;
  if (!(spot > 0)) return null;
  const strike = roundJimboStrike(spot);
  const confidence = scoreSignal({ paOk, requirePa, changePct: changePct ?? null });
  const bias: JimboSignal['bias'] =
    cross.direction === 'up_through_zero' ? (paOk ? 'CE' : 'FLAT') : paOk ? 'PE' : 'FLAT';

  return {
    id: `j-${stock.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    symbol: stock.symbol,
    name: stock.name,
    spot: Math.round(spot * 100) / 100,
    bias,
    strike,
    premium: 0,
    lotSize: stock.lotSize,
    cciPrev: Math.round(cross.prev * 10) / 10,
    cciCurr: Math.round(cross.curr * 10) / 10,
    cciPeriod: settings.cciPeriod,
    confidence,
    reason:
      cross.direction === 'up_through_zero'
        ? `CCI(${settings.cciPeriod}) crossed above 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) on NSE F&O watchlist.`
        : `CCI(${settings.cciPeriod}) crossed below 0 (${cross.prev.toFixed(1)} → ${cross.curr.toFixed(1)}) on NSE F&O watchlist.`,
    paDetail: requirePa ? pa.detail : `${pa.detail} (PA confirm optional in settings)`,
  };
}

/**
 * Live CCI scan: full F&O watchlist → setups that pass rules → ATM CE/PE LTP.
 */
export async function runJimboFoCciScan(opts: {
  accessToken: string;
  settings: Pick<
    JimboSettings,
    | 'cciPeriod'
    | 'requirePaConfirm'
    | 'minConfidence'
    | 'primaryTimeframe'
    | 'scanScope'
    | 'maxLiquidityRank'
  >;
  liveSpots?: Record<string, { lastPrice?: number; changePct?: number | null }>;
  /** Explicit symbol filter (overrides scanScope when non-empty). */
  symbols?: string[];
  focusSymbols?: string[];
  /** Cap how many candle fetches (default: universe size). */
  maxSymbols?: number;
}): Promise<JimboCciScanResult> {
  const marketOpen = isNseMarketOpen();
  const interval = mapTf(opts.settings.primaryTimeframe);
  const scope = (opts.settings.scanScope || 'liquid') as JimboScanScope;
  let universe: JimboFoStock[] =
    opts.symbols?.length
      ? NSE_EQUITY_FO_WATCHLIST.filter((s) =>
          opts.symbols!.some((x) => x.toUpperCase() === s.symbol)
        )
      : resolveJimboScanUniverse(scope, {
          focusSymbols: opts.focusSymbols,
          maxLiquidityRank: opts.settings.maxLiquidityRank,
        });
  if (opts.maxSymbols != null && opts.maxSymbols > 0) {
    universe = universe.slice(0, opts.maxSymbols);
  }

  const candleFlags = await mapPool(universe, 6, async (stock) => {
    const yahoo = toYahooSymbol({ symbol: stock.symbol, exchange: 'NSE' });
    const data = await fetchYahooCandles(yahoo, interval, 120, stock.symbol);
    if (!data.ok || !data.candles?.length) return { ok: false as const, signal: null };
    const bars: OhlcBar[] = data.candles.map((c) => ({
      t: c.t,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const live = opts.liveSpots?.[stock.symbol];
    const spot = live?.lastPrice && live.lastPrice > 0 ? live.lastPrice : data.spot;
    return {
      ok: true as const,
      signal: evaluateFoCciSetup(
        stock,
        bars,
        opts.settings,
        spot,
        live?.changePct ?? null
      ),
    };
  });

  const candleOk = candleFlags.filter((r) => r.ok).length;
  const signals = candleFlags
    .map((r) => r.signal)
    .filter((s): s is JimboSignal => Boolean(s));
  const actionable = signals.filter((s) => s.bias === 'CE' || s.bias === 'PE');

  // Resolve equity keys once, then ATM option LTP for matches only.
  let atmOk = 0;
  const resolved = await resolveInstrumentKeys(actionable.map((s) => s.symbol));
  const enriched = await mapPool(actionable, 3, async (sig) => {
    const row = resolved.get(sig.symbol);
    if (!row?.instrumentKey) return sig;
    const atm = await fetchStockAtmOptionLtp({
      accessToken: opts.accessToken,
      underlyingKey: row.instrumentKey,
      spot: sig.spot,
      option: sig.bias as OptionSide,
      strike: sig.strike,
    });
    if (!atm.ok) return sig;
    atmOk += 1;
    return {
      ...sig,
      strike: atm.strike || sig.strike,
      premium: atm.ltp,
      lotSize: atm.lotSize && atm.lotSize > 0 ? atm.lotSize : sig.lotSize,
      instrumentKey: atm.instrumentKey || null,
      tradingSymbol: atm.tradingSymbol || null,
      reason: `${sig.reason} Live ATM ${sig.bias} ₹${atm.ltp}${
        atm.tradingSymbol ? ` · ${atm.tradingSymbol}` : ''
      }.`,
    };
  });

  const bySym = new Map(enriched.map((s) => [s.symbol, s]));
  const merged = signals.map((s) => bySym.get(s.symbol) ?? s);

  const minConf = opts.settings.minConfidence ?? 75;
  merged.sort((a, b) => {
    const ao = a.bias === 'FLAT' || a.confidence < minConf ? 1 : 0;
    const bo = b.bias === 'FLAT' || b.confidence < minConf ? 1 : 0;
    if (ao !== bo) return ao - bo;
    if ((b.premium > 0 ? 1 : 0) !== (a.premium > 0 ? 1 : 0)) {
      return (b.premium > 0 ? 1 : 0) - (a.premium > 0 ? 1 : 0);
    }
    return b.confidence - a.confidence;
  });

  return {
    signals: merged,
    marketOpen,
    scanned: universe.length,
    candleOk,
    atmOk,
    source: 'live',
    note: `F&O watchlist CCI · candles ${candleOk}/${universe.length} · ATM quotes ${atmOk}/${actionable.length}`,
  };
}
