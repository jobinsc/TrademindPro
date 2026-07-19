import { NextResponse } from 'next/server';
import { fetchYahooQuote } from '@/lib/yahoo-nifty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type HealthIssue = {
  id: string;
  severity: 'error' | 'warn';
  message: string;
};

/** Server health probe — no vendor/source names in messages */
export async function GET() {
  const issues: HealthIssue[] = [];

  try {
    const nifty = await fetchYahooQuote('^NSEI', 'Nifty');
    if (!nifty.ok || !(nifty.spot > 0)) {
      issues.push({
        id: 'market',
        severity: 'error',
        message: 'Live market prices are not updating right now.',
      });
    }
  } catch {
    issues.push({
      id: 'market',
      severity: 'error',
      message: 'Live market prices are not updating right now.',
    });
  }

  try {
    const spx = await fetchYahooQuote('^GSPC', 'SPX');
    if (!spx.ok || !(spx.spot > 0)) {
      issues.push({
        id: 'world',
        severity: 'warn',
        message: 'World market board failed to refresh.',
      });
    }
  } catch {
    issues.push({
      id: 'world',
      severity: 'warn',
      message: 'World market board failed to refresh.',
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');

  return NextResponse.json({
    ok: !hasError,
    status: hasError ? 'degraded' : 'up',
    label: hasError
      ? 'Issues detected'
      : hasWarn
        ? 'Up and running (minor notices)'
        : 'Up and running',
    issues,
    checkedAt: new Date().toISOString(),
  });
}
