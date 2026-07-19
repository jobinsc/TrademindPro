import { NextRequest, NextResponse } from 'next/server';
import { exchangeUpstoxCode } from '@/lib/upstox';

export const runtime = 'nodejs';

/**
 * Upstox redirects here with ?code=...
 * We exchange the code, then send the user back to Terminal with a one-time token in the hash
 * (browser-only storage — replace with secure server session later).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const err = req.nextUrl.searchParams.get('error');
  const origin = req.nextUrl.origin;

  if (err) {
    return NextResponse.redirect(
      `${origin}/app/terminal?upstox=error&message=${encodeURIComponent(err)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${origin}/app/terminal?upstox=error&message=${encodeURIComponent('No auth code')}`
    );
  }

  try {
    const token = await exchangeUpstoxCode(code);
    if (!token.access_token) {
      return NextResponse.redirect(
        `${origin}/app/terminal?upstox=error&message=${encodeURIComponent('No access token')}`
      );
    }
    // Pass token via URL fragment so it is not sent to server logs on next nav
    const html = `<!DOCTYPE html><html><body><script>
      try {
        localStorage.setItem('trademindpro_upstox_token_v1', ${JSON.stringify(token.access_token)});
        localStorage.setItem('trademindpro_upstox_connected_at_v1', ${JSON.stringify(new Date().toISOString())});
        ${
          token.extended_token
            ? `localStorage.setItem('trademindpro_upstox_extended_v1', ${JSON.stringify(token.extended_token)});`
            : ''
        }
      } catch (e) {}
      location.replace('/app/terminal?upstox=connected');
    </script><p>Connecting Upstox…</p></body></html>`;
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Token exchange failed';
    return NextResponse.redirect(
      `${origin}/app/terminal?upstox=error&message=${encodeURIComponent(message)}`
    );
  }
}
