/**
 * Repair Jimbo paper trades onto live Upstox option prices.
 * Entries often already had live ATM LTP in the note; exits were sometimes
 * theoretical SL/Tgt fills from simulation — reprice those from Upstox OHLC/LTP.
 */

import { roundPremium } from '@/lib/paper-exit';
import { todayKey, type JimboTrade } from '@/lib/jimbo';
import { fetchStockAtmOptionLtp } from '@/lib/jimbo-cci-scan';
import { resolveInstrumentKeys } from '@/lib/instruments';
import { fetchUpstoxHistoricalWindow } from '@/lib/upstox-historical';
import { fetchUpstoxQuotes } from '@/lib/upstox-market';
import {
  fetchIndexOptionContracts,
  pickAtmContract,
  type OptionSide,
} from '@/lib/upstox-options';

export type JimboRepairReport = {
  ok: boolean;
  date: string;
  repaired: number;
  closedAtLive: number;
  tagged: number;
  errors: string[];
  trades: JimboTrade[];
  note: string;
};

function parseContractFromNote(note: string): {
  tradingSymbol: string;
  strike: number;
  option: OptionSide;
} | null {
  const m = note.match(
    /·\s*([A-Z0-9&]+)\s+(\d+)\s+(CE|PE)\s+([0-9A-Z ]+?)(?:\.|$)/i
  );
  if (!m) return null;
  const tradingSymbol = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`.replace(/\s+/g, ' ').trim();
  return {
    tradingSymbol,
    strike: Number(m[2]),
    option: m[3].toUpperCase() as OptionSide,
  };
}

function looksLikeTheoreticalExit(t: JimboTrade): boolean {
  if (t.status !== 'closed' || !(t.exitPremium != null) || !(t.entryPremium > 0)) {
    return false;
  }
  const pts = Math.round((t.exitPremium - t.entryPremium) * 100) / 100;
  // Classic fixed SL/Tgt fills used before live-exit path
  const common = [5, 10, 18, 25, 40, -5, -10, -18, -25, -40];
  return common.some((x) => Math.abs(pts - x) < 0.021);
}

async function resolveOptionKey(
  token: string,
  trade: JimboTrade
): Promise<{ instrumentKey: string; tradingSymbol: string; lotSize?: number } | null> {
  if (trade.instrumentKey) {
    return {
      instrumentKey: trade.instrumentKey,
      tradingSymbol: trade.tradingSymbol || `${trade.symbol} ${trade.strike} ${trade.option}`,
    };
  }

  const parsed = parseContractFromNote(trade.note || '');
  const resolved = await resolveInstrumentKeys([trade.symbol]);
  const row = resolved.get(trade.symbol.toUpperCase());
  if (!row?.instrumentKey) return null;

  const rows = await fetchIndexOptionContracts(token, row.instrumentKey);
  const side = trade.option;
  const strike = parsed?.strike || trade.strike;
  const wantSym = parsed?.tradingSymbol?.toUpperCase();

  let hit = wantSym
    ? rows.find((r) => String(r.trading_symbol || '').toUpperCase() === wantSym)
    : null;
  if (!hit) {
    const contract = pickAtmContract(rows, strike, side, strike);
    if (!contract) return null;
    return {
      instrumentKey: contract.instrumentKey,
      tradingSymbol: contract.tradingSymbol,
      lotSize: contract.lotSize,
    };
  }

  return {
    instrumentKey: String(hit.instrument_key),
    tradingSymbol: String(hit.trading_symbol || wantSym),
    lotSize: Number(hit.lot_size) || undefined,
  };
}

async function premiumNearTime(
  token: string,
  instrumentKey: string,
  atIso: string
): Promise<number | null> {
  const day = new Date(atIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const attempts: { unit: 'minutes'; interval: number }[] = [
    { unit: 'minutes', interval: 1 },
    { unit: 'minutes', interval: 5 },
    { unit: 'minutes', interval: 3 },
  ];
  for (const a of attempts) {
    const hist = await fetchUpstoxHistoricalWindow({
      accessToken: token,
      instrumentKey,
      unit: a.unit,
      interval: a.interval,
      fromDate: day,
      toDate: day,
    });
    if (hist.ok && hist.candles.length) {
      const close = closestClose(hist.candles, atIso);
      if (close != null) return close;
    }
  }

  // Intraday endpoint sometimes has today's bars when V3 day window is empty
  try {
    const encoded = encodeURIComponent(instrumentKey);
    const url = `https://api.upstox.com/v3/historical-candle/intraday/${encoded}/minutes/1`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { candles?: [string, number, number, number, number][] };
      };
      const candles = (json.data?.candles || [])
        .map((row) => ({
          t: new Date(row[0]).toISOString(),
          close: Number(row[4]),
        }))
        .filter((c) => c.close > 0);
      const close = closestClose(candles, atIso);
      if (close != null) return close;
    }
  } catch {
    /* ignore */
  }

  return null;
}

function closestClose(
  candles: { t: string; close: number }[],
  atIso: string
): number | null {
  const target = new Date(atIso).getTime();
  let best: { close: number; dist: number } | null = null;
  for (const c of candles) {
    if (!(c.close > 0)) continue;
    const dist = Math.abs(new Date(c.t).getTime() - target);
    if (!best || dist < best.dist) best = { close: c.close, dist };
  }
  return best ? roundPremium(best.close) : null;
}

/**
 * Reprice / tag Jimbo paper trades with Upstox live or historical option premiums.
 */
