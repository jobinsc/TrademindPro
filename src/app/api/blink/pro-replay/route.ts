import { NextRequest, NextResponse } from 'next/server';
import type { Candle } from '@/lib/nejoic';
import { getBearerToken } from '@/lib/upstox-market';
import {
  fetchUpstoxNifty1mRange,
  sixMonthOneMinuteRange,
} from '@/lib/upstox-historical';
import {
  buildPriorAuctionLevels,
  buildProReplayIndex,
  groupNiftyOneMinuteSessions,
  replayProSession,
} from '@/lib/blink-pro-narrative';
import {
  loadProReplay,
  replayPublicIndex,
  saveProReplay,
  summarizeReplayIndex,
} from '@/lib/blink-pro-replay-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const replay = await loadProReplay();
    if (!replay) {
      return NextResponse.json({
        ok: true,
        replay: null,
        defaultRange: sixMonthOneMinuteRange(),
      });
    }

    const date = req.nextUrl.searchParams.get('date')?.slice(0, 10);
    if (!date) {
      return NextResponse.json({
        ok: true,
        replay: replayPublicIndex(replay),
      });
    }

    const grouped = groupNiftyOneMinuteSessions(replay.bars);
    const dates = [...grouped.keys()].sort();
    const selectedIndex = dates.indexOf(date);
    const bars = grouped.get(date);
    if (!bars?.length || selectedIndex < 0) {
      return NextResponse.json(
        { ok: false, error: `No persisted Nifty 1m session for ${date}` },
        { status: 404 }
      );
    }
    const previousSessions = dates
      .slice(Math.max(0, selectedIndex - 5), selectedIndex)
      .map((key) => grouped.get(key)!)
      .filter(Boolean);
    const session = replayProSession(
      date,
      bars,
      buildPriorAuctionLevels(previousSessions)
    );
    return NextResponse.json({
      ok: true,
      session,
      generatedFromVisiblePrefixesOnly: true,
      optionModel:
        'ATM option movement is simulated from Nifty MFE using delta≈0.50 plus a small convexity term; it is not historical option LTP.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load pro replay';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          code: 'NO_TOKEN',
          error: 'Connect Upstox first — six-month 1m collection needs your token.',
        },
        { status: 401 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
    };
    const fallback = sixMonthOneMinuteRange();
    const fromDate = (body.fromDate || fallback.fromDate).slice(0, 10);
    const toDate = (body.toDate || fallback.toDate).slice(0, 10);
    if (fromDate > toDate) {
      return NextResponse.json(
        { ok: false, error: 'fromDate must be before toDate' },
        { status: 400 }
      );
    }
    const requestedDays =
      (new Date(`${toDate}T00:00:00Z`).getTime() -
        new Date(`${fromDate}T00:00:00Z`).getTime()) /
      86_400_000;
    if (requestedDays > 190) {
      return NextResponse.json(
        { ok: false, error: 'This lab accepts at most 190 calendar days per collection.' },
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
          error: historical.error || 'Upstox Nifty 1m collection failed',
          bars: historical.candles.length,
          chunks: historical.chunks,
        },
        { status: 502 }
      );
    }
    const bars: Candle[] = historical.candles.map((bar) => ({
      t: bar.t,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    const sessions = buildProReplayIndex(bars);
    const replay = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      fromDate,
      toDate,
      source: historical.source,
      bars,
      sessions,
      summary: summarizeReplayIndex(bars, sessions),
    };
    await saveProReplay(replay);
    return NextResponse.json({
      ok: true,
      replay: replayPublicIndex(replay),
      chunks: historical.chunks,
      noLookahead: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Six-month pro replay failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
