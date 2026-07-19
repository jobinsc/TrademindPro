import { NextResponse } from 'next/server';
import { upstoxConfigured, upstoxLoginUrl } from '@/lib/upstox';

export const runtime = 'nodejs';

export async function GET() {
  const configured = upstoxConfigured();
  const loginUrl = upstoxLoginUrl();
  return NextResponse.json({
    configured,
    loginUrl,
    redirectUri: process.env.UPSTOX_REDIRECT_URI?.trim() || null,
  });
}
