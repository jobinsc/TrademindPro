import { NextResponse } from 'next/server';
import { fetchYahooQuote } from '@/lib/yahoo-nifty';
import { isCloudBackendConfigured } from '@/lib/supabase/server';

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
  const cloudAuth =
    process.env.NEXT_PUBLIC_AUTH_MODE?.trim().toLowerCase() === 'cloud' &&
    isCloudBackendConfigured();

  if (!cloudAuth) {
    issues.push({
      id: 'auth',
      severity: 'warn',
      message: 'Shared cloud accounts are not enabled — each browser keeps its own users.',
    });
  }

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
    cloudAuth,
    issues,
    checkedAt: new Date().toISOString(),
  });
}
