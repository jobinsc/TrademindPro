import { NextRequest, NextResponse } from 'next/server';
import { GOLD_STRATEGIES, isGoldStrategyId } from '@/lib/gold-pulse/strategies';
import { setGoldPaperStrategy } from '@/lib/gold-pulse/session-engine';
import { goldSessionDate, loadGoldSession } from '@/lib/gold-pulse/session-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionDate = goldSessionDate();
  const session = await loadGoldSession(sessionDate);
  return NextResponse.json({
    ok: true,
    strategies: Object.values(GOLD_STRATEGIES).map((s) => ({
      id: s.id,
      title: s.title,
      badge: s.badge,
      description: s.description,
    })),
    paperStrategyId: session?.paperStrategyId ?? null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      strategyId?: string;
    };
    const action = body.action || 'enable';

    if (action === 'disable') {
      const session = await setGoldPaperStrategy(null);
      return NextResponse.json({ ok: true, paperStrategyId: null, session });
    }

    if (action === 'enable') {
      const id = body.strategyId;
      if (!id || !isGoldStrategyId(id)) {
        return NextResponse.json({ ok: false, error: 'Invalid strategyId' }, { status: 400 });
      }
      const session = await setGoldPaperStrategy(id);
      return NextResponse.json({ ok: true, paperStrategyId: id, session });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Strategy update failed' },
      { status: 500 }
    );
  }
}
