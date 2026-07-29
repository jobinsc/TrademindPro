/**
 * Sector 7 B Sensex option picker.
 * Study-aligned mode: strict ATM. Legacy mode: ₹250–300 premium band.
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
const BAND_LO = NEXUS_PULSE_B_RULES.premiumBandMin;
const BAND_HI = NEXUS_PULSE_B_RULES.premiumBandMax;
const BAND_TARGET = NEXUS_PULSE_B_RULES.premiumBandTarget;
const DEFAULT_LOT = NEXUS_PULSE_B_RULES.sensexLotSize;
/** How far from ATM (in strike steps) we search for the 250–300 band. */
const BAND_SEARCH_STEPS = 30;

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
    inPreferredBand: premium >= BAND_LO && premium <= BAND_HI,
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

/** Quote strikes near spot so we can find the ₹250–300 band without a full-chain storm. */
function quoteKeysNearSpot(
  rows: ContractRow[],
  spot: number,
  strikeStep: number,
  maxSteps = BAND_SEARCH_STEPS
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
  const ce = pickAtmContract(rows, spot, 'CE');
  const pe = pickAtmContract(rows, spot, 'PE');
  return [...new Set([ce?.instrumentKey, pe?.instrumentKey].filter(Boolean) as string[])];
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

/** Compact FO symbols: SENSEX26073077500CE → strike 77500 CE. */
function strikeSideFromSymbol(symRaw: string): { strike: number; side: 'CE' | 'PE' } | null {
  const sym = String(symRaw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const compact = sym.match(/(?:NIFTY|SENSEX|BANKNIFTY)(\d{2})(\d{2})(\d{2})(\d{3,6})(CE|PE)$/);
  if (compact) return { strike: Number(compact[4]), side: compact[5] as 'CE' | 'PE' };
  const spaced = String(symRaw || '')
    .toUpperCase()
    .match(/(\d{3,7})\s*(CE|PE)\b/);
  if (spaced) return { strike: Number(spaced[1]), side: spaced[2] as 'CE' | 'PE' };
  const tail = sym.match(/(\d{3,7})(CE|PE)$/);
  if (tail) return { strike: Number(tail[1]), side: tail[2] as 'CE' | 'PE' };
  return null;
}

function resolveOptionPremium(
  contract: NiftyOptionContract,
  quotes: UpstoxQuote[],
  greeks: UpstoxOptionGreeks[]
): number | null {
  const wantKey = contract.instrumentKey.replace(/:/g, '|');
  const exact = quotes.find((q) => q.instrumentKey.replace(/:/g, '|') === wantKey);
  if (exact && exact.lastPrice > 0) return exact.lastPrice;

  const byParsed = quotes.find((q) => {
    const parsed = strikeSideFromSymbol(q.symbol) || strikeSideFromSymbol(q.instrumentKey);
    if (!parsed) return false;
    return parsed.strike === contract.strike && parsed.side === contract.option;
  });
  if (byParsed && byParsed.lastPrice > 0) return byParsed.lastPrice;

  const sym = quoteIdentity([contract.tradingSymbol]);
  const bySymbol = sym
    ? quotes.find((q) => quoteIdentity([q.instrumentKey, q.symbol]).includes(sym))
    : undefined;
  if (bySymbol && bySymbol.lastPrice > 0) return bySymbol.lastPrice;

  const greekExact = greeks.find(
    (g) => g.instrumentKey.replace(/:/g, '|') === wantKey
  );
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

/**
 * Pick CE or PE whose live premium is in ₹250–300, nearest ATM,
 * then closest to band midpoint (₹275). Never walk into deep ITM junk.
 */
function chooseContractInPremiumBand(opts: {
  rows: ContractRow[];
  side: OptionSide;
  spot: number;
  expiry: string;
  sessionDate: string;
  quotes: UpstoxQuote[];
  greeks: UpstoxOptionGreeks[];
}): { contract: NiftyOptionContract | null; premium: number | null; isAtm: boolean } {
  const preferred =
    preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate) ??
    roundStrike(opts.spot);
  const atm = pickAtmContract(opts.rows, opts.spot, opts.side, preferred);
  const atmPremium = atm ? resolveOptionPremium(atm, opts.quotes, opts.greeks) : null;

  if (atm && atmPremium && atmPremium >= BAND_LO && atmPremium <= BAND_HI) {
    return { contract: atm, premium: atmPremium, isAtm: true };
  }

  const lo = preferred - BAND_SEARCH_STEPS * STRIKE_STEP;
  const hi = preferred + BAND_SEARCH_STEPS * STRIKE_STEP;
  const sideContracts = opts.rows
    .map((row) => contractRowToContract(row, opts.side, opts.expiry))
    .filter((row): row is NiftyOptionContract => Boolean(row))
    .filter((c) => c.strike >= lo && c.strike <= hi);

  type Scored = {
    contract: NiftyOptionContract;
    premium: number;
    strikeDist: number;
    bandDist: number;
  };
  const inBand: Scored[] = [];
  for (const contract of sideContracts) {
    const premium = resolveOptionPremium(contract, opts.quotes, opts.greeks);
    if (!premium || premium < BAND_LO || premium > BAND_HI) continue;
    inBand.push({
      contract,
      premium,
      strikeDist: Math.abs(contract.strike - preferred),
      bandDist: Math.abs(premium - BAND_TARGET),
    });
  }

  inBand.sort((a, b) => a.strikeDist - b.strikeDist || a.bandDist - b.bandDist);
  if (inBand.length) {
    const best = inBand[0];
    return {
      contract: best.contract,
      premium: best.premium,
      isAtm: Boolean(atm && best.contract.strike === atm.strike),
    };
  }

  // Soft board fallback: nearest premium to ₹275 (still reject absurd deep ITM > ₹500).
  let soft: Scored | null = null;
  for (const contract of sideContracts) {
    const premium = resolveOptionPremium(contract, opts.quotes, opts.greeks);
    if (!premium || premium <= 0 || premium > 500) continue;
    const scored: Scored = {
      contract,
      premium,
      strikeDist: Math.abs(contract.strike - preferred),
      bandDist: Math.abs(premium - BAND_TARGET),
    };
    if (
      !soft ||
      scored.bandDist < soft.bandDist ||
      (scored.bandDist === soft.bandDist && scored.strikeDist < soft.strikeDist)
    ) {
      soft = scored;
    }
  }
  if (soft) {
    return {
      contract: soft.contract,
      premium: soft.premium,
      isAtm: Boolean(atm && soft.contract.strike === atm.strike),
    };
  }

  return { contract: atm, premium: atmPremium, isAtm: true };
}

export function sensexPremiumInEntryBand(premium: number): boolean {
  if (NEXUS_PULSE_B_RULES.matchRealOptionStudy) return premium > 0;
  return premium >= BAND_LO && premium <= BAND_HI;
}

function chooseStrictAtm(opts: {
  rows: ContractRow[];
  side: OptionSide;
  spot: number;
  expiry: string;
  sessionDate: string;
  quotes: UpstoxQuote[];
  greeks: UpstoxOptionGreeks[];
}): { contract: NiftyOptionContract | null; premium: number | null; isAtm: boolean } {
  const preferred =
    preferredStrikeForSide(opts.spot, opts.side, opts.expiry, opts.sessionDate) ??
    roundStrike(opts.spot);
  const atm = pickAtmContract(opts.rows, opts.spot, opts.side, preferred);
  const atmPremium = atm ? resolveOptionPremium(atm, opts.quotes, opts.greeks) : null;
  return { contract: atm, premium: atmPremium, isAtm: true };
}

/** Pick Sensex CE+PE candidates (both sides) and the wanted-side entry. */
export async function pickSensexOptions(opts: {
  accessToken: string;
  spot: number;
  wantedSide: OptionSide;
  /** Override: true = ATM only (study). Default follows NEXUS_PULSE_B_RULES.matchRealOptionStudy. */
  strictAtm?: boolean;
}): Promise<{
  candidates: PinaxOptionCandidate[];
  picked: PinaxOptionCandidate | null;
  expiryMode?: string;
  expiry?: string | null;
  error?: string;
}> {
  const sessionDate = istDate();
  const strictAtm = opts.strictAtm ?? NEXUS_PULSE_B_RULES.matchRealOptionStudy;
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

    const quoteSteps = strictAtm ? 6 : BAND_SEARCH_STEPS;
    const quoteKeys = quoteKeysNearSpot(resolved.rows, opts.spot, STRIKE_STEP, quoteSteps);
    const [quotes, greeks] = await Promise.all([
      fetchUpstoxQuotes(opts.accessToken, quoteKeys),
      fetchUpstoxOptionGreeks(opts.accessToken, quoteKeys).catch(() => [] as UpstoxOptionGreeks[]),
    ]);

    const pickOpts = {
      rows: resolved.rows,
      spot: opts.spot,
      expiry: resolved.expiry,
      sessionDate,
      quotes,
      greeks,
    };
    const cePick = strictAtm
      ? chooseStrictAtm({ ...pickOpts, side: 'CE' })
      : chooseContractInPremiumBand({ ...pickOpts, side: 'CE' });
    const pePick = strictAtm
      ? chooseStrictAtm({ ...pickOpts, side: 'PE' })
      : chooseContractInPremiumBand({ ...pickOpts, side: 'PE' });

    const candidates: PinaxOptionCandidate[] = [];
    if (cePick.contract && cePick.premium && cePick.premium > 0) {
      candidates.push(toCandidate(cePick.contract, cePick.premium, cePick.isAtm));
    } else if (strictAtm && cePick.contract) {
      candidates.push(toCandidate(cePick.contract, 0, true));
    }
    if (pePick.contract && pePick.premium && pePick.premium > 0) {
      candidates.push(toCandidate(pePick.contract, pePick.premium, pePick.isAtm));
    } else if (strictAtm && pePick.contract) {
      candidates.push(toCandidate(pePick.contract, 0, true));
    }

    const wanted = candidates.find((c) => c.side === opts.wantedSide) ?? null;
    const picked =
      wanted && (strictAtm ? wanted.premium > 0 : sensexPremiumInEntryBand(wanted.premium))
        ? wanted
        : null;

    return {
      candidates,
      picked,
      expiryMode: resolved.expiryMode,
      expiry: resolved.expiry,
      error:
        candidates.length < 2
          ? strictAtm
            ? 'Could not resolve Sensex ATM CE+PE'
            : `Could not resolve Sensex CE+PE in ₹${BAND_LO}–${BAND_HI} premium band`
          : undefined,
    };
  } catch (e) {
    return {
      candidates: [],
      picked: null,
      error: e instanceof Error ? e.message : 'Sensex option pick failed',
    };
  }
}
