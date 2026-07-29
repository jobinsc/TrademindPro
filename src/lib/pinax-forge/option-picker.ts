/**
 * PinaxForge option picker — front-week CE/PE (this week's listed expiry).
 * Analysis drives entries; no premium-band restriction on paper trades.
 *
 * Deliberately does NOT use Blink ATM Lab's resolveNiftyAtmContracts, which
 * rolls to next_week on expiry day and can fall through to next_week when
 * Upstox's current_week keyword is empty — skipping a still-listed this-week
 * expiry (e.g. Thu → Aug 4 instead of Jul 28).
 *
 * Strike rule:
 * - Non-expiry days: ATM (nearest 50-strike).
 * - Expiry day (selected expiry === today IST): CE just below spot
 *   (floor 50 ≤ spot), PE just above spot (ceil 50 ≥ spot) — cheap premium.
 */

import { fetchUpstoxQuotes, type UpstoxQuote } from '@/lib/upstox-market';
import {
  fetchNiftyOptionContracts,
  fetchUpstoxOptionGreeks,
  pickAtmContract,
  type NiftyOptionContract,
  type OptionSide,
  type UpstoxOptionGreeks,
} from '@/lib/upstox-options';
import { istDate } from '@/lib/pinax-forge/ist';
import type { PinaxOptionCandidate } from '@/lib/pinax-forge/types';

type ContractRow = Awaited<ReturnType<typeof fetchNiftyOptionContracts>>[number];

const NEXUS_MIN_PREMIUM_FLOOR = 50;

/** Quote only strikes near spot so Upstox rate-limits don't blank the ATM board. */
function quoteKeysNearSpot(
  rows: ContractRow[],
  spot: number,
  strikeStep: number,
  maxSteps = 24
): string[] {
  const atm = Math.round(spot / strikeStep) * strikeStep;
  const lo = atm - maxSteps * strikeStep;
  const hi = atm + maxSteps * strikeStep;
  const near = rows
    .filter((row) => {
      const strike = Number(row.strike_price ?? 0);
      return Number.isFinite(strike) && strike >= lo && strike <= hi;
    })
    .map((row) => String(row.instrument_key || '').trim())
    .filter(Boolean);
  if (near.length) return [...new Set(near)];
  // Fallback: ATM CE+PE keys only if filter somehow empty.
  const ce = pickAtmContract(rows, spot, 'CE');
  const pe = pickAtmContract(rows, spot, 'PE');
  return [...new Set([ce?.instrumentKey, pe?.instrumentKey].filter(Boolean) as string[])];
}

function toCandidate(
  contract: NiftyOptionContract,
  premium: number,
  isAtm: boolean
): PinaxOptionCandidate {
  return {
    instrumentKey: contract.instrumentKey,
    tradingSymbol: contract.tradingSymbol,
    strike: contract.strike,
    side: contract.option,
    expiry: contract.expiry,
    lotSize: contract.lotSize,
    premium: Math.round(premium * 100) / 100,
    inPreferredBand: true,
    isAtm,
    score: 100,
  };
}

/** Expiry-day: CE floor ≤ spot, PE ceil ≥ spot. Else ATM (nearest). */
function preferredStrikeForSide(
  spot: number,
  side: OptionSide,
  expiry: string,
  sessionDate: string
): number | undefined {
  if (expiry !== sessionDate) return undefined;
  if (side === 'CE') return Math.floor(spot / 50) * 50;
  return Math.ceil(spot / 50) * 50;
}

function tryPickPair(
  rows: ContractRow[],
  spot: number,
  expiry: string,
  sessionDate: string
): { rows: ContractRow[]; ce: NiftyOptionContract | null; pe: NiftyOptionContract | null } {
  const ceStrike = preferredStrikeForSide(spot, 'CE', expiry, sessionDate);
  const peStrike = preferredStrikeForSide(spot, 'PE', expiry, sessionDate);
  return {
    rows,
    ce: pickAtmContract(rows, spot, 'CE', ceStrike),
    pe: pickAtmContract(rows, spot, 'PE', peStrike),
  };
}

