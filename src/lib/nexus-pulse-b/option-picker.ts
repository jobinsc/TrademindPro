/**
 * Sector 7 B Sensex option picker — same ₹50+ floor as Pinax/Nexus A, strike step 100.
 */

import { fetchUpstoxQuotes, type UpstoxQuote } from '@/lib/upstox-market';
import {
  fetchSensexOptionContracts,
  fetchUpstoxOptionGreeks,
  pickAtmContract,
  type NiftyOptionContract,
  type OptionSide,
  type UpstoxOptionGreeks,
} from '@/lib/upstox-options';
import { istDate } from '@/lib/pinax-forge/ist';
import { NEXUS_PULSE_B_RULES } from '@/lib/nexus-pulse-b/rules';
import type { PinaxOptionCandidate } from '@/lib/pinax-forge/types';

type ContractRow = Awaited<ReturnType<typeof fetchSensexOptionContracts>>[number];

const STRIKE_STEP = NEXUS_PULSE_B_RULES.strikeStep;
const MIN_FLOOR = NEXUS_PULSE_B_RULES.minPremiumFloor;
const DEFAULT_LOT = NEXUS_PULSE_B_RULES.sensexLotSize;

function roundStrike(n: number) {
  return Math.round(n / STRIKE_STEP) * STRIKE_STEP;
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
    lotSize: contract.lotSize || DEFAULT_LOT,
    premium: Math.round(premium * 100) / 100,
    inPreferredBand: true,
    isAtm,
    score: 100,
  };
}

