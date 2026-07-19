import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthUser } from '@/lib/auth';

const COOKIE = 'trademindpro_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 60; // 60 days

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    'trademindpro-dev-session'
  );
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const s = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(s, 'base64');
}

export type SessionPayload = AuthUser & { exp: number };

export function signSession(user: AuthUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', sessionSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): AuthUser | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(createHmac('sha256', sessionSecret()).update(body).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as SessionPayload;
    if (!payload?.id || !payload.email || !payload.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (payload.blocked) return null;
    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role === 'admin' ? 'admin' : 'user',
      blocked: Boolean(payload.blocked),
      createdAt: payload.createdAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export { COOKIE as SESSION_COOKIE_NAME, MAX_AGE_SEC };
