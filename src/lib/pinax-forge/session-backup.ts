/**
 * PinaxForge browser backup — survives brief server outages (like ATM Lab).
 */

import type { PinaxForgeSession } from '@/lib/pinax-forge/types';

export const PINAX_FORGE_BACKUP_KEY = 'trademindpro_pinax_forge_session_v1';

export function backupPinaxSession(session: PinaxForgeSession): void {
  if (typeof window === 'undefined') return;
  try {
    const slim = {
      ...session,
      recentJournal: session.recentJournal?.slice(-40) ?? [],
    };
    localStorage.setItem(PINAX_FORGE_BACKUP_KEY, JSON.stringify(slim));
  } catch {
    /* quota */
  }
}

export function loadPinaxSessionBackup(): PinaxForgeSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PINAX_FORGE_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PinaxForgeSession;
  } catch {
    return null;
  }
}

export function clearPinaxSessionBackup(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PINAX_FORGE_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}
