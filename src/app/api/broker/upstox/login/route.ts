import { NextRequest, NextResponse } from 'next/server';
import { upstoxLoginUrl } from '@/lib/upstox';

export const runtime = 'nodejs';

/** Redirect user to Upstox login */
export async function GET(req: NextRequest) {
  const url = upstoxLoginUrl();
  if (!url) {
    return NextResponse.json(
      {
        error:
          'Add UPSTOX_API_KEY, UPSTOX_API_SECRET, and UPSTOX_REDIRECT_URI to .env.local',
      },
      { status: 400 }
    );
  }
  return NextResponse.redirect(url);
}
