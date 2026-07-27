import { UPSTOX_API_BASE } from '@/lib/upstox';
import { fetchUpstoxQuotes } from '@/lib/upstox-market';

export type OptionSide = 'CE' | 'PE';

export type NiftyOptionContract = {
  instrumentKey: string;
  tradingSymbol: string;
  strike: number;
  option: OptionSide;
  expiry: string;
  lotSize: number;
};

export type UpstoxOptionGreeks = {
  instrumentKey: string;
  lastPrice: number;
  iv: number;
  vega: number;
  gamma: number;
  theta: number;
  delta: number;
  oi: number;
  volume: number;
};

type ContractRow = {
  instrument_key?: string;
  trading_symbol?: string;
  strike_price?: number;
  instrument_type?: string;
  option_type?: string;
  expiry?: string;
  lot_size?: number;
  weekly?: boolean;
};

const NIFTY_INDEX_KEY = 'NSE_INDEX|Nifty 50';

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

function contractSide(row: ContractRow): OptionSide | null {
  const raw = String(row.instrument_type || row.option_type || '')
    .toUpperCase()
    .trim();
  if (raw === 'CE' || raw === 'CALL') return 'CE';
  if (raw === 'PE' || raw === 'PUT') return 'PE';
  const symbol = String(row.trading_symbol || '').toUpperCase();
  if (/\bCE\b/.test(symbol) || symbol.endsWith('CE')) return 'CE';
  if (/\bPE\b/.test(symbol) || symbol.endsWith('PE')) return 'PE';
  return null;
}

/** Nearest weekly (or listed) Nifty option contracts from Upstox */
export async function fetchNiftyOptionContracts(
  accessToken: string,
  expiryKeyword?: 'current_week' | 'next_week' | 'far_week' | string
): Promise<ContractRow[]> {
  const qs = new URLSearchParams({ instrument_key: NIFTY_INDEX_KEY });
  if (expiryKeyword) qs.set('expiry_date', expiryKeyword);
  const res = await fetch(`${UPSTOX_API_BASE}/option/contract?${qs}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken.trim()}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstox option contracts ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: ContractRow[] };
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Fallback for days where the relative `next_week` keyword returns no rows:
 * select the first actual listed expiry strictly after the supplied date.
 */
export async function fetchNextListedNiftyOptionContracts(
  accessToken: string,
  afterDate: string
): Promise<ContractRow[]> {
  const all = await fetchNiftyOptionContracts(accessToken);
  const nextExpiry = [...new Set(
    all
      .map((row) => String(row.expiry || '').slice(0, 10))
      .filter((expiry) => /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry > afterDate)
  )].sort()[0];
  return nextExpiry
    ? all.filter((row) => String(row.expiry || '').slice(0, 10) === nextExpiry)
    : [];
}

/**
 * Prefer current-week ATM; if Upstox returns empty/broken keyword data,
 * walk next_week → far_week → nearest listed expiry on/after today.
 */
export async function resolveNiftyAtmContracts(
  accessToken: string,
  spot: number,
  sessionDate: string
): Promise<{
  expiryMode: 'current_week' | 'next_week' | 'listed';
  rolledFromExpiryDay: boolean;
  contracts: ContractRow[];
  ce: NiftyOptionContract | null;
  pe: NiftyOptionContract | null;
}> {
  const tryPick = (rows: ContractRow[]) => ({
    ce: pickAtmContract(rows, spot, 'CE'),
    pe: pickAtmContract(rows, spot, 'PE'),
  });

  let expiryMode: 'current_week' | 'next_week' | 'listed' = 'current_week';
  let contracts = await fetchNiftyOptionContracts(accessToken, 'current_week');
  let { ce, pe } = tryPick(contracts);
  let rolledFromExpiryDay = ce?.expiry === sessionDate || pe?.expiry === sessionDate;

  // Expiry day: avoid same-day theta collapse by rolling to next week.
  if (rolledFromExpiryDay) {
    expiryMode = 'next_week';
    contracts = await fetchNiftyOptionContracts(accessToken, 'next_week');
    ({ ce, pe } = tryPick(contracts));
    if (!ce || !pe) {
      contracts = await fetchNextListedNiftyOptionContracts(accessToken, sessionDate);
      ({ ce, pe } = tryPick(contracts));
      expiryMode = 'listed';
    }
  }

  // Keyword sometimes returns empty right after open / on holiday weeks.
  if (!ce || !pe) {
    for (const keyword of ['next_week', 'far_week'] as const) {
      contracts = await fetchNiftyOptionContracts(accessToken, keyword);
      ({ ce, pe } = tryPick(contracts));
      if (ce && pe) {
        expiryMode = keyword === 'next_week' ? 'next_week' : 'listed';
        rolledFromExpiryDay = false;
        break;
      }
    }
  }

  if (!ce || !pe) {
    const all = await fetchNiftyOptionContracts(accessToken);
    const onOrAfter = [...new Set(
      all
        .map((row) => String(row.expiry || '').slice(0, 10))
        .filter((expiry) => /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry >= sessionDate)
    )].sort();
    for (const expiry of onOrAfter) {
      // Prefer non-expiring-today contracts when available.
      if (expiry === sessionDate && onOrAfter.length > 1) continue;
      contracts = all.filter((row) => String(row.expiry || '').slice(0, 10) === expiry);
      ({ ce, pe } = tryPick(contracts));
      if (ce && pe) {
        expiryMode = 'listed';
        rolledFromExpiryDay = expiry > sessionDate && onOrAfter[0] === sessionDate;
        break;
      }
    }
  }

  return { expiryMode, rolledFromExpiryDay, contracts, ce, pe };
}

/** Fetch live Greeks for up to 50 option contracts in one Upstox V3 call. */
export async function fetchUpstoxOptionGreeks(
  accessToken: string,
  instrumentKeys: string[]
): Promise<UpstoxOptionGreeks[]> {
  if (!instrumentKeys.length) return [];
  const encoded = encodeURIComponent(instrumentKeys.slice(0, 50).join(','));
  const res = await fetch(
    `https://api.upstox.com/v3/market-quote/option-greek?instrument_key=${encoded}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstox option Greeks ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: Record<
      string,
      {
        instrument_token?: string;
        last_price?: number;
        iv?: number;
        vega?: number;
        gamma?: number;
        theta?: number;
        delta?: number;
        oi?: number;
        volume?: number;
      }
    >;
  };
  return Object.entries(json.data || {}).map(([fallbackKey, row]) => ({
    instrumentKey: String(row.instrument_token || fallbackKey),
    lastPrice: Number(row.last_price ?? 0),
    iv: Number(row.iv ?? 0),
    vega: Number(row.vega ?? 0),
    gamma: Number(row.gamma ?? 0),
    theta: Number(row.theta ?? 0),
    delta: Number(row.delta ?? 0),
    oi: Number(row.oi ?? 0),
    volume: Number(row.volume ?? 0),
  }));
}

