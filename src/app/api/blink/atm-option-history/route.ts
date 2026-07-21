import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchUpstoxHistoricalWindow,
  fetchUpstoxIntradayCandles,
} from '@/lib/upstox-historical';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NIFTY_KEY = 'NSE_INDEX|Nifty 50';
const FROM_DATE = '2026-02-26';
const TO_DATE = '2026-07-21';
const DATA_PATH = path.join(
  process.cwd(),
  '.data',
  'blink-atm-option-history-1m.json'
);

type Contract = {
  instrument_key?: string;
  trading_symbol?: string;
  strike_price?: number;
  instrument_type?: string;
  expiry?: string;
  lot_size?: number;
};

type OptionBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
};

type StoredSession = {
  date: string;
  spotAtLock: number;
  lockCandle: string;
  optionEvaluationFrom: string;
  expiry: string;
  expiryDayRollover: boolean;
  strike: number;
  ce: {
    instrumentKey: string;
    tradingSymbol: string;
    bars: OptionBar[];
  };
  pe: {
    instrumentKey: string;
    tradingSymbol: string;
    bars: OptionBar[];
  };
};

type StoredDataset = {
  version: 1;
  generatedAt: string;
  rule: {
    underlying: string;
    fromDate: string;
    toDate: string;
    atm: string;
    expiry: string;
    session: string;
  };
  sessions: StoredSession[];
  errors: { date: string; error: string }[];
};

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function istParts(timestamp: string) {
  const shifted = new Date(new Date(timestamp).getTime() + 330 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

async function upstoxJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upstox ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

async function fetchExpiredContracts(
  token: string,
  expiry: string
): Promise<Contract[]> {
  const url = new URL(
    'https://api.upstox.com/v2/expired-instruments/option/contract'
  );
  url.searchParams.set('instrument_key', NIFTY_KEY);
  url.searchParams.set('expiry_date', expiry);
  const json = await upstoxJson<{ data?: Contract[] }>(url.toString(), token);
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchActiveContracts(token: string): Promise<Contract[]> {
  const url = new URL('https://api.upstox.com/v2/option/contract');
  url.searchParams.set('instrument_key', NIFTY_KEY);
  const json = await upstoxJson<{ data?: Contract[] }>(url.toString(), token);
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchExpiredBars(
  token: string,
  instrumentKey: string,
  date: string
): Promise<OptionBar[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const url =
    `https://api.upstox.com/v2/expired-instruments/historical-candle/` +
    `${encoded}/1minute/${date}/${date}`;
  const json = await upstoxJson<{
    data?: {
      candles?: [
        string,
        number,
        number,
        number,
        number,
        number?,
        number?,
      ][];
    };
  }>(url, token);
  return parseOptionBars(json.data?.candles || [], date);
}

function parseOptionBars(
  rows: [
    string,
    number,
    number,
    number,
    number,
    number?,
    number?,
  ][],
  date: string
): OptionBar[] {
  return rows
    .map(([timestamp, open, high, low, close, volume, oi]) => {
      const ist = istParts(timestamp);
      return {
        date: ist.date,
        minute: ist.minute,
        bar: {
          time: ist.time,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume || 0),
          oi: Number(oi || 0),
        },
      };
    })
    .filter(
      ({ date: barDate, minute }) =>
        barDate === date &&
        minute >= 9 * 60 + 15 &&
        minute <= 15 * 60 + 13
    )
    .sort((a, b) => a.minute - b.minute)
    .map(({ bar }) => bar);
}

async function fetchActiveBars(
  token: string,
  instrumentKey: string,
  date: string
): Promise<OptionBar[]> {
  const currentIstDate = new Date(Date.now() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (date === currentIstDate) {
    const intraday = await fetchUpstoxIntradayCandles({
      accessToken: token,
      instrumentKey,
      unit: 'minutes',
      interval: 1,
    });
    if (!intraday.ok) {
      throw new Error(intraday.error || 'Active option intraday candles failed');
    }
    const intradayRows = intraday.candles.map(
      (bar) =>
        [
          bar.t,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume || 0,
          bar.oi || 0,
        ] as [
          string,
          number,
          number,
          number,
          number,
          number,
          number,
        ]
    );
    return parseOptionBars(intradayRows, date);
  }

  const result = await fetchUpstoxHistoricalWindow({
    accessToken: token,
    instrumentKey,
    unit: 'minutes',
    interval: 1,
    fromDate: date,
    toDate: date,
  });
  if (!result.ok) throw new Error(result.error || 'Active option candles failed');
  const rows = result.candles.map(
    (bar) =>
      [
        bar.t,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume || 0,
        bar.oi || 0,
      ] as [
        string,
        number,
        number,
        number,
        number,
        number,
        number,
      ]
  );
  return parseOptionBars(rows, date);
}

async function loadNiftySessions() {
  const csvPath = path.join(
    os.homedir(),
    'Downloads',
    'NSE_NIFTY_1m_2026-02-26_to_2026-07-21.csv'
  );
  const raw = await fs.readFile(csvPath, 'utf8');
  const rows = raw.trim().split(/\r?\n/).slice(1);
  const sessions = new Map<string, { time: string; close: number }[]>();
  for (const row of rows) {
    const [time, , , , closeText] = row.split(',');
    const date = time.slice(0, 10);
    if (date < FROM_DATE || date > TO_DATE) continue;
    const bars = sessions.get(date) || [];
    bars.push({ time: time.slice(11, 16), close: Number(closeText) });
    sessions.set(date, bars);
  }
  return sessions;
}

function pickPair(contracts: Contract[], spot: number) {
  const strikes = [
    ...new Set(
      contracts
        .map((contract) => Number(contract.strike_price))
        .filter(Number.isFinite)
    ),
  ];
  const strike = strikes.sort(
    (a, b) => Math.abs(a - spot) - Math.abs(b - spot)
  )[0];
  const ce = contracts.find(
    (contract) =>
      Number(contract.strike_price) === strike &&
      String(contract.instrument_type).toUpperCase() === 'CE'
  );
  const pe = contracts.find(
    (contract) =>
      Number(contract.strike_price) === strike &&
      String(contract.instrument_type).toUpperCase() === 'PE'
  );
  if (!strike || !ce?.instrument_key || !pe?.instrument_key) {
    throw new Error(`No complete ATM CE/PE pair near ${spot}`);
  }
  return { strike, ce, pe };
}

async function saveDataset(dataset: StoredDataset) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  const temporary = `${DATA_PATH}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(dataset), 'utf8');
  await fs.rename(temporary, DATA_PATH);
}

async function writeCsv(dataset: StoredDataset) {
  const lines = [
    'date,expiry,strike,option,time,open,high,low,close,volume,oi,instrument_key',
  ];
  for (const session of dataset.sessions) {
    for (const side of ['ce', 'pe'] as const) {
      const option = side.toUpperCase();
      for (const bar of session[side].bars) {
        lines.push(
          [
            session.date,
            session.expiry,
            session.strike,
            option,
            bar.time,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
            bar.oi,
            session[side].instrumentKey,
          ].join(',')
        );
      }
    }
  }
  const outputPath = path.join(
    os.homedir(),
    'Downloads',
    `NSE_NIFTY_ATM_CE_PE_1m_${FROM_DATE}_to_${TO_DATE}.csv`
  );
  await fs.writeFile(outputPath, `${lines.join('\r\n')}\r\n`, 'utf8');
  return outputPath;
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

    const expiryUrl = new URL(
      'https://api.upstox.com/v2/expired-instruments/expiries'
    );
    expiryUrl.searchParams.set('instrument_key', NIFTY_KEY);
    const expiryJson = await upstoxJson<{ data?: string[] }>(
      expiryUrl.toString(),
      token
    );
    const expiredExpiries = (expiryJson.data || []).sort();
    const expiredSet = new Set(expiredExpiries);
    const activeContracts = await fetchActiveContracts(token);
    const activeExpiries = [
      ...new Set(
        activeContracts
          .map((contract) => String(contract.expiry || '').slice(0, 10))
          .filter((expiry) => /^\d{4}-\d{2}-\d{2}$/.test(expiry))
      ),
    ];
    const allExpiries = [...new Set([...expiredExpiries, ...activeExpiries])].sort();
    const niftySessions = await loadNiftySessions();

    let dataset: StoredDataset = {
      version: 1,
      generatedAt: new Date().toISOString(),
      rule: {
        underlying: NIFTY_KEY,
        fromDate: FROM_DATE,
        toDate: TO_DATE,
        atm: 'Nearest listed strike to the completed 09:15 Nifty candle close; pair locked for the day',
        expiry: 'Nearest listed expiry; strictly next expiry when session date equals expiry',
        session: 'Option evaluation begins 09:16 and ends 15:13; no overnight carry',
      },
      sessions: [],
      errors: [],
    };
    try {
      const existing = JSON.parse(await fs.readFile(DATA_PATH, 'utf8')) as StoredDataset;
      if (existing.version === 1) dataset = existing;
    } catch {
      // First collection run.
    }
    const completed = new Set(dataset.sessions.map((session) => session.date));
    const contractsByExpiry = new Map<string, Contract[]>();
    const dates = [...niftySessions.keys()].sort();

    for (let index = 0; index < dates.length; index++) {
      const date = dates[index];
      if (completed.has(date)) continue;
      try {
        const niftyBars = niftySessions.get(date) || [];
        const lockBar = niftyBars.find((bar) => bar.time === '09:15');
        if (!lockBar || !Number.isFinite(lockBar.close)) {
          throw new Error('Missing completed 09:15 Nifty candle');
        }
        const expiryDayRollover = allExpiries.includes(date);
        const expiry = allExpiries.find((value) =>
          expiryDayRollover ? value > date : value >= date
        );
        if (!expiry) throw new Error('No listed expiry found');

        let contracts = contractsByExpiry.get(expiry);
        if (!contracts) {
          contracts = expiredSet.has(expiry)
            ? await fetchExpiredContracts(token, expiry)
            : activeContracts.filter(
                (contract) => String(contract.expiry).slice(0, 10) === expiry
              );
          contractsByExpiry.set(expiry, contracts);
          await pause(120);
        }
        const pair = pickPair(contracts, lockBar.close);
        const fetchBars = expiredSet.has(expiry)
          ? fetchExpiredBars
          : fetchActiveBars;
        const ceBars = await fetchBars(
          token,
          String(pair.ce.instrument_key),
          date
        );
        await pause(120);
        const peBars = await fetchBars(
          token,
          String(pair.pe.instrument_key),
          date
        );
        await pause(120);
        if (!ceBars.length || !peBars.length) {
          throw new Error(
            `Empty option history: CE ${ceBars.length}, PE ${peBars.length}`
          );
        }

        dataset.sessions.push({
          date,
          spotAtLock: lockBar.close,
          lockCandle: '09:15',
          optionEvaluationFrom: '09:16',
          expiry,
          expiryDayRollover,
          strike: pair.strike,
          ce: {
            instrumentKey: String(pair.ce.instrument_key),
            tradingSymbol: String(pair.ce.trading_symbol || ''),
            bars: ceBars.filter((bar) => bar.time >= '09:16'),
          },
          pe: {
            instrumentKey: String(pair.pe.instrument_key),
            tradingSymbol: String(pair.pe.trading_symbol || ''),
            bars: peBars.filter((bar) => bar.time >= '09:16'),
          },
        });
        dataset.errors = dataset.errors.filter((error) => error.date !== date);
      } catch (error) {
        dataset.errors = [
          ...dataset.errors.filter((entry) => entry.date !== date),
          {
            date,
            error: error instanceof Error ? error.message : String(error),
          },
        ];
      }
      dataset.generatedAt = new Date().toISOString();
      if ((index + 1) % 5 === 0) await saveDataset(dataset);
    }

    dataset.sessions.sort((a, b) => a.date.localeCompare(b.date));
    await saveDataset(dataset);
    const outputPath = await writeCsv(dataset);
    const optionBars = dataset.sessions.reduce(
      (sum, session) => sum + session.ce.bars.length + session.pe.bars.length,
      0
    );
    const coverageIssues = dataset.sessions.flatMap((session) => {
      const ceComplete =
        session.ce.bars.length === 358 &&
        session.ce.bars[0]?.time === '09:16' &&
        session.ce.bars.at(-1)?.time === '15:13';
      const peComplete =
        session.pe.bars.length === 358 &&
        session.pe.bars[0]?.time === '09:16' &&
        session.pe.bars.at(-1)?.time === '15:13';
      return ceComplete && peComplete
        ? []
        : [
            {
              date: session.date,
              ceBars: session.ce.bars.length,
              ceFirst: session.ce.bars[0]?.time || null,
              ceLast: session.ce.bars.at(-1)?.time || null,
              peBars: session.pe.bars.length,
              peFirst: session.pe.bars[0]?.time || null,
              peLast: session.pe.bars.at(-1)?.time || null,
            },
          ];
    });
    return NextResponse.json({
      ok: dataset.sessions.length === dates.length && coverageIssues.length === 0,
      outputPath,
      dataPath: DATA_PATH,
      requestedSessions: dates.length,
      completedSessions: dataset.sessions.length,
      failedSessions: dataset.errors.length,
      optionBars,
      coverageIssues,
      firstDate: dataset.sessions[0]?.date || null,
      lastDate: dataset.sessions.at(-1)?.date || null,
      expiryDayRollovers: dataset.sessions.filter(
        (session) => session.expiryDayRollover
      ).length,
      errors: dataset.errors,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
