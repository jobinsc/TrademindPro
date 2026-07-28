import { NextRequest, NextResponse } from 'next/server';
import { runNexusBArchiveReport } from '@/lib/nexus-pulse-b/archive-backtest';
import { runNexusBRealOptionStudy } from '@/lib/nexus-pulse-b/real-option-study';
import type { NexusBLaneId } from '@/lib/nexus-pulse-b/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Reconnect Upstox' }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
      activeLanes?: NexusBLaneId[];
      mode?: 'real_options' | 'archive';
    };
    const fromDate = String(body.fromDate || '').slice(0, 10);
    const toDate = String(body.toDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json({ ok: false, error: 'Choose valid from/to dates' }, { status: 400 });
    }
    const activeLanes: NexusBLaneId[] =
      Array.isArray(body.activeLanes) && body.activeLanes.length
        ? body.activeLanes.filter(
            (x): x is NexusBLaneId => x === 'current_bans' || x === 'morning_open_stop_15'
          )
        : ['morning_open_stop_15'];
    const mode = body.mode === 'archive' ? 'archive' : 'real_options';
    const run =
      mode === 'archive'
        ? await runNexusBArchiveReport({ fromDate, toDate, activeLanes })
        : await runNexusBRealOptionStudy({ accessToken: token, fromDate, toDate, activeLanes });
    return NextResponse.json({ ok: true, run, mode });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}
