/**
 * App-wide arm + locked ATM keys so ATM Movement Lab keeps sampling after leaving /app/blink.
 * Does not place orders — observation/save only (same APIs as the lab UI).
 */

export type AtmLabRuntimeSession = {
  date: string;
  keys: { nifty: string; ce: string; pe: string };
  strike: number;
  runId?: string;
};

const ARMED_KEY = 'trademindpro_atm_lab_armed_v1';
const SESSION_KEY = 'trademindpro_atm_lab_runtime_session_v1';

let pageOwns = false;

export function isAtmLabArmed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ARMED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAtmLabArmed(armed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (armed) window.localStorage.setItem(ARMED_KEY, '1');
    else window.localStorage.removeItem(ARMED_KEY);
  } catch {
    /* ignore */
  }
}

export function writeAtmLabRuntimeSession(session: AtmLabRuntimeSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function readAtmLabRuntimeSession(): AtmLabRuntimeSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtmLabRuntimeSession;
    if (
      !parsed?.date ||
      !parsed.keys?.nifty ||
      !parsed.keys?.ce ||
      !parsed.keys?.pe ||
      !Number.isFinite(parsed.strike)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAtmLabRuntimeSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function setAtmLabPageOwns(owns: boolean): void {
  pageOwns = owns;
}

export function atmLabPageOwns(): boolean {
  return pageOwns;
}

/** Background host should sample when armed and Blink page is not mounted. */
export function atmLabBgShouldRun(): boolean {
  return isAtmLabArmed() && !atmLabPageOwns();
}
