import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import {
  loadNexusBSessionCloud,
  saveNexusBSessionCloud,
} from '@/lib/nexus-pulse-b/nexus-session-cloud';
import type { NexusPulseSession } from '@/lib/nexus-pulse-b/types';

function sessionPath(sessionDate: string): string {
  return path.join(getAppDataDir(), `nexus-pulse-b-session-${sessionDate}.json`);
}

/** Stale concurrent ticks must not drop closed fills already on disk. */
function mergePreserveClosedBook(
  incoming: NexusPulseSession,
  existing: NexusPulseSession | null
): NexusPulseSession {
  if (!existing?.closedTrades?.length) return incoming;
  const byId = new Map(existing.closedTrades.map((t) => [t.id, t]));
  for (const t of incoming.closedTrades || []) byId.set(t.id, t);
  const closedTrades = Array.from(byId.values()).sort((a, b) =>
    String(a.closedAt || a.openedAt).localeCompare(String(b.closedAt || b.openedAt))
  );
  const closedIds = new Set(closedTrades.map((t) => t.id));
  const openTrades = (incoming.openTrades || []).filter((t) => !closedIds.has(t.id));
  return { ...incoming, openTrades, closedTrades };
}

export async function loadNexusBSession(
  sessionDate: string
): Promise<NexusPulseSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionDate), 'utf8');
    return JSON.parse(raw) as NexusPulseSession;
  } catch {
    /* try Supabase on Vercel */
  }
  return loadNexusBSessionCloud(sessionDate);
}

export async function saveNexusBSession(
  session: NexusPulseSession,
  opts?: { replaceBook?: boolean }
): Promise<NexusPulseSession> {
  await ensureAppDataDir();
  let toWrite = session;
  if (!opts?.replaceBook) {
    let existing: NexusPulseSession | null = null;
    try {
      const raw = await fs.readFile(sessionPath(session.sessionDate), 'utf8');
      existing = JSON.parse(raw) as NexusPulseSession;
    } catch {
      existing = null;
    }
    toWrite = mergePreserveClosedBook(session, existing);
  }
  await fs.writeFile(sessionPath(toWrite.sessionDate), JSON.stringify(toWrite, null, 2), 'utf8');
  await saveNexusBSessionCloud(toWrite);
  return toWrite;
}
