/** Core India index symbols traders use daily */

export type IndiaIndex = {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  /** Yahoo Finance ticker */
  yahoo: string;
  /** TradingView symbol (EXCHANGE:SYMBOL) */
  tv: string;
  aliases?: string[];
};

export const INDIA_INDICES: IndiaIndex[] = [
  {
    symbol: 'NIFTY',
    name: 'Nifty 50',
    exchange: 'NSE',
    yahoo: '^NSEI',
    tv: 'NSE:NIFTY',
    aliases: ['NIFTY50', 'NIFTY 50', 'NSEI'],
  },
  {
    symbol: 'BANKNIFTY',
    name: 'Nifty Bank',
    exchange: 'NSE',
    yahoo: '^NSEBANK',
    tv: 'NSE:BANKNIFTY',
    aliases: ['NIFTYBANK', 'BANK NIFTY'],
  },
  {
    symbol: 'SENSEX',
    name: 'BSE Sensex',
    exchange: 'BSE',
    yahoo: '^BSESN',
    tv: 'BSE:SENSEX',
    aliases: ['BSESENSEX'],
  },
  {
    symbol: 'FINNIFTY',
    name: 'Nifty Financial Services',
    exchange: 'NSE',
    yahoo: 'NIFTY_FIN_SERVICE.NS',
    tv: 'NSE:FINNIFTY',
    aliases: ['NIFTYFIN', 'FIN NIFTY'],
  },
  {
    symbol: 'MIDCPNIFTY',
    name: 'Nifty Midcap Select',
    exchange: 'NSE',
    yahoo: 'NIFTY_MID_SELECT.NS',
    tv: 'NSE:MIDCPNIFTY',
    aliases: ['MIDCAPNIFTY', 'NIFTYMIDSELECT'],
  },
  {
    symbol: 'NIFTYNXT50',
    name: 'Nifty Next 50',
    exchange: 'NSE',
    yahoo: 'NIFTY_NEXT_50.NS',
    tv: 'NSE:NIFTYNXT50',
    aliases: ['NIFTYNEXT50', 'NEXT50'],
  },
  {
    symbol: 'INDIAVIX',
    name: 'India VIX',
    exchange: 'NSE',
    yahoo: '^INDIAVIX',
    tv: 'NSE:INDIAVIX',
    aliases: ['VIX', 'INDIA VIX'],
  },
  {
    symbol: 'NIFTYIT',
    name: 'Nifty IT',
    exchange: 'NSE',
    yahoo: '^CNXIT',
    tv: 'NSE:NIFTYIT',
  },
  {
    symbol: 'NIFTYPHARMA',
    name: 'Nifty Pharma',
    exchange: 'NSE',
    yahoo: '^CNXPHARMA',
    tv: 'NSE:NIFTYPHARMA',
  },
  {
    symbol: 'NIFTYAUTO',
    name: 'Nifty Auto',
    exchange: 'NSE',
    yahoo: '^CNXAUTO',
    tv: 'NSE:NIFTYAUTO',
  },
  {
    symbol: 'NIFTYMETAL',
    name: 'Nifty Metal',
    exchange: 'NSE',
    yahoo: '^CNXMETAL',
    tv: 'NSE:NIFTYMETAL',
  },
  {
    symbol: 'NIFTYFMCG',
    name: 'Nifty FMCG',
    exchange: 'NSE',
    yahoo: '^CNXFMCG',
    tv: 'NSE:NIFTYFMCG',
  },
  {
    symbol: 'NIFTYENERGY',
    name: 'Nifty Energy',
    exchange: 'NSE',
    yahoo: '^CNXENERGY',
    tv: 'NSE:NIFTYENERGY',
  },
  {
    symbol: 'NIFTYREALTY',
    name: 'Nifty Realty',
    exchange: 'NSE',
    yahoo: '^CNXREALTY',
    tv: 'NSE:NIFTYREALTY',
  },
  {
    symbol: 'NIFTYINFRA',
    name: 'Nifty Infra',
    exchange: 'NSE',
    yahoo: '^CNXINFRA',
    tv: 'NSE:NIFTYINFRA',
  },
  {
    symbol: 'NIFTYPSE',
    name: 'Nifty PSE',
    exchange: 'NSE',
    yahoo: '^CNXPSE',
    tv: 'NSE:NIFTYPSE',
  },
  {
    symbol: 'NIFTYMEDIA',
    name: 'Nifty Media',
    exchange: 'NSE',
    yahoo: '^CNXMEDIA',
    tv: 'NSE:NIFTYMEDIA',
  },
  {
    symbol: 'NIFTYPSUBANK',
    name: 'Nifty PSU Bank',
    exchange: 'NSE',
    yahoo: '^CNXPSUBANK',
    tv: 'NSE:NIFTYPSUBANK',
  },
  {
    symbol: 'NIFTYPVTBANK',
    name: 'Nifty Private Bank',
    exchange: 'NSE',
    yahoo: 'NIFTY_PVT_BANK.NS',
    tv: 'NSE:NIFTYPVTBANK',
    aliases: ['NIFTYPVTBNK'],
  },
  {
    symbol: 'NIFTY100',
    name: 'Nifty 100',
    exchange: 'NSE',
    yahoo: '^CNX100',
    tv: 'NSE:NIFTY100',
  },
  {
    symbol: 'NIFTY200',
    name: 'Nifty 200',
    exchange: 'NSE',
    yahoo: '^CNX200',
    tv: 'NSE:NIFTY200',
  },
  {
    symbol: 'NIFTYMIDCAP',
    name: 'Nifty Midcap 100',
    exchange: 'NSE',
    yahoo: '^NSMIDCP',
    tv: 'NSE:NIFTYMIDCAP100',
    aliases: ['NIFTYMIDCAP100'],
  },
];