export function pickAtmContract(
  contracts: ContractRow[],
  spot: number,
  option: OptionSide,
  preferredStrike?: number
): NiftyOptionContract | null {
  const side = option.toUpperCase() as OptionSide;
  const wanted = preferredStrike ?? round50(spot);
  const sameSide = contracts.filter(
    (c) => contractSide(c) === side && Boolean(c.instrument_key)
  );
  if (!sameSide.length) return null;

  let best = sameSide[0];
  let bestDist = Math.abs(Number(best.strike_price ?? 0) - wanted);
  for (const c of sameSide) {
    const strike = Number(c.strike_price ?? 0);
    const d = Math.abs(strike - wanted);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }

  const strike = Number(best.strike_price ?? 0);
  if (!best.instrument_key || !strike) return null;

  return {
    instrumentKey: String(best.instrument_key),
    tradingSymbol: String(best.trading_symbol || ''),
    strike,
    option: side,
    expiry: String(best.expiry || '').slice(0, 10),
    lotSize: Number(best.lot_size ?? 65) || 65,
  };
}

/** Live LTP for a Nifty CE/PE (ATM by default) via Upstox */
export async function fetchNiftyOptionLtp(opts: {
  accessToken: string;
  spot: number;
  option: OptionSide;
  strike?: number;
  expiryKeyword?: 'current_week' | 'next_week';
}): Promise<{
  ok: boolean;
  ltp: number;
  contract: NiftyOptionContract | null;
  source: 'upstox' | 'none';
  error?: string;
}> {
  try {
    const contracts = await fetchNiftyOptionContracts(
      opts.accessToken,
      opts.expiryKeyword || 'current_week'
    );
    const contract = pickAtmContract(
      contracts,
      opts.spot,
      opts.option,
      opts.strike
    );
    if (!contract) {
      return {
        ok: false,
        ltp: 0,
        contract: null,
        source: 'none',
        error: 'No matching Nifty option contract',
      };
    }
    const quotes = await fetchUpstoxQuotes(opts.accessToken, [
      contract.instrumentKey,
    ]);
    const q = quotes[0];
    if (!q?.lastPrice) {
      return {
        ok: false,
        ltp: 0,
        contract,
        source: 'none',
        error: 'No LTP for option',
      };
    }
    return {
      ok: true,
      ltp: Math.round(q.lastPrice * 100) / 100,
      contract,
      source: 'upstox',
    };
  } catch (e) {
    return {
      ok: false,
      ltp: 0,
      contract: null,
      source: 'none',
      error: e instanceof Error ? e.message : 'Option LTP failed',
    };
  }
}
