import { NextRequest, NextResponse } from 'next/server';
import { readPinaxJournal } from '@/lib/pinax-forge/journal-store';
import { istDate } from '@/lib/pinax-forge/ist';
import type { PinaxJournalResponse } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionDate = req.nextUrl.searchParams.get('date') || istDate();
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get('limit') || 200));

  try {
    const entries = await readPinaxJournal(sessionDate, limit);
    return NextResponse.json({
      ok: true,
      sessionDate,
      entries,
    } satisfies PinaxJournalResponse);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Journal read failed',
      } satisfies PinaxJournalResponse,
      { status: 500 }
    );
  }
}