/** Deduped trading symbols shown in pickers (skip alias-only rows). */
export const INDIA_INDEX_SYMBOLS: string[] = [
  'NIFTY',
  'BANKNIFTY',
  'SENSEX',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'INDIAVIX',
  'NIFTYIT',
  'NIFTYPHARMA',
  'NIFTYAUTO',
  'NIFTYMETAL',
  'NIFTYFMCG',
  'NIFTYENERGY',
  'NIFTYREALTY',
  'NIFTYINFRA',
  'NIFTYPSE',
  'NIFTYMEDIA',
  'NIFTYPSUBANK',
  'NIFTYPVTBANK',
  'NIFTY100',
  'NIFTY200',
  'NIFTYMIDCAP',
];

const BY_KEY = new Map<string, IndiaIndex>();
for (const row of INDIA_INDICES) {
  BY_KEY.set(row.symbol, row);
  for (const a of row.aliases || []) {
    BY_KEY.set(a.replace(/\s+/g, '').toUpperCase(), row);
    BY_KEY.set(a.toUpperCase(), row);
  }
}

export function resolveIndiaIndex(raw: string): IndiaIndex | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (BY_KEY.has(s)) return BY_KEY.get(s)!;
  const compact = s.replace(/\s+/g, '');
  if (BY_KEY.has(compact)) return BY_KEY.get(compact)!;
  return null;
}

export function isIndiaIndexSymbol(raw: string): boolean {
  return resolveIndiaIndex(raw) != null;
}

export function searchIndiaIndices(
  q: string,
  limit = 20
): { symbol: string; name: string; exchange: 'NSE' | 'BSE' }[] {
  const upper = q.trim().toUpperCase();
  const seen = new Set<string>();
  const out: { symbol: string; name: string; exchange: 'NSE' | 'BSE' }[] = [];

  for (const sym of INDIA_INDEX_SYMBOLS) {
    const row = BY_KEY.get(sym);
    if (!row) continue;
    if (seen.has(row.symbol)) continue;
    const hay = `${row.symbol} ${row.name} ${(row.aliases || []).join(' ')}`.toUpperCase();
    if (!upper || hay.includes(upper) || row.symbol.includes(upper)) {
      seen.add(row.symbol);
      out.push({ symbol: row.symbol, name: row.name, exchange: row.exchange });
      if (out.length >= limit) break;
    }
  }
  return out;
}
