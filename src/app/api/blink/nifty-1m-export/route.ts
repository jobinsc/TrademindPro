import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchUpstoxIntradayCandles,
  fetchUpstoxNifty1mRange,
} from '@/lib/upstox-historical';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SESSION_OPEN = 9 * 60 + 15;
const LAST_CANDLE = 15 * 60 + 13;
const EXPECTED_CANDLES = LAST_CANDLE - SESSION_OPEN + 1;

function istParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 330 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first, then retry the export.' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
    };
    const fromDate = (body.fromDate || '2026-02-26').slice(0, 10);
    const toDate = (body.toDate || '2026-07-21').slice(0, 10);
    const requestedDays =
      (new Date(`${toDate}T00:00:00Z`).getTime() -
        new Date(`${fromDate}T00:00:00Z`).getTime()) /
      86_400_000;
    if (
      !Number.isFinite(requestedDays) ||
      requestedDays < 0 ||
      requestedDays > 190
    ) {
      return NextResponse.json(
        { ok: false, error: 'Date range must be between 1 and 190 calendar days.' },
        { status: 400 }
      );
    }

    const historical = await fetchUpstoxNifty1mRange({
      accessToken,
      fromDate,
      toDate,
    });
    if (!historical.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: historical.error || 'Upstox 1-minute download failed.',
          receivedCandles: historical.candles.length,
          completedChunks: historical.chunks,
        },
        { status: 502 }
      );
    }

    const allCandles = [...historical.candles];
    const currentIstDate = new Date(Date.now() + 330 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let intradayIncluded = false;
    if (toDate === currentIstDate) {
      const intraday = await fetchUpstoxIntradayCandles({
        accessToken,
        interval: 1,
      });
      if (!intraday.ok) {
        return NextResponse.json(
          {
            ok: false,
            error:
              intraday.error ||
              `Historical candles were downloaded, but ${toDate} intraday candles failed.`,
            historicalCandles: historical.candles.length,
          },
          { status: 502 }
        );
      }
      allCandles.push(...intraday.candles);
      intradayIncluded = true;
    }

    const rows = allCandles
      .map((candle) => ({ candle, ist: istParts(candle.t) }))
      .filter(
        ({ ist }) =>
          ist.date >= fromDate &&
          ist.date <= toDate &&
          ist.minute >= SESSION_OPEN &&
          ist.minute <= LAST_CANDLE
      )
      .sort((a, b) => a.candle.t.localeCompare(b.candle.t));
    const unique = [
      ...new Map(rows.map((row) => [`${row.ist.date} ${row.ist.time}`, row])).values(),
    ];

    const grouped = new Map<string, typeof unique>();
    for (const row of unique) {
      const bars = grouped.get(row.ist.date) || [];
      bars.push(row);
      grouped.set(row.ist.date, bars);
    }
    const incompleteSessions = [...grouped].flatMap(([date, bars]) =>
      bars.length === EXPECTED_CANDLES &&
      bars[0]?.ist.minute === SESSION_OPEN &&
      bars.at(-1)?.ist.minute === LAST_CANDLE
        ? []
        : [
            {
              date,
              candles: bars.length,
              expectedCandles: EXPECTED_CANDLES,
              firstAt: bars[0]?.ist.time || null,
              lastAt: bars.at(-1)?.ist.time || null,
            },
          ]
    );

    const csv = [
      'time,open,high,low,close',
      ...unique.map(
        ({ candle, ist }) =>
          `${ist.date} ${ist.time},${candle.open},${candle.high},${candle.low},${candle.close}`
      ),
      '',
    ].join('\r\n');
    const filename = `NSE_NIFTY_1m_${fromDate}_to_${toDate}.csv`;
    const outputPath = path.join(os.homedir(), 'Downloads', filename);
    await fs.writeFile(outputPath, csv, 'utf8');

    const dates = [...grouped.keys()].sort();
    return NextResponse.json({
      ok: true,
      outputPath,
      source: 'Upstox Historical Candle API V3',
      instrument: 'NSE_INDEX|Nifty 50',
      fromDate: dates[0] || fromDate,
      toDate: dates.at(-1) || toDate,
      session: '09:15–15:13 candle timestamps; stop at 15:14 IST',
      candles: unique.length,
      sessions: dates.length,
      completeSessions: dates.length - incompleteSessions.length,
      incompleteSessions,
      chunks: historical.chunks,
      intradayIncluded,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