function preferredStrikeForSide(
  spot: number,
  side: OptionSide,
  expiry: string,
  sessionDate: string
): number | undefined {
  if (expiry !== sessionDate) return undefined;
  if (side === 'CE') return Math.floor(spot / STRIKE_STEP) * STRIKE_STEP;
  return Math.ceil(spot / STRIKE_STEP) * STRIKE_STEP;
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
    ce: pickAtmContract(rows, spot, 'CE', ceStrike ?? roundStrike(spot)),
    pe: pickAtmContract(rows, spot, 'PE', peStrike ?? roundStrike(spot)),
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

async function resolveSensexFrontWeek(
  accessToken: string,
  spot: number,
  sessionDate: string
): Promise<{
  expiryMode: string;
  expiry: string | null;
  rows: ContractRow[];
  ce: NiftyOptionContract | null;
  pe: NiftyOptionContract | null;
}> {
  const [all, currentWeekRows] = await Promise.all([
    fetchSensexOptionContracts(accessToken),
    fetchSensexOptionContracts(accessToken, 'current_week').catch(() => [] as ContractRow[]),
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

  const nextWeekRows = await fetchSensexOptionContracts(accessToken, 'next_week').catch(
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

function quoteIdentity(parts: string[]): string {
  return parts.join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveOptionPremium(
  contract: NiftyOptionContract,
  quotes: UpstoxQuote[],
  greeks: UpstoxOptionGreeks[]
): number | null {
  const exact = quotes.find((q) => q.instrumentKey === contract.instrumentKey);
  if (exact && exact.lastPrice > 0) return exact.lastPrice;

  const sym = quoteIdentity([contract.tradingSymbol]);
  const bySymbol = sym
    ? quotes.find((q) => quoteIdentity([q.instrumentKey, q.symbol]).includes(sym))
    : undefined;
  if (bySymbol && bySymbol.lastPrice > 0) return bySymbol.lastPrice;

  const greekExact = greeks.find((g) => g.instrumentKey === contract.instrumentKey);
  if (greekExact && greekExact.lastPrice > 0) return greekExact.lastPrice;
  return null;
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
    lotSize: Number(row.lot_size || 0) || DEFAULT_LOT,
  };
}

function nearestContractsForSide(opts: {
  rows: ContractRow[];
  side: OptionSide;
  spot: number;
  expiry: string;
  sessionDate: string;
}): NiftyOptionContract[] {
  const preferred =
    preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate) ??
    roundStrike(opts.spot);
  const contracts = opts.rows
    .map((row) => contractRowToContract(row, opts.side, opts.expiry))
    .filter((row): row is NiftyOptionContract => Boolean(row))
    .sort((a, b) => a.strike - b.strike);

  const primary =
    opts.side === 'CE'
      ? contracts.filter((c) => c.strike <= preferred).sort((a, b) => b.strike - a.strike)
      : contracts.filter((c) => c.strike >= preferred).sort((a, b) => a.strike - b.strike);
  const secondary =
    opts.side === 'CE'
      ? contracts.filter((c) => c.strike > preferred).sort((a, b) => a.strike - b.strike)
      : contracts.filter((c) => c.strike < preferred).sort((a, b) => b.strike - a.strike);

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
}): { contract: NiftyOptionContract | null; premium: number | null; isAtm: boolean } {
  const baseStrike = preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate);
  const atm = pickAtmContract(opts.rows, opts.spot, opts.side, baseStrike ?? roundStrike(opts.spot));
  const atmPremium = atm ? resolveOptionPremium(atm, opts.quotes, opts.greeks) : null;
  if (atm && atmPremium && atmPremium >= MIN_FLOOR) {
    return { contract: atm, premium: atmPremium, isAtm: true };
  }

  const sideRows = nearestContractsForSide(opts);
  for (const contract of sideRows) {
    const premium = resolveOptionPremium(contract, opts.quotes, opts.greeks);
    if (!premium || premium < MIN_FLOOR) continue;
    return { contract, premium, isAtm: false };
  }

  const stepped = sideRows.find((contract) => contract.strike !== atm?.strike) ?? null;
  if (stepped) {
    const premium = resolveOptionPremium(stepped, opts.quotes, opts.greeks);
    if (premium && premium > 0) {
      return { contract: stepped, premium, isAtm: false };
    }
  }
  return { contract: atm, premium: atmPremium, isAtm: true };
}

/** Pick Sensex CE+PE candidates (both sides) and the wanted-side entry. */
export async function pickSensexOptions(opts: {
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
    const resolved = await resolveSensexFrontWeek(opts.accessToken, opts.spot, sessionDate);
    if (!resolved.ce || !resolved.pe || !resolved.expiry) {
      return {
        candidates: [],
        picked: null,
        expiryMode: resolved.expiryMode,
        expiry: resolved.expiry,
        error: 'Front-week Sensex CE/PE contracts unavailable from Upstox',
      };
    }

    const quoteKeys = [
      ...new Set(
        resolved.rows
          .map((row) => String(row.instrument_key || '').trim())
          .filter(Boolean)
      ),
    ];
    const [quotes, greeks] = await Promise.all([
      fetchUpstoxQuotes(opts.accessToken, quoteKeys),
      fetchUpstoxOptionGreeks(opts.accessToken, quoteKeys).catch(() => [] as UpstoxOptionGreeks[]),
    ]);

    const cePick = chooseContractNearPremiumFloor({
      rows: resolved.rows,
      side: 'CE',
      spot: opts.spot,
      expiry: resolved.expiry,
      sessionDate,
      quotes,
      greeks,
    });
    const pePick = chooseContractNearPremiumFloor({
      rows: resolved.rows,
      side: 'PE',
      spot: opts.spot,
      expiry: resolved.expiry,
      sessionDate,
      quotes,
      greeks,
    });

    const candidates: PinaxOptionCandidate[] = [];
    if (cePick.contract && cePick.premium) {
      candidates.push(toCandidate(cePick.contract, cePick.premium, cePick.isAtm));
    }
    if (pePick.contract && pePick.premium) {
      candidates.push(toCandidate(pePick.contract, pePick.premium, pePick.isAtm));
    }

    const picked =
      candidates.find((c) => c.side === opts.wantedSide) ??
      null;

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
      error: e instanceof Error ? e.message : 'Sensex option pick failed',
    };
  }
}
