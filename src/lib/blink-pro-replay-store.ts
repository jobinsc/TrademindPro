import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import type { Candle } from '@/lib/nejoic';
import type { ProReplayIndexSession } from '@/lib/blink-pro-narrative';

const STORE_PATH = path.join(process.cwd(), '.data', 'blink-pro-replay-1m.json');

export type StoredProReplay = {
  version: 1;
  createdAt: string;
  fromDate: string;
  toDate: string;
  source: string;
  bars: Candle[];
  sessions: ProReplayIndexSession[];
  summary: {
    totalBars: number;
    tradingDays: number;
    confirmedIdeas: number;
    hit5: number;
    hit7: number;
    hit5Rate: number;
    hit7Rate: number;
  };
};

export function summarizeReplayIndex(
  bars: Candle[],
  sessions: ProReplayIndexSession[]
): StoredProReplay['summary'] {
  const confirmedIdeas = sessions.reduce(
    (total, session) => total + session.confirmedIdeas,
    0
  );
  const hit5 = sessions.reduce((total, session) => total + session.hit5, 0);
  const hit7 = sessions.reduce((total, session) => total + session.hit7, 0);
  return {
    totalBars: bars.length,
    tradingDays: sessions.length,
    confirmedIdeas,
    hit5,
    hit7,
    hit5Rate: confirmedIdeas ? Math.round((hit5 / confirmedIdeas) * 1000) / 10 : 0,
    hit7Rate: confirmedIdeas ? Math.round((hit7 / confirmedIdeas) * 1000) / 10 : 0,
  };
}

export async function saveProReplay(
  replay: StoredProReplay
): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temporaryPath = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(replay), 'utf8');
  await fs.rename(temporaryPath, STORE_PATH);
}

export async function loadProReplay(): Promise<StoredProReplay | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const replay = JSON.parse(raw) as StoredProReplay;
    if (replay.version !== 1 || !Array.isArray(replay.bars)) return null;
    return replay;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function replayPublicIndex(replay: StoredProReplay) {
  return {
    version: replay.version,
    createdAt: replay.createdAt,
    fromDate: replay.fromDate,
    toDate: replay.toDate,
    source: replay.source,
    sessions: replay.sessions,
    summary: replay.summary,
  };
}
