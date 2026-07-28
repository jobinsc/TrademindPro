import { NextRequest, NextResponse } from 'next/server';
import {
  isValidGoldReportKey,
  listGoldStudyReports,
  loadGoldEndStudyReport,
  loadGoldStudyReport,
  removeGoldStudyReport,
  runGoldEndStudyReport,
  runGoldRangeStudyReport,
  runGoldStrategyDetailedReport,
} from '@/lib/gold-pulse/study-report';
import { isValidGoldStudyDay } from '@/lib/gold-pulse/backtest';
import { isGoldStrategyId } from '@/lib/gold-pulse/strategies';
import { goldSessionDate } from '@/lib/gold-pulse/session-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const end = url.searchParams.get('end');
  if (end === '1' || end === 'true') {
    const report = await loadGoldEndStudyReport();
    if (!report) {
      return NextResponse.json({ ok: false, error: 'End study report not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, report });
  }
  const date = url.searchParams.get('date');
  if (date) {
    if (!isValidGoldReportKey(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid report id' }, { status: 400 });
    }
    const report = await loadGoldStudyReport(date);
    if (!report) {
      return NextResponse.json({ ok: false, error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, report });
  }
  const reports = await listGoldStudyReports();
  return NextResponse.json({ ok: true, reports });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      date?: string;
      fromDate?: string;
      toDate?: string;
      strategyId?: string;
    };
    const action = body.action || 'generate';

    if (action === 'remove' || action === 'delete') {
      const date = String(body.date || '');
      if (!isValidGoldReportKey(date)) {
        return NextResponse.json({ ok: false, error: 'Invalid report id' }, { status: 400 });
      }
      await removeGoldStudyReport(date);
      return NextResponse.json({ ok: true, removed: date });
    }

    if (action === 'generate_end') {
      const strategyId = isGoldStrategyId(String(body.strategyId || ''))
        ? (body.strategyId as 'v12_max' | 'sweep_peak')
        : 'v12_max';
      const report = await runGoldEndStudyReport(strategyId);
      return NextResponse.json({ ok: true, report });
    }

    if (action === 'generate_detailed') {
      const strategyId = body.strategyId;
      if (!strategyId || !isGoldStrategyId(strategyId)) {
        return NextResponse.json({ ok: false, error: 'Invalid strategyId' }, { status: 400 });
      }
      const fromDate = String(body.fromDate || body.date || goldSessionDate()).slice(0, 10);
      const toDate = String(body.toDate || body.date || fromDate).slice(0, 10);
      if (!isValidGoldStudyDay(fromDate) || !isValidGoldStudyDay(toDate)) {
        return NextResponse.json({ ok: false, error: 'Invalid from/to date' }, { status: 400 });
      }
      const report = await runGoldStrategyDetailedReport(strategyId, fromDate, toDate);
      return NextResponse.json({ ok: true, report });
    }

    if (action === 'generate' || action === 'generate_range') {
      const strategyId = isGoldStrategyId(String(body.strategyId || ''))
        ? (body.strategyId as 'v12_max' | 'sweep_peak')
        : 'v12_max';
      const fromDate = String(body.fromDate || body.date || goldSessionDate()).slice(0, 10);
      const toDate = String(body.toDate || body.date || fromDate).slice(0, 10);
      if (!isValidGoldStudyDay(fromDate) || !isValidGoldStudyDay(toDate)) {
        return NextResponse.json({ ok: false, error: 'Invalid from/to date (YYYY-MM-DD)' }, { status: 400 });
      }
      if (fromDate > toDate) {
        return NextResponse.json(
          { ok: false, error: 'Start date must be on or before end date' },
          { status: 400 }
        );
      }
      const report = await runGoldRangeStudyReport(fromDate, toDate, strategyId);
      return NextResponse.json({ ok: true, report });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Study report failed' },
      { status: 500 }
    );
  }
}