function expiryKeysFromRows(rows: ContractRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => String(row.expiry || '').slice(0, 10))
        .filter((expiry) => /^\d{4}-\d{2}-\d{2}$/.test(expiry))
    ),
  ].sort();
}

/**
 * Must pick front weekly (nearest listed expiry ≥ today). Never skip to next
 * week while this week's expiry still lists tradeable CE+PE.
 * next_week only if front is missing / untradeable (no CE+PE).
 */
async function resolvePinaxFrontWeekContracts(
  accessToken: string,
  spot: number,
  sessionDate: string
): Promise<{
  expiryMode: 'current_week' | 'next_week' | 'listed';
  expiry: string | null;
  rows: ContractRow[];
  ce: NiftyOptionContract | null;
  pe: NiftyOptionContract | null;
}> {
  const [all, currentWeekRows] = await Promise.all([
    fetchNiftyOptionContracts(accessToken),
    fetchNiftyOptionContracts(accessToken, 'current_week').catch(() => [] as ContractRow[]),
  ]);

  const byExpiry = new Map<string, ContractRow[]>();
  for (const row of [...all, ...currentWeekRows]) {
    const expiry = String(row.expiry || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) continue;
    const list = byExpiry.get(expiry) ?? [];
    list.push(row);
    byExpiry.set(expiry, list);
  }

  const frontCandidates = [...byExpiry.keys()]
    .filter((expiry) => expiry >= sessionDate)
    .sort();

  for (const expiry of frontCandidates) {
    const { ce, pe } = tryPickPair(byExpiry.get(expiry) || [], spot, expiry, sessionDate);
    if (ce && pe) {
      return { expiryMode: 'current_week', expiry, rows: byExpiry.get(expiry) || [], ce, pe };
    }
  }

  // Front week empty / untradeable — only then allow next listed / keyword.
  const nextWeekRows = await fetchNiftyOptionContracts(accessToken, 'next_week').catch(
    () => [] as ContractRow[]
  );
  for (const expiry of expiryKeysFromRows(nextWeekRows).filter((e) => e > sessionDate)) {
    const rows = nextWeekRows.filter(
      (row) => String(row.expiry || '').slice(0, 10) === expiry
    );
    const { ce, pe } = tryPickPair(rows, spot, expiry, sessionDate);
    if (ce && pe) {
      return { expiryMode: 'next_week', expiry, rows, ce, pe };
    }
  }

  return { expiryMode: 'listed', expiry: null, rows: [], ce: null, pe: null };
}

/** Normalize for loose quote matching (Upstox mixes | / : and token vs symbol keys). */
function quoteIdentity(parts: string[]): string {
  return parts.join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Resolve CE/PE lastPrice the same robust way as manage LTP:
 * exact key → trading-symbol/side match on market quotes → option-greek last_price.
 */
function distanceFromPreferredStrike(
  strike: number,
  side: OptionSide,
  spot: number,
  expiry: string,
  sessionDate: string
): number {
  const preferred = preferredStrikeForSide(spot, side, expiry, sessionDate) ?? Math.round(spot / 50) * 50;
  return Math.abs(strike - preferred);
}

function contractRowToContract(
  row: ContractRow,
  side: OptionSide,
  expiry: string
): NiftyOptionContract | null {
  const option = String(row.instrument_type || row.option_type || '').toUpperCase().trim();
  const symbol = String(row.trading_symbol || '').toUpperCase();
  const isSide = option === side || symbol.endsWith(side) || symbol.includes(` ${side} `);
  const strike = Number(row.strike_price ?? 0);
  const rowExpiry = String(row.expiry || '').slice(0, 10);
  const instrumentKey = String(row.instrument_key || '').trim();
  const tradingSymbol = String(row.trading_symbol || '').trim();
  if (!isSide || !instrumentKey || !tradingSymbol || !strike || rowExpiry !== expiry) return null;
  return {
    instrumentKey,
    tradingSymbol,
    strike,
    option: side,
    expiry: rowExpiry,
    lotSize: Number(row.lot_size || 0) || 75,
  };
}

function nearestContractsForSide(opts: {
  rows: ContractRow[];
  side: OptionSide;
  spot: number;
  expiry: string;
  sessionDate: string;
  limit?: number;
}): NiftyOptionContract[] {
  const preferred =
    preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate) ??
    Math.round(opts.spot / 50) * 50;
  const contracts = opts.rows
    .map((row) => contractRowToContract(row, opts.side, opts.expiry))
    .filter((row): row is NiftyOptionContract => Boolean(row))
    .sort((a, b) => a.strike - b.strike);

  // Exact user rule:
  // - CE below 50 -> step DOWN to lower strikes until premium > 50
  // - PE below 50 -> step UP to higher strikes until premium > 50
  const primary =
    opts.side === 'CE'
      ? contracts.filter((c) => c.strike <= preferred).sort((a, b) => b.strike - a.strike)
      : contracts.filter((c) => c.strike >= preferred).sort((a, b) => a.strike - b.strike);
  const secondary =
    opts.side === 'CE'
      ? contracts.filter((c) => c.strike > preferred).sort((a, b) => a.strike - b.strike)
      : contracts.filter((c) => c.strike < preferred).sort((a, b) => b.strike - a.strike);

  // Important: do NOT hard-cap here. When ATM premium < 50,
  // the first `> 50` strike might be farther than a small window.
  return [...primary, ...secondary];
}

