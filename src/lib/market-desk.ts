/**
 * Trade desk session (IST):
 * - INDIA: Mon–Fri 09:15–15:30 → Nifty only
 * - GOLD: Mon–Fri outside India cash → Gold only (15m analysis + Telegram)
 * - BTC: Sat–Sun → Bitcoin only (no other instruments)
 */

export type MarketDesk = 'INDIA' | 'GOLD' | 'BTC';

export type DeskAsset = 'NIFTY' | 'GOLD' | 'BTC';

function istParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { wd, hour, minute, mins: hour * 60 + minute };
}

export function isWeekendIst(d = new Date()): boolean {
  const { wd } = istParts(d);
  return wd === 'Sat' || wd === 'Sun';
}

/** NSE cash session Mon–Fri 09:15–15:30 IST */
export function isIndiaCashSession(d = new Date()): boolean {
  if (isWeekendIst(d)) return false;
  const { mins } = istParts(d);
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function isIndiaLunch(d = new Date()): boolean {
  const { mins } = istParts(d);
  return mins >= 12 * 60 && mins < 13 * 60 + 30;
}

export function getActiveDesk(d = new Date()): MarketDesk {
  if (isWeekendIst(d)) return 'BTC';
  if (isIndiaCashSession(d)) return 'INDIA';
  return 'GOLD';
}

export function deskPrimaryAsset(desk: MarketDesk = getActiveDesk()): DeskAsset {
  if (desk === 'INDIA') return 'NIFTY';
  if (desk === 'BTC') return 'BTC';
  return 'GOLD';
}

/** Forced analysis TF for off-hours desks */
export function deskForcedTimeframe(desk: MarketDesk = getActiveDesk()): string | null {
  if (desk === 'GOLD' || desk === 'BTC') return '15m';
  return null;
}

export function deskLabel(desk: MarketDesk = getActiveDesk()): string {
  if (desk === 'INDIA') return 'INDIA CASH · Nifty only (09:15–15:30 IST)';
  if (desk === 'BTC') return 'WEEKEND · Bitcoin only (Sat–Sun)';
  return 'AFTER HOURS · Gold only (15m)';
}

/** Which board/ticker keys to show for this desk — must not mix */
export function deskBoardKeys(desk: MarketDesk = getActiveDesk()): string[] {
  if (desk === 'INDIA') return ['NIFTY', 'BANKNIFTY', 'SENSEX'];
  if (desk === 'BTC') return ['BTC'];
  return ['GOLD'];
}

export function istClock(d = new Date()): string {
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
