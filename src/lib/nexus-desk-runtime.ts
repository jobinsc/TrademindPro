/**
 * App-wide arm flags for Sector 7 A/B so ticks keep running when the desk page unmounts.
 * Page ownership prevents double-polling when the workspace is open.
 * Does not change strategy / study rules — only who schedules /api/.../tick.
 */

export type NexusDeskId = 'a' | 'b';

const ARMED_KEY: Record<NexusDeskId, string> = {
  a: 'trademindpro_nexus_a_armed_v1',
  b: 'trademindpro_nexus_b_armed_v1',
};

/** In-memory: desk page is mounted and owns the poll loop. */
const pageOwns: Record<NexusDeskId, boolean> = { a: false, b: false };

export function isNexusDeskArmed(desk: NexusDeskId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ARMED_KEY[desk]) === '1';
  } catch {
    return false;
  }
}

export function setNexusDeskArmed(desk: NexusDeskId, armed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (armed) window.localStorage.setItem(ARMED_KEY[desk], '1');
    else window.localStorage.removeItem(ARMED_KEY[desk]);
  } catch {
    /* ignore */
  }
}

export function setNexusDeskPageOwns(desk: NexusDeskId, owns: boolean): void {
  pageOwns[desk] = owns;
}

export function nexusDeskPageOwns(desk: NexusDeskId): boolean {
  return pageOwns[desk];
}

/** True when background host should call tick (armed + page not owning). */
export function nexusDeskBgShouldTick(desk: NexusDeskId): boolean {
  return isNexusDeskArmed(desk) && !nexusDeskPageOwns(desk);
}

type ClosedBookTrade = { id: string; openedAt?: string; closedAt?: string | null };

/**
 * Keep closed fills already shown in the UI if a stale tick/init response omits them.
 * Clear-paper responses intentionally send an empty book — callers must not use this there.
 */
export function mergeKeepClosedSession<
  TTrade extends ClosedBookTrade,
  TSession extends { closedTrades: TTrade[]; openTrades: TTrade[] },
>(prev: TSession | null, next: TSession): TSession {
  if (!prev?.closedTrades?.length) return next;
  const byId = new Map(next.closedTrades.map((t) => [t.id, t]));
  let added = 0;
  for (const t of prev.closedTrades) {
    if (byId.has(t.id)) continue;
    byId.set(t.id, t);
    added += 1;
  }
  if (!added) return next;
  const closedTrades = Array.from(byId.values()).sort((a, b) =>
    String(a.closedAt || a.openedAt).localeCompare(String(b.closedAt || b.openedAt))
  );
  const closedIds = new Set(closedTrades.map((t) => t.id));
  return {
    ...next,
    closedTrades,
    openTrades: next.openTrades.filter((t) => !closedIds.has(t.id)),
  };
}
