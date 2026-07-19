import { gunzipSync } from 'zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { searchIndiaIndices } from '@/lib/india-indices';

export type EquityInstrument = {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  instrumentKey: string;
  isin: string;
  segment: string;
};

type RawInstrument = {
  segment?: string;
  name?: string;
  exchange?: string;
  isin?: string;
  instrument_type?: string;
  instrument_key?: string;
  trading_symbol?: string;
  short_name?: string;
  security_type?: string;
};

const NSE_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
const BSE_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz';
const CACHE_DIR = path.join(process.cwd(), '.data');
const CACHE_FILE = path.join(CACHE_DIR, 'nse-bse-eq.json');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

type CachePayload = {
  fetchedAt: string;
  instruments: EquityInstrument[];
};

let memoryCache: CachePayload | null = null;

async function fetchGzipJson(url: string): Promise<RawInstrument[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Instrument download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString('utf8');
  const parsed = JSON.parse(json) as RawInstrument[];
  return Array.isArray(parsed) ? parsed : [];
}

const BSE_EQUITY_TYPES = new Set([
  'A',
  'B',
  'T',
  'XT',
  'X',
  'Z',
  'MT',
  'TS',
  'E',
  'MS',
  'ZP',
]);

function isEquity(row: RawInstrument): boolean {
  const seg = (row.segment || '').toUpperCase();
  if (!row.instrument_key || !row.trading_symbol) return false;
  if (seg === 'NSE_EQ') {
    const t = (row.instrument_type || '').toUpperCase();
    return !t || t === 'EQ';
  }
  if (seg === 'BSE_EQ') {
    const t = (row.instrument_type || '').toUpperCase();
    if (!BSE_EQUITY_TYPES.has(t)) return false;
    // Skip bonds / debt-style names that sometimes leak into equity segments
    const name = (row.name || '').toUpperCase();
    if (name.includes('%') || name.includes('-PVT') || name.includes('MUTUAL FUND')) return false;
    const isin = (row.isin || '').toUpperCase();
    if (isin.startsWith('INF')) return false; // mutual fund schemes
    return true;
  }
  return false;
}

function toEquity(row: RawInstrument): EquityInstrument | null {
  if (!isEquity(row)) return null;
  const exchange = row.segment === 'BSE_EQ' ? 'BSE' : 'NSE';
  return {
    symbol: String(row.trading_symbol).toUpperCase(),
    name: row.name || row.short_name || String(row.trading_symbol),
    exchange,
    instrumentKey: String(row.instrument_key),
    isin: row.isin || '',
    segment: String(row.segment),
  };
}

function readDiskCache(): CachePayload | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.instruments?.length || !parsed.fetchedAt) return null;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(payload: CachePayload) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(payload));
  } catch {
    /* ignore disk errors on serverless */
  }
}

/** Full NSE + BSE equity universe (cached) */
export async function getEquityInstruments(force = false): Promise<EquityInstrument[]> {
  if (!force && memoryCache?.instruments?.length) return memoryCache.instruments;
  if (!force) {
    const disk = readDiskCache();
    if (disk) {
      memoryCache = disk;
      return disk.instruments;
    }
  }

  const [nseRaw, bseRaw] = await Promise.all([fetchGzipJson(NSE_URL), fetchGzipJson(BSE_URL)]);
  const map = new Map<string, EquityInstrument>();
  for (const row of [...nseRaw, ...bseRaw]) {
    const eq = toEquity(row);
    if (!eq) continue;
    // Prefer NSE when same symbol exists on both
    const key = `${eq.exchange}:${eq.symbol}`;
    if (!map.has(key)) map.set(key, eq);
  }

  const instruments = Array.from(map.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
  const payload: CachePayload = {
    fetchedAt: new Date().toISOString(),
    instruments,
  };
  memoryCache = payload;
  writeDiskCache(payload);
  return instruments;
}

export async function searchInstruments(opts: {
  q?: string;
  exchange?: 'NSE' | 'BSE' | 'ALL';
  limit?: number;
}): Promise<{ total: number; items: EquityInstrument[] }> {
  const all = await getEquityInstruments();
  const exchange = opts.exchange || 'ALL';
  const q = (opts.q || '').trim().toUpperCase();
  const limit = Math.min(Math.max(opts.limit || 50, 1), 500);

  // Indices first — not in Upstox equity BOD files
  const indexHits = searchIndiaIndices(q || '', Math.min(limit, 22))
    .filter((i) => exchange === 'ALL' || i.exchange === exchange)
    .map(
      (i): EquityInstrument => ({
        symbol: i.symbol,
        name: i.name,
        exchange: i.exchange,
        instrumentKey: `INDEX|${i.exchange}|${i.symbol}`,
        isin: '',
        segment: `${i.exchange}_INDEX`,
      })
    );

  let filtered = all;
  if (exchange === 'NSE' || exchange === 'BSE') {
    filtered = filtered.filter((i) => i.exchange === exchange);
  }
  if (q) {
    filtered = filtered.filter(
      (i) =>
        i.symbol.includes(q) ||
        i.name.toUpperCase().includes(q) ||
        i.isin.toUpperCase().includes(q)
    );
    // Prefer symbol prefix matches (BHAR → BHARTIARTL before random name hits)
    filtered = [...filtered].sort((a, b) => {
      const aStarts = a.symbol.startsWith(q) ? 0 : a.symbol.includes(q) ? 1 : 2;
      const bStarts = b.symbol.startsWith(q) ? 0 : b.symbol.includes(q) ? 1 : 2;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.symbol.localeCompare(b.symbol);
    });
  } else {
    // Empty query: show indices + start of equity universe
    filtered = filtered.slice(0, Math.max(0, limit - indexHits.length));
  }

  const seen = new Set(indexHits.map((i) => i.symbol));
  const merged = [
    ...indexHits,
    ...filtered.filter((i) => !seen.has(i.symbol)),
  ].slice(0, limit);

  return {
    total: indexHits.length + filtered.length,
    items: merged,
  };
}

/** Resolve trading symbols → instrument keys (NSE preferred) */
export async function resolveInstrumentKeys(
  symbols: string[]
): Promise<Map<string, EquityInstrument>> {
  const all = await getEquityInstruments();
  const bySymbol = new Map<string, EquityInstrument>();
  for (const row of all) {
    const existing = bySymbol.get(row.symbol);
    if (!existing || (existing.exchange === 'BSE' && row.exchange === 'NSE')) {
      bySymbol.set(row.symbol, row);
    }
  }
  const out = new Map<string, EquityInstrument>();
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase();
    const hit = bySymbol.get(sym);
    if (hit) out.set(sym, hit);
  }
  return out;
}
