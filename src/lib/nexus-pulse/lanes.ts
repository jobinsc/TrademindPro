import { NEXUS_PULSE_RULES, type NexusLaneId } from '@/lib/nexus-pulse/rules';
import { istMinutesOfDay, parseHm } from '@/lib/pinax-forge/ist';

/** Lane session gates for new entries (IST). */
export function laneEntryAllowed(laneId: NexusLaneId, now = new Date()): {
  ok: boolean;
  reason: string;
} {
  const mins = istMinutesOfDay(now.toISOString());
  if (mins == null) return { ok: false, reason: 'Clock unavailable' };

  const open = parseHm(NEXUS_PULSE_RULES.sessionOpenIst);
  if (mins < open) {
    return { ok: false, reason: `Before ${NEXUS_PULSE_RULES.sessionOpenIst} IST` };
  }

  const sq = parseHm(NEXUS_PULSE_RULES.sessionSquareOffIst);
  if (mins >= sq) {
    return { ok: false, reason: `After square-off ${NEXUS_PULSE_RULES.sessionSquareOffIst} IST` };
  }

  if (laneId === 'current_bans') {
    const banOpenEnd = 9 * 60 + 30;
    if (mins >= open && mins < banOpenEnd) {
      return { ok: false, reason: 'Lane A: no new entries 09:15–09:30' };
    }
    const banAfternoonStart = 14 * 60;
    const banAfternoonEnd = 14 * 60 + 45;
    if (mins >= banAfternoonStart && mins < banAfternoonEnd) {
      return { ok: false, reason: 'Lane A: no new entries 14:00–14:45' };
    }
  }

  if (laneId === 'morning_open_stop_15') {
    const stopNew = parseHm(NEXUS_PULSE_RULES.laneBStopNewIst);
    if (mins >= stopNew) {
      return { ok: false, reason: `Lane B: no new entries from ${NEXUS_PULSE_RULES.laneBStopNewIst}` };
    }
  }

  return { ok: true, reason: 'Entry window OK' };
}

export function laneForceFlatAt(laneId: NexusLaneId, now = new Date()): boolean {
  if (laneId !== 'morning_open_stop_15') return false;
  const mins = istMinutesOfDay(now.toISOString());
  if (mins == null) return false;
  return mins >= parseHm(NEXUS_PULSE_RULES.laneBStopNewIst);
}

export function shouldSquareOffAll(now = new Date()): boolean {
  const mins = istMinutesOfDay(now.toISOString());
  if (mins == null) return false;
  return mins >= parseHm(NEXUS_PULSE_RULES.sessionSquareOffIst);
}
