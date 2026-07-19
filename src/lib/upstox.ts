/** Upstox API helpers — tokens stay server-side via env / session later */

export const UPSTOX_AUTH_URL = 'https://api.upstox.com/v2/login/authorization/dialog';
export const UPSTOX_TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token';
export const UPSTOX_API_BASE = 'https://api.upstox.com/v2';

export function upstoxConfigured(): boolean {
  return Boolean(
    process.env.UPSTOX_API_KEY?.trim() && process.env.UPSTOX_API_SECRET?.trim()
  );
}

export function upstoxLoginUrl(state = 'trademind'): string | null {
  const key = process.env.UPSTOX_API_KEY?.trim();
  const redirect = process.env.UPSTOX_REDIRECT_URI?.trim();
  if (!key || !redirect) return null;
  const params = new URLSearchParams({
    client_id: key,
    redirect_uri: redirect,
    response_type: 'code',
    state,
  });
  return `${UPSTOX_AUTH_URL}?${params.toString()}`;
}

export type UpstoxTokenResponse = {
  access_token?: string;
  extended_token?: string;
  email?: string;
};

export async function exchangeUpstoxCode(code: string): Promise<UpstoxTokenResponse> {
  const key = process.env.UPSTOX_API_KEY?.trim();
  const secret = process.env.UPSTOX_API_SECRET?.trim();
  const redirect = process.env.UPSTOX_REDIRECT_URI?.trim();
  if (!key || !secret || !redirect) {
    throw new Error('Upstox env not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: key,
    client_secret: secret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });

  const res = await fetch(UPSTOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstox token error ${res.status}: ${text}`);
  }

  return (await res.json()) as UpstoxTokenResponse;
}