function chooseContractNearPremiumFloor(opts: {
  rows: ContractRow[];
  side: OptionSide;
  spot: number;
  expiry: string;
  sessionDate: string;
  quotes: UpstoxQuote[];
  greeks: UpstoxOptionGreeks[];
  minPremiumFloor?: number;
}): { contract: NiftyOptionContract | null; premium: number | null; isAtm: boolean } {
  const minFloor = opts.minPremiumFloor ?? NEXUS_MIN_PREMIUM_FLOOR;
  const baseStrike = preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate);
  const atm = pickAtmContract(opts.rows, opts.spot, opts.side, baseStrike);
  const atmPremium = atm ? resolveOptionPremium(atm, opts.quotes, opts.greeks) : null;
  // User rule: if ATM premium is below 50, trade strikes with premium >= 50.
  if (atm && atmPremium && atmPremium >= minFloor) {
    return { contract: atm, premium: atmPremium, isAtm: true };
  }

  // If ATM LTP is missing (rate-limit / partial quote batch), keep ATM —
  // do NOT walk into deep ITM just because those strikes happened to quote.
  if (atm && (atmPremium == null || atmPremium <= 0)) {
    return { contract: atm, premium: null, isAtm: true };
  }

  const sideRows = nearestContractsForSide({
    rows: opts.rows,
    side: opts.side,
    spot: opts.spot,
    expiry: opts.expiry,
    sessionDate: opts.sessionDate,
  });

  let best: { contract: NiftyOptionContract; premium: number; dist: number } | null = null;
  for (const contract of sideRows) {
    const premium = resolveOptionPremium(contract, opts.quotes, opts.greeks);
    if (!premium || premium < minFloor) continue;
    const dist = distanceFromPreferredStrike(
      contract.strike,
      opts.side,
      opts.spot,
      opts.expiry,
      opts.sessionDate
    );
    if (!best) {
      best = { contract, premium, dist };
      break;
    }
  }

  if (best) return { contract: best.contract, premium: best.premium, isAtm: false };
  // Simple fallback: if ATM is below 50, step one strike in the user-requested
  // direction (CE down, PE up) instead of leaving the board empty.
  const stepped = sideRows.find((contract) => contract.strike !== atm?.strike) ?? null;
  if (stepped) {
    const premium = resolveOptionPremium(stepped, opts.quotes, opts.greeks);
    if (premium && premium > 0) {
      return { contract: stepped, premium, isAtm: false };
    }
  }
  return { contract: atm, premium: atmPremium, isAtm: true };
}
function resolveOptionPremium(
  contract: NiftyOptionContract,
  quotes: UpstoxQuote[],
  greeks: UpstoxOptionGreeks[]
): number | null {
  const exact = quotes.find((q) => q.instrumentKey === contract.instrumentKey);
  if (exact && exact.lastPrice > 0) return exact.lastPrice;

  const sym = quoteIdentity([contract.tradingSymbol]);
  const bySymbol =
    (sym
      ? quotes.find((q) =>
          quoteIdentity([q.instrumentKey, q.symbol]).includes(sym)
        )
      : undefined) ??
    quotes.find((q) =>
      quoteIdentity([q.instrumentKey, q.symbol]).endsWith(contract.option)
    );
  if (bySymbol && bySymbol.lastPrice > 0) return bySymbol.lastPrice;

  const greekExact = greeks.find((g) => g.instrumentKey === contract.instrumentKey);
  if (greekExact && greekExact.lastPrice > 0) return greekExact.lastPrice;

  const greekBySym =
    (sym
      ? greeks.find((g) => quoteIdentity([g.instrumentKey]).includes(sym))
      : undefined) ??
    greeks.find((g) =>
      contract.option === 'CE' ? g.delta >= 0 : g.delta < 0
    );
  if (greekBySym && greekBySym.lastPrice > 0) return greekBySym.lastPrice;

  return null;
}

