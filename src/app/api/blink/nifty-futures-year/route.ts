import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import {
  chunkDateRange,
  fetchUpstoxHistoricalWindow,
  fetchUpstoxIntradayCandles,
} from '@/lib/upstox-historical';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NIFTY_KEY = 'NSE_INDEX|Nifty 50';
const FROM_DATE = '2025-07-22';
const TO_DATE = '2026-07-21';
const DATA_PATH = path.join(
  process.cwd(),
  '.data',
  'nifty-futures-1m-2025-07-22-to-2026-07-21.json'
);

type Contract = {
  instrument_key?: string;
  trading_symbol?: string;
  expiry?: string | number;
  lot_size?: number;
  tick_size?: number;
  instrument_type?: string;
  name?: string;
  segment?: string;
};

function normalizeExpiry(value: string | number | undefined) {
  if (typeof value === 'number' || /^\d{12,}$/.test(String(value || ''))) {
    return new Date(Number(value)).toISOString().slice(0, 10);
  }
  return String(value || '').slice(0, 10);
}

type Bar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
};

type ContractData = {
  instrumentKey: string;
  tradingSymbol: string;
  expiry: string;
  lotSize: number;
  tickSize: number;
  active: boolean;
  sessions: Record<string, Bar[]>;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ist(timestamp: string) {
  const shifted = new Date(new Date(timestamp).getTime() + 330 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

async function jsonRequest<T>(url: string, token: string): Promise<T> {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text) as T;
    lastError = `Upstox ${response.status}: ${text.slice(0, 250)}`;
    if (response.status !== 429 && response.status < 500) break;
    await pause(500 * 2 ** attempt);
  }
  throw new Error(lastError);
}

async function discoverContracts(token: string) {
  const expiryUrl = new URL(
    'https://api.upstox.com/v2/expired-instruments/expiries'
  );
  expiryUrl.searchParams.set('instrument_key', NIFTY_KEY);
  const expiryResponse = await jsonRequest<{ data?: string[] }>(
    expiryUrl.toString(),
    token
  );
  const candidateExpiries = (expiryResponse.data || []).filter(
    (expiry) => expiry >= FROM_DATE && expiry <= TO_DATE
  );
  const expired: Contract[] = [];
  for (const expiry of candidateExpiries) {
    const url = new URL(
      'https://api.upstox.com/v2/expired-instruments/future/contract'
    );
    url.searchParams.set('instrument_key', NIFTY_KEY);
    url.searchParams.set('expiry_date', expiry);
    const response = await jsonRequest<{ data?: Contract[] }>(
      url.toString(),
      token
    );
    const rows = (response.data || []).filter(
      (row) => String(row.instrument_type).toUpperCase() === 'FUT'
    );
    expired.push(...rows);
    await pause(100);
  }

  const masterResponse = await fetch(
    'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz',
    { cache: 'no-store' }
  );
  if (!masterResponse.ok) {
    throw new Error(`Upstox instrument master ${masterResponse.status}`);
  }
  const compressed = Buffer.from(await masterResponse.arrayBuffer());
  const master = JSON.parse(gunzipSync(compressed).toString('utf8')) as Contract[];
  const active = master.filter(
    (row) => {
      const symbol = String(row.trading_symbol || '').toUpperCase();
      return (
        row.segment === 'NSE_FO' &&
        String(row.name || '').toUpperCase() === 'NIFTY' &&
        symbol.startsWith('NIFTY') &&
        symbol.includes('FUT') &&
        normalizeExpiry(row.expiry) >= TO_DATE
      );
    }
  ).map((row) => ({ ...row, expiry: normalizeExpiry(row.expiry) }));
  return {
    expired,
    active,
    expiredKeys: new Set(expired.map((row) => String(row.instrument_key))),
  };
}

function parseRows(
  rows: [string, number, number, number, number, number?, number?][]
) {
  const sessions: Record<string, Bar[]> = {};
  for (const [timestamp, open, high, low, close, volume, oi] of rows) {
    const parts = ist(timestamp);
    if (
      parts.date < FROM_DATE ||
      parts.date > TO_DATE ||
      parts.minute < 9 * 60 + 15 ||
      parts.minute > 15 * 60 + 13
    ) {
      continue;
    }
    const bars = sessions[parts.date] || [];
    bars.push({
      time: parts.time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
      oi: Number(oi || 0),
    });
    sessions[parts.date] = bars;
  }
  for (const bars of Object.values(sessions)) {
    bars.sort((a, b) => a.time.localeCompare(b.time));
  }
  return sessions;
}

async function fetchExpiredContract(
  token: string,
  contract: Contract
): Promise<ContractData> {
  const expiry = String(contract.expiry).slice(0, 10);
  const from = addDays(expiry, -50) < FROM_DATE ? FROM_DATE : addDays(expiry, -50);
  const rows: [string, number, number, number, number, number?, number?][] = [];
  for (const chunk of chunkDateRange(from, expiry, 28)) {
    const key = encodeURIComponent(String(contract.instrument_key));
    const url =
      `https://api.upstox.com/v2/expired-instruments/historical-candle/` +
      `${key}/1minute/${chunk.to}/${chunk.from}`;
    const response = await jsonRequest<{
      data?: {
        candles?: [string, number, number, number, number, number?, number?][];
      };
    }>(url, token);
    rows.push(...(response.data?.candles || []));
    await pause(120);
  }
  return {
    instrumentKey: String(contract.instrument_key),
    tradingSymbol: String(contract.trading_symbol || ''),
    expiry,
    lotSize: Number(contract.lot_size || 0),
    tickSize: Number(contract.tick_size || 0),
    active: false,
    sessions: parseRows(rows),
  };
}

async function fetchActiveContract(
  token: string,
  contract: Contract
): Promise<ContractData> {
  const expiry = String(contract.expiry).slice(0, 10);
  const rows: [string, number, number, number, number, number?, number?][] = [];
  const from = addDays(TO_DATE, -50) < FROM_DATE ? FROM_DATE : addDays(TO_DATE, -50);
  for (const chunk of chunkDateRange(from, TO_DATE, 28)) {
    const response = await fetchUpstoxHistoricalWindow({
      accessToken: token,
      instrumentKey: String(contract.instrument_key),
      unit: 'minutes',
      interval: 1,
      fromDate: chunk.from,
      toDate: chunk.to,
    });
    if (!response.ok) throw new Error(response.error || 'Active futures history failed');
    rows.push(
      ...response.candles.map(
        (bar) =>
          [
            bar.t,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume || 0,
            bar.oi || 0,
          ] as [string, number, number, number, number, number, number]
      )
    );
  }
  const currentIst = new Date(Date.now() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (TO_DATE === currentIst) {
    const intraday = await fetchUpstoxIntradayCandles({
      accessToken: token,
      instrumentKey: String(contract.instrument_key),
      interval: 1,
    });
    if (intraday.ok) {
      rows.push(
        ...intraday.candles.map(
          (bar) =>
            [
              bar.t,
              bar.open,
              bar.high,
              bar.low,
              bar.close,
              bar.volume || 0,
              bar.oi || 0,
            ] as [string, number, number, number, number, number, number]
        )
      );
    }
  }
  return {
    instrumentKey: String(contract.instrument_key),
    tradingSymbol: String(contract.trading_symbol || ''),
    expiry,
    lotSize: Number(contract.lot_size || 0),
    tickSize: Number(contract.tick_size || 0),
    active: true,
    sessions: parseRows(rows),
  };
}

function buildContinuous(contracts: ContractData[], rollSessions: number) {
  const allDates = [
    ...new Set(contracts.flatMap((contract) => Object.keys(contract.sessions))),
  ].sort();
  const selected = [];
  for (const date of allDates) {
    const available = contracts
      .filter(
        (contract) =>
          contract.expiry >= date &&
          contract.sessions[date]?.length === 359
      )
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
    if (!available.length) continue;
    let contract = available[0];
    const datesThroughExpiry = allDates.filter(
      (value) => value >= date && value <= contract.expiry
    );
    if (datesThroughExpiry.length <= rollSessions && available[1]) {
      contract = available[1];
    }
    selected.push({
      date,
      instrumentKey: contract.instrumentKey,
      tradingSymbol: contract.tradingSymbol,
      expiry: contract.expiry,
      lotSize: contract.lotSize,
      tickSize: contract.tickSize,
      bars: contract.sessions[date],
    });
  }
  return selected;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first.' },
        { status: 401 }
      );
    }
    const discovered = await discoverContracts(token);
    const uniqueContracts = [
      ...new Map(
        [...discovered.expired, ...discovered.active].map((contract) => [
          String(contract.instrument_key),
          contract,
        ])
      ).values(),
    ].sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    const contractData: ContractData[] = [];
    for (const contract of uniqueContracts) {
      const key = String(contract.instrument_key);
      contractData.push(
        discovered.expiredKeys.has(key)
          ? await fetchExpiredContract(token, contract)
          : await fetchActiveContract(token, contract)
      );
    }
    const primary = buildContinuous(contractData, 5);
    const roll3 = buildContinuous(contractData, 3);
    const roll7 = buildContinuous(contractData, 7);
    const coverageIssues = primary.flatMap((session) => {
      const bars = [
        ...new Map(session.bars.map((bar) => [bar.time, bar])).values(),
      ];
      return bars.length === 359 &&
        bars[0]?.time === '09:15' &&
        bars.at(-1)?.time === '15:13'
        ? []
        : [
            {
              date: session.date,
              contract: session.tradingSymbol,
              bars: bars.length,
              first: bars[0]?.time || null,
              last: bars.at(-1)?.time || null,
            },
          ];
    });
    const dataset = {
      version: 1,
      generatedAt: new Date().toISOString(),
      fromDate: FROM_DATE,
      toDate: TO_DATE,
      primaryRollSessions: 5,
      contracts: contractData.map(({ sessions, ...contract }) => ({
        ...contract,
        sessionCount: Object.keys(sessions).length,
      })),
      primary,
      roll3,
      roll7,
      coverageIssues,
    };
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    const temporary = `${DATA_PATH}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(dataset), 'utf8');
    await fs.rename(temporary, DATA_PATH);

    const csvPath = path.join(
      os.homedir(),
      'Downloads',
      'NSE_NIFTY_FUTURES_1m_2025-07-22_to_2026-07-21.csv'
    );
    const lines = [
      'date,time,open,high,low,close,volume,oi,expiry,lot_size,instrument_key,trading_symbol',
    ];
    for (const session of primary) {
      for (const bar of session.bars) {
        lines.push(
          [
            session.date,
            bar.time,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
            bar.oi,
            session.expiry,
            session.lotSize,
            session.instrumentKey,
            session.tradingSymbol,
          ].join(',')
        );
      }
    }
    await fs.writeFile(csvPath, `${lines.join('\r\n')}\r\n`, 'utf8');
    return NextResponse.json({
      ok:
        primary.length > 200 &&
        primary.at(-1)?.date === TO_DATE &&
        coverageIssues.length === 0,
      dataPath: DATA_PATH,
      csvPath,
      contracts: contractData.length,
      sessions: primary.length,
      candles: primary.reduce((sum, session) => sum + session.bars.length, 0),
      firstDate: primary[0]?.date || null,
      lastDate: primary.at(-1)?.date || null,
      coverageIssues,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