export async function repairJimboPaperTradesWithUpstox(opts: {
  accessToken: string;
  trades: JimboTrade[];
  /** Flat duplicate opens at live LTP, keep newest only */
  flattenExtraOpens?: boolean;
}): Promise<JimboRepairReport> {
  const token = opts.accessToken.trim();
  const errors: string[] = [];
  let repaired = 0;
  let closedAtLive = 0;
  let tagged = 0;
  const date = todayKey();

  let trades = opts.trades.map((t) => ({ ...t }));

  // Attach instrument keys + trading symbols
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    try {
      const key = await resolveOptionKey(token, t);
      if (!key) {
        errors.push(`${t.symbol} ${t.strike}${t.option}: no Upstox contract`);
        continue;
      }
      const next: JimboTrade = {
        ...t,
        instrumentKey: key.instrumentKey,
        tradingSymbol: key.tradingSymbol,
        lotSize: key.lotSize && key.lotSize > 0 ? key.lotSize : t.lotSize,
        priceSource: t.priceSource === 'upstox' ? 'upstox' : 'upstox',
      };
      if (!t.instrumentKey) tagged += 1;
      trades[i] = next;
    } catch (e) {
      errors.push(
        `${t.symbol}: ${e instanceof Error ? e.message : 'resolve failed'}`
      );
    }
  }

  // Reprice theoretical exits from Upstox 1m/5m history
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.status !== 'closed' || !t.exitAt || !t.instrumentKey) continue;
    if (!looksLikeTheoreticalExit(t)) {
      if (/Live ATM/i.test(t.note || '')) {
        trades[i] = { ...t, priceSource: 'upstox' };
      }
      continue;
    }
    try {
      const liveExit = await premiumNearTime(token, t.instrumentKey, t.exitAt);
      if (!(liveExit != null && liveExit > 0)) {
        errors.push(`${t.symbol} exit@${t.exitAt}: no Upstox bar`);
        trades[i] = {
          ...t,
          priceSource: 'unknown',
          note: `${t.note || ''} · exit was theoretical SL/Tgt (Upstox hist unavailable)`.trim(),
        };
        continue;
      }
      const points = liveExit - t.entryPremium;
      const pnl = Math.round(points * t.lotSize * t.lots);
      trades[i] = {
        ...t,
        exitPremium: liveExit,
        pnl,
        priceSource: 'upstox',
        note: `${t.note || ''} · exit repriced from Upstox OHLC`.trim(),
      };
      repaired += 1;
    } catch (e) {
      errors.push(
        `${t.symbol} reprice: ${e instanceof Error ? e.message : 'failed'}`
      );
    }
  }

  // Open trades: live mark; collapse extras
  const opens = trades
    .map((t, idx) => ({ t, idx }))
    .filter((x) => x.t.status === 'open');

  if (opens.length) {
    // Keep newest open; flat older duplicates at live LTP
    opens.sort((a, b) => b.t.at.localeCompare(a.t.at));
    const keep = opens[0];
    const extras = opts.flattenExtraOpens === false ? [] : opens.slice(1);

    for (const { t, idx } of [keep, ...extras]) {
      if (!t.instrumentKey) {
        // try ATM resolve
        try {
          const resolved = await resolveInstrumentKeys([t.symbol]);
          const row = resolved.get(t.symbol.toUpperCase());
          if (row?.instrumentKey) {
            const atm = await fetchStockAtmOptionLtp({
              accessToken: token,
              underlyingKey: row.instrumentKey,
              spot: t.strike,
              option: t.option,
              strike: t.strike,
            });
            if (atm.ok && atm.instrumentKey) {
              trades[idx] = {
                ...trades[idx],
                instrumentKey: atm.instrumentKey,
                tradingSymbol: atm.tradingSymbol || trades[idx].tradingSymbol,
                lotSize: atm.lotSize || trades[idx].lotSize,
              };
            }
          }
        } catch {
          /* ignore */
        }
      }

      const key = trades[idx].instrumentKey;
      if (!key) continue;
      try {
        const quotes = await fetchUpstoxQuotes(token, [key]);
        const ltp = quotes[0]?.lastPrice ?? 0;
        if (!(ltp > 0)) continue;
        const mark = roundPremium(ltp);

        if (extras.some((e) => e.idx === idx)) {
          const points = mark - trades[idx].entryPremium;
          const pnl = Math.round(points * trades[idx].lotSize * trades[idx].lots);
          trades[idx] = {
            ...trades[idx],
            status: 'closed',
            exitPremium: mark,
            exitAt: new Date().toISOString(),
            pnl,
            peakPremium: null,
            priceSource: 'upstox',
            note: `${trades[idx].note || ''} · flat duplicate open @ live Upstox`.trim(),
          };
          closedAtLive += 1;
          repaired += 1;
        } else {
          trades[idx] = {
            ...trades[idx],
            peakPremium: Math.max(
              trades[idx].peakPremium ?? trades[idx].entryPremium,
              mark
            ),
            priceSource: 'upstox',
          };
          tagged += 1;
        }
      } catch (e) {
        errors.push(
          `${t.symbol} live: ${e instanceof Error ? e.message : 'quote failed'}`
        );
      }
    }
  }

  // Tag entries that already said Live ATM in note (entry only — don't override unknown exits)
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (
      /Live ATM/i.test(t.note || '') &&
      !/theoretical SL\/Tgt/i.test(t.note || '') &&
      t.priceSource !== 'upstox' &&
      t.priceSource !== 'unknown'
    ) {
      trades[i] = { ...t, priceSource: 'upstox' };
      tagged += 1;
    }
  }

  return {
    ok: true,
    date,
    repaired,
    closedAtLive,
    tagged,
    errors: errors.slice(0, 20),
    trades,
    note: `Repaired Jimbo paper · ${repaired} exits repriced · ${closedAtLive} duplicate opens flattened · ${tagged} tagged Upstox`,
  };
}
