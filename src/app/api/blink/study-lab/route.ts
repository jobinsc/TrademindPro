import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import {
  defaultJuneJulyStudyRange,
  fetchUpstoxNifty3mRange,
  priorValidationYearRange,
  yearBeforeJuneStudyRange,
} from '@/lib/upstox-historical';
import { buildNiftyStudyLabReport } from '@/lib/blink-nifty-study-lab';
import {
  loadBlinkStudyMemory,
  memoryToReport,
  mergeStudyReportIntoMemory,
} from '@/lib/blink-study-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Year collect = many Upstox monthly chunks */
export const maxDuration = 300;

/**
 * GET /api/blink/study-lab — load agent memory (no Upstox call)
 */
export async function GET() {
  try {
    const mem = await loadBlinkStudyMemory();
    const report = memoryToReport(mem);
    return NextResponse.json({
      ok: true,
      memory: mem,
      report,
      dayCount: mem.summary.dayCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load memory';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/blink/study-lab
 * Collect Upstox Nifty 3m → study each day → store in agent memory.
 * Body: { fromDate?, toDate?, preset?: 'june_july' | 'year_before_june', persist?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Connect Upstox first — Study Lab needs your live Upstox token.',
          code: 'NO_TOKEN',
        },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string;
      toDate?: string;
      preset?: 'june_july' | 'year_before_june';
      persist?: boolean;
      /** Wipe prior memory and rewrite with deep study + opportunity grades */
      reanalyse?: boolean;
      /** Alias: same as reanalyse — fetch year, hunt ops, grade WIN/LOSS */
      grade?: boolean;
      /** Grade the untouched prior year without overwriting study memory */
      validation?: boolean;
    };

    const juneJuly = defaultJuneJulyStudyRange();
    const yearBefore = yearBeforeJuneStudyRange();
    const validationYear = priorValidationYearRange();
    const doFullRefresh = Boolean(body.reanalyse || body.grade);
    let fromDate: string;
    let toDate: string;
    let label: string;

    if (body.validation) {
      fromDate = validationYear.fromDate;
      toDate = validationYear.toDate;
      label = `Out-of-sample grade · ${validationYear.label}`;
    } else if (body.preset === 'year_before_june' || doFullRefresh) {
      fromDate = yearBefore.fromDate;
      toDate = yearBefore.toDate;
      label = body.grade
        ? `Grade opportunities · ${yearBefore.label}`
        : yearBefore.label;
    } else if (body.preset === 'june_july' || (!body.fromDate && !body.toDate)) {
      fromDate = juneJuly.fromDate;
      toDate = juneJuly.toDate;
      label = juneJuly.label;
    } else {
      fromDate = (body.fromDate || juneJuly.fromDate).slice(0, 10);
      toDate = (body.toDate || juneJuly.toDate).slice(0, 10);
      label = `${fromDate} → ${toDate}`;
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { ok: false, error: 'fromDate must be ≤ toDate' },
        { status: 400 }
      );
    }

    const hist = await fetchUpstoxNifty3mRange({
      accessToken: token,
      fromDate,
      toDate,
    });

    if (!hist.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: hist.error || 'Failed to fetch Upstox Nifty 3m candles',
          bars: hist.candles.length,
          chunks: hist.chunks,
        },
        { status: 502 }
      );
    }

    const report = buildNiftyStudyLabReport(
      hist.candles,
      fromDate,
      toDate,
      hist.source
    );

    // Validation must stay untouched/out-of-sample; never merge it into the
    // training memory that produced the current rules.
    const persist = body.validation ? false : body.persist !== false;
    let memory = null;
    if (persist) {
      memory = await mergeStudyReportIntoMemory(report, hist.candles.length, {
        replaceAll: doFullRefresh || body.preset === 'year_before_june',
      });
    }

    const g = report.gradeSummary;

    return NextResponse.json({
      ok: true,
      label,
      fromDate,
      toDate,
      bars: hist.candles.length,
      chunks: hist.chunks,
      source: hist.source,
      report,
      memorySummary: memory?.summary ?? null,
      gradeSummary: g,
      daysStored: memory?.summary.dayCount ?? 0,
      totalOpportunities: memory?.summary.totalOpportunities ?? report.summary.totalOpportunities,
      daysWith2PlusOps: memory?.summary.daysWith2PlusOps ?? report.summary.daysWith2PlusOps,
      persisted: persist,
      reanalysed: doFullRefresh,
      graded: Boolean(g),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Study Lab failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
