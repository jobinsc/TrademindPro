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
): { ce: NiftyOptionContract | null; pe: NiftyOptionContract | null } {
  const ceStrike = preferredStrikeForSide(spot, 'CE', expiry, sessionDate);
  const peStrike = preferredStrikeForSide(spot, 'PE', expiry, sessionDate);
  return {
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
      return { expiryMode: 'current_week', expiry, ce, pe };
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
      return { expiryMode: 'next_week', expiry, ce, pe };
    }
  }

  return { expiryMode: 'listed', expiry: null, ce: null, pe: null };
}

/** Normalize for loose quote matching (Upstox mixes | / : and token vs symbol keys). */
function quoteIdentity(parts: string[]): string {
  return parts.join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Resolve CE/PE lastPrice the same robust way as manage LTP:
 * exact key → trading-symbol/side match on market quotes → option-greek last_price.
 */
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
    if (!atmCe || !atmPe) {
      return {
        candidates: [],
        picked: null,
        expiryMode: resolved.expiryMode,
        expiry: resolved.expiry,
        error: 'Front-week CE/PE contracts unavailable from Upstox',
      };
    }

    const isExpiryDay = atmCe.expiry === sessionDate;
    const keys = [atmCe.instrumentKey, atmPe.instrumentKey];
    const [quotes, greeks] = await Promise.all([
      fetchUpstoxQuotes(opts.accessToken, keys),
      fetchUpstoxOptionGreeks(opts.accessToken, keys).catch(() => [] as UpstoxOptionGreeks[]),
    ]);

    const candidates: PinaxOptionCandidate[] = [];
    for (const contract of [atmCe, atmPe]) {
      const premium = resolveOptionPremium(contract, quotes, greeks);
      if (!premium || premium <= 0) continue;
      // Expiry-day offset strikes are intentional (not classic ATM).
      const isAtm = !isExpiryDay;
      candidates.push(toCandidate(contract, premium, isAtm));
    }

    if (!candidates.length) {
      return {
        candidates: [],
        picked: null,
        expiryMode: resolved.expiryMode,
        expiry: resolved.expiry,
        error: 'Front-week contracts found but no live LTP',
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
