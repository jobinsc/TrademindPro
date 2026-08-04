/**
 * Last Upstox bearer seen by local API routes (tick/board).
 * Stored under .data so all Next.js route bundles share it (in-memory alone does not).
 * Localhost tooling only — never ship this off-machine.
 */

import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '@/lib/app-data-dir';

const FILE = () => path.join(getAppDataDir(), '.upstox-last-bearer.json');

type Stored = { token: string; at: number };

export function rememberUpstoxBearer(token: string | null | undefined): void {
  const t = (token || '').trim();
  if (!t) return;
  try {
    const dir = getAppDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const payload: Stored = { token: t, at: Date.now() };
    fs.writeFileSync(FILE(), JSON.stringify(payload), 'utf8');
  } catch {
    /* ignore */
  }
}

export function lastUpstoxBearer(maxAgeMs = 30 * 60_000): string | null {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.token || typeof parsed.token !== 'string') return null;
    if (!parsed.at || Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.token.trim() || null;
  } catch {
    return null;
  }
}
