/**
 * PinaxForge journal — append-only JSONL under .data/ (server-only).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import type { PinaxJournalEntry } from '@/lib/pinax-forge/types';

function journalPath(sessionDate: string): string {
  return path.join(getAppDataDir(), `pinax-forge-journal-${sessionDate}.jsonl`);
}

async function ensureDir() {
  await ensureAppDataDir();
}

export async function appendPinaxJournal(
  sessionDate: string,
  entry: PinaxJournalEntry
): Promise<void> {
  await ensureDir();
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(journalPath(sessionDate), line, 'utf8');
}

export async function appendPinaxJournalBatch(
  sessionDate: string,
  entries: PinaxJournalEntry[]
): Promise<void> {
  if (!entries.length) return;
  await ensureDir();
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(journalPath(sessionDate), lines, 'utf8');
}

export async function readPinaxJournal(
  sessionDate: string,
  limit = 200
): Promise<PinaxJournalEntry[]> {
  try {
    const raw = await fs.readFile(journalPath(sessionDate), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as PinaxJournalEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is PinaxJournalEntry => e != null);
    return entries.slice(-limit);
  } catch {
    return [];
  }
}
