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
  expiry?: string;
  lot_size?: number;
  weekly?: boolean;
};

const NIFTY_INDEX_KEY = 'NSE_INDEX|Nifty 50';

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

/** Nearest weekly (or listed) Nifty option contracts from Upstox */
export async function fetchNiftyOptionContracts(
  accessToken: string,
  expiryKeyword?: 'current_week' | 'next_week'
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
    (c) => String(c.instrument_type || '').toUpperCase() === side && c.instrument_key
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
