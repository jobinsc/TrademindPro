import { NextRequest, NextResponse } from 'next/server';
import { buildPinaxEodReview } from '@/lib/pinax-forge/eod-review';
import { istDate } from '@/lib/pinax-forge/ist';
import type { PinaxReviewResponse } from '@/lib/pinax-forge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** End-of-day review — markdown or JSON export. */
export async function GET(req: NextRequest) {
  const sessionDate = req.nextUrl.searchParams.get('date') || istDate();
  const format = req.nextUrl.searchParams.get('format') || 'json';

  try {
    const review = await buildPinaxEodReview(sessionDate);

    if (format === 'markdown' || format === 'md') {
      return new NextResponse(review.markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="pinax-forge-review-${sessionDate}.md"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      review,
    } satisfies PinaxReviewResponse);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Review export failed',
      } satisfies PinaxReviewResponse,
      { status: 500 }
    );
  }
}
