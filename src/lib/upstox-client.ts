/** Client helper — Upstox access token stored after OAuth callback */
export function getUpstoxAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('trademindpro_upstox_token_v1');
  } catch {
    return null;
  }
}

export function isUpstoxConnected(): boolean {
  return Boolean(getUpstoxAccessToken());
}