export async function pickPinaxOptions(opts: {
  accessToken: string;
  spot: number;
  wantedSide: OptionSide;
  /** Override premium floor; 0 = keep strict ATM (NexusPulse study align). */
  minPremiumFloor?: number;
}): Promise<{
  candidates: PinaxOptionCandidate[];
  picked: PinaxOptionCandidate | null;
  expiryMode?: string;
  expiry?: string | null;
  error?: string;
}> {
  const sessionDate = istDate();
  try {
    const resolved = await resolvePinaxFrontWeekContracts(
      opts.accessToken,
      opts.spot,
      sessionDate
    );

    const atmCe = resolved.ce;
    const atmPe = resolved.pe;
    if (!atmCe || !atmPe || !resolved.expiry) {
      return {
        candidates: [],
        picked: null,
        expiryMode: resolved.expiryMode,
        expiry: resolved.expiry,
        error: 'Front-week CE/PE contracts unavailable from Upstox',
      };
    }

    const contracts = resolved.rows || [];
    // Quote a near-ATM window only — full-chain quote storms cause 429s and
    // missing LTPs, which used to walk CE/PE into far ITM strikes.
    const quoteKeys = quoteKeysNearSpot(contracts, opts.spot, 50, 24);
    const [quotes, greeks] = await Promise.all([
      fetchUpstoxQuotes(opts.accessToken, quoteKeys),
      fetchUpstoxOptionGreeks(opts.accessToken, quoteKeys).catch(() => [] as UpstoxOptionGreeks[]),
    ]);

    const floorOpts =
      opts.minPremiumFloor != null ? { minPremiumFloor: opts.minPremiumFloor } : {};
    const cePick = chooseContractNearPremiumFloor({
      rows: contracts,
      side: 'CE',
      spot: opts.spot,
      expiry: resolved.expiry,
      sessionDate,
      quotes,
      greeks,
      ...floorOpts,
    });
    const pePick = chooseContractNearPremiumFloor({
      rows: contracts,
      side: 'PE',
      spot: opts.spot,
      expiry: resolved.expiry,
      sessionDate,
      quotes,
      greeks,
      ...floorOpts,
    });

    const candidates: PinaxOptionCandidate[] = [];
    for (const row of [cePick, pePick]) {
      // Seed board even when LTP is briefly missing (premium 0); entries still
      // require a real premium via the wanted-side pick check.
      if (!row.contract) continue;
      candidates.push(toCandidate(row.contract, row.premium && row.premium > 0 ? row.premium : 0, row.isAtm));
    }

    if (!candidates.length) {
      return {
        candidates: [],
        picked: null,
        expiryMode: resolved.expiryMode,
        expiry: resolved.expiry,
        error: 'Front-week contracts found but no CE/PE pair',
      };
    }

    const picked =
      candidates.find((c) => c.side === opts.wantedSide) ?? candidates[0] ?? null;

    return {
      candidates,
      picked,
      expiryMode: resolved.expiryMode,
      expiry: resolved.expiry,
    };
  } catch (e) {
    return {
      candidates: [],
      picked: null,
      error: e instanceof Error ? e.message : 'Option picker failed',
    };
  }
}
