import { NextRequest, NextResponse } from 'next/server';
import { runNexusArchiveReport } from '@/lib/nexus-pulse/archive-backtest';
import { runNexusRealOptionStudy } from '@/lib/nexus-pulse/real-option-study';
import type { NexusLaneId } from '@/lib/nexus-pulse/rules';

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
      activeLanes?: NexusLaneId[];
      mode?: 'real_options' | 'archive';
    };
    const fromDate = String(body.fromDate || '').slice(0, 10);
    const toDate = String(body.toDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json({ ok: false, error: 'Choose valid from/to dates' }, { status: 400 });
    }
    const activeLanes: NexusLaneId[] = Array.isArray(body.activeLanes) && body.activeLanes.length
      ? body.activeLanes.filter((x): x is NexusLaneId => x === 'current_bans' || x === 'morning_open_stop_15')
      : ['morning_open_stop_15'];
    const mode = body.mode === 'archive' ? 'archive' : 'real_options';
    const run =
      mode === 'archive'
        ? await runNexusArchiveReport({ fromDate, toDate, activeLanes })
        : await runNexusRealOptionStudy({ accessToken: token, fromDate, toDate, activeLanes });
    return NextResponse.json({ ok: true, run, mode });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}
