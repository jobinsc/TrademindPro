/** IST helpers for PinaxForge — isolated from Blink. */

export function istDate(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function istMinutesOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMin + 330) % (24 * 60);
}

export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isBeforeEntryCutoff(cutoffHm: string, now = new Date()): boolean {
  const mins = istMinutesOfDay(now.toISOString());
  if (mins == null) return true;
  return mins < parseHm(cutoffHm);
}

/** True once NSE cash/FO session is live (default 09:15 IST). */
export function isSessionOpen(openHm: string, now = new Date()): boolean {
  const mins = istMinutesOfDay(now.toISOString());
  if (mins == null) return false;
  return mins >= parseHm(openHm);
}

/** Paper ENTRY window: after open and before cutoff. */
export function isEntryWindowOpen(
  openHm: string,
  cutoffHm: string,
  now = new Date()
): boolean {
  return isSessionOpen(openHm, now) && isBeforeEntryCutoff(cutoffHm, now);
}

/** IST calendar YYYY-MM-DD for a timestamp (matches morning-desk session split). */
export function istCalendarDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** @deprecated alias — use istCalendarDate */
export function datePrefixFromIso(iso: string): string | null {
  return istCalendarDate(iso);
}

export function dayAdd(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
