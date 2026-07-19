/** Client helper — Upstox tokens stored after OAuth callback */

const ACCESS_KEY = 'trademindpro_upstox_token_v1';
const EXTENDED_KEY = 'trademindpro_upstox_extended_v1';
const CONNECTED_AT_KEY = 'trademindpro_upstox_connected_at_v1';

/** Upstox access tokens expire every day at ~3:30 AM IST. */
export function isUpstoxAccessTokenExpired(connectedAtIso?: string | null): boolean {
  if (!connectedAtIso) return true;
  const connectedAt = new Date(connectedAtIso);
  if (Number.isNaN(connectedAt.getTime())) return true;

  // Current time in IST
  const now = new Date();
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(istMs);

  // Last 3:30 AM IST boundary
  const expiry = new Date(ist);
  expiry.setUTCHours(3, 30, 0, 0);
  if (ist.getUTCHours() < 3 || (ist.getUTCHours() === 3 && ist.getUTCMinutes() < 30)) {
    expiry.setUTCDate(expiry.getUTCDate() - 1);
  }

  // Convert expiry IST wall-clock back roughly: connected must be after last 3:30 IST
  const expiryUtc = new Date(expiry.getTime() - (5 * 60 + 30) * 60 * 1000);
  return connectedAt.getTime() < expiryUtc.getTime();
}

export function getUpstoxAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const connectedAt = localStorage.getItem(CONNECTED_AT_KEY);
    const access = localStorage.getItem(ACCESS_KEY);
    if (access && !isUpstoxAccessTokenExpired(connectedAt)) return access;
    // Fall back to extended token for read-only market data after daily access expiry
    return localStorage.getItem(EXTENDED_KEY) || access;
  } catch {
    return null;
  }
}

export function isUpstoxConnected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(ACCESS_KEY) || localStorage.getItem(EXTENDED_KEY));
  } catch {
    return false;
  }
}

export function upstoxNeedsDailyRelogin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const access = localStorage.getItem(ACCESS_KEY);
    if (!access) return true;
    return isUpstoxAccessTokenExpired(localStorage.getItem(CONNECTED_AT_KEY));
  } catch {
    return true;
  }
}
