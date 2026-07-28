/**
 * Local TradePinax server helpers — shared by PinaxForge, ATM Lab, etc.
 */

export type LocalServerState = 'online' | 'offline' | 'wrong-host';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalAppHost(): boolean {
  if (typeof window === 'undefined') return true;
  return LOCAL_HOSTS.has(window.location.hostname);
}

export function localAppOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost:3000';
  return window.location.origin;
}

export function pinaxForgeLocalUrl(): string {
  return 'http://localhost:3000/app/pinax-forge';
}

/** Fast ping — must stay lightweight (live.mjs watchdog uses /api/live-ping too). */
export async function pingLocalServer(timeoutMs = 5000): Promise<boolean> {
  if (!isLocalAppHost()) return false;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/live-ping', {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

export function offlineUserMessage(): string {
  if (!isLocalAppHost()) {
    return `Open ${pinaxForgeLocalUrl()} on your PC (not Vercel). Then run npm run live once in Cursor Terminal and leave that tab open.`;
  }
  return 'Local server not responding — auto-retrying. If this persists: Cursor Terminal → npm run live → leave tab open.';
}

export function offlineUserMessage(): string {
  if (!isLocalAppHost()) {
    return `Open ${pinaxForgeLocalUrl()} on your PC (not Vercel). Then run npm run live once in Cursor Terminal and leave that tab open.`;
  }
  return 'Local server not responding — auto-retrying. If this persists: Cursor Terminal → npm run live → leave tab open.';
}

/** Generic API POST — works on Vercel and localhost (NexusPulse, GoldPulse, etc.). */
export function appApiErrorMessage(): string {
  if (isLocalAppHost()) {
    return 'Server not responding — if dev stopped, run npm run live in Cursor and leave that terminal open.';
  }
  return 'Request failed — check connection. Nexus: connect Upstox in Settings, then tap Start again.';
}

export async function fetchAppPost<T>(opts: {
  path: string;
  token?: string | null;
  body?: object;
  retries?: number;
}): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && isLocalAppHost()) {
      const ok = await pingLocalServer(4000);
      if (!ok) {
        lastErr = new Error(appApiErrorMessage());
        await new Promise((r) => window.setTimeout(r, Math.min(8000, 1500 * attempt)));
        continue;
      }
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

      const res = await fetch(opts.path, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });

      const data = (await res.json()) as T & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      const network =
        e instanceof TypeError ||
        msg.includes('fetch') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('aborted');
      lastErr = new Error(network ? appApiErrorMessage() : msg);
      if (!network || attempt >= retries) break;
      await new Promise((r) => window.setTimeout(r, Math.min(8000, 1500 * (attempt + 1))));
    }
  }

  throw lastErr ?? new Error(appApiErrorMessage());
}

export async function fetchLocalPost<T>(opts: {
  path: string;
  token?: string | null;
  body?: object;
  retries?: number;
}): Promise<T> {
  if (!isLocalAppHost()) {
    throw new Error(offlineUserMessage());
  }

  const retries = opts.retries ?? 3;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const ok = await pingLocalServer(4000);
      if (!ok) {
        lastErr = new Error(offlineUserMessage());
        await new Promise((r) => window.setTimeout(r, Math.min(8000, 1500 * attempt)));
        continue;
      }
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

      const res = await fetch(opts.path, {
        method: 'POST',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });

      const data = (await res.json()) as T & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      const network =
        e instanceof TypeError ||
        msg.includes('fetch') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('aborted');
      lastErr = new Error(network ? offlineUserMessage() : msg);
      if (!network || attempt >= retries) break;
      await new Promise((r) => window.setTimeout(r, Math.min(8000, 1500 * (attempt + 1))));
    }
  }

  throw lastErr ?? new Error(offlineUserMessage());
}
