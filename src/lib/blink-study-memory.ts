/**
 * Blink agent study memory — persisted day-by-day Nifty 3m lessons.
 * Stored under .data/ (gitignored) so the agent can reload after restart.
 * Server-only — never import from client components (uses Node `fs`).
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SessionStudy, StudyLabReport } from '@/lib/blink-nifty-study-lab';
import type { GradeReportSummary } from '@/lib/blink-opportunity-grade';

const MEMORY_DIR = path.join(process.cwd(), '.data');
const MEMORY_FILE = path.join(MEMORY_DIR, 'blink-nifty-study-memory.json');

export type DayMemory = SessionStudy & {
  studiedAt: string;
  source: string;
};

export type BlinkNiftyStudyMemory = {
  version: 1;
  symbol: 'NIFTY';
  timeframe: '3m';
  updatedAt: string;
  fromDate: string | null;
  toDate: string | null;
  totalBarsSeen: number;
  /** Keyed by YYYY-MM-DD */
  days: Record<string, DayMemory>;
  summary: {
    dayCount: number;
    upDays: number;
    downDays: number;
    sidewaysDays: number;
    tradeableDays: number;
    flatDays: number;
    totalOpportunities: number;
    daysWith2PlusOps: number;
    avgOpsPerDay: number;
  };
  gradeSummary: GradeReportSummary | null;
};

function emptyMemory(): BlinkNiftyStudyMemory {
  return {
    version: 1,
    symbol: 'NIFTY',
    timeframe: '3m',
    updatedAt: new Date().toISOString(),
    fromDate: null,
    toDate: null,
    totalBarsSeen: 0,
    days: {},
    summary: {
      dayCount: 0,
      upDays: 0,
      downDays: 0,
      sidewaysDays: 0,
      tradeableDays: 0,
      flatDays: 0,
      totalOpportunities: 0,
      daysWith2PlusOps: 0,
      avgOpsPerDay: 0,
    },
    gradeSummary: null,
  };
}

function recomputeSummary(mem: BlinkNiftyStudyMemory) {
  const sessions = Object.values(mem.days);
  const totalOpportunities = sessions.reduce(
    (s, d) => s + (d.opportunityCount ?? d.opportunities?.length ?? (d.options?.bias !== 'FLAT' ? 1 : 0)),
    0
  );
  const daysWith2PlusOps = sessions.filter(
    (d) => (d.opportunityCount ?? d.opportunities?.length ?? 0) >= 2
  ).length;
  mem.summary = {
    dayCount: sessions.length,
    upDays: sessions.filter((s) => s.scenario === 'UP').length,
    downDays: sessions.filter((s) => s.scenario === 'DOWN').length,
    sidewaysDays: sessions.filter((s) => s.scenario === 'SIDEWAYS').length,
    tradeableDays: sessions.filter(
      (s) => (s.opportunityCount ?? 0) > 0 || s.options?.bias !== 'FLAT'
    ).length,
    flatDays: sessions.filter(
      (s) => (s.opportunityCount ?? 0) === 0 && s.options?.bias === 'FLAT'
    ).length,
    totalOpportunities,
    daysWith2PlusOps,
    avgOpsPerDay:
      sessions.length > 0
        ? Math.round((totalOpportunities / sessions.length) * 100) / 100
        : 0,
  };
  const dates = sessions.map((s) => s.date).sort();
  mem.fromDate = dates[0] ?? null;
  mem.toDate = dates[dates.length - 1] ?? null;
  mem.updatedAt = new Date().toISOString();
}

export async function loadBlinkStudyMemory(): Promise<BlinkNiftyStudyMemory> {
  try {
    const raw = await fs.readFile(MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as BlinkNiftyStudyMemory;
    if (!parsed?.days || parsed.version !== 1) return emptyMemory();
    return parsed;
  } catch {
    return emptyMemory();
  }
}

export async function saveBlinkStudyMemory(
  mem: BlinkNiftyStudyMemory
): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  recomputeSummary(mem);
  await fs.writeFile(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf8');
}

/** Merge a study report into agent memory (overwrites same dates). */
export async function mergeStudyReportIntoMemory(
  report: StudyLabReport,
  totalBars: number,
  opts?: { replaceAll?: boolean }
): Promise<BlinkNiftyStudyMemory> {
  const mem = opts?.replaceAll ? emptyMemory() : await loadBlinkStudyMemory();
  const studiedAt = new Date().toISOString();
  for (const s of report.sessions) {
    mem.days[s.date] = {
      ...s,
      opportunities: s.opportunities || [],
      opportunityCount: s.opportunityCount ?? s.opportunities?.length ?? 0,
      gradedOpportunities: s.gradedOpportunities || [],
      dayGrade: s.dayGrade,
      deepStudy: s.deepStudy,
      studiedAt,
      source: report.source,
    };
  }
  mem.totalBarsSeen = opts?.replaceAll
    ? totalBars
    : Math.max(mem.totalBarsSeen, totalBars);
  if (report.gradeSummary) {
    mem.gradeSummary = report.gradeSummary;
  }
  await saveBlinkStudyMemory(mem);
  return mem;
}

export function memoryToReport(mem: BlinkNiftyStudyMemory): StudyLabReport | null {
  const sessions = Object.values(mem.days).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  if (!sessions.length) return null;
  return {
    fromDate: mem.fromDate || sessions[0].date,
    toDate: mem.toDate || sessions[sessions.length - 1].date,
    source: sessions[0]?.source || 'memory',
    totalBars: mem.totalBarsSeen,
    sessions,
    summary: {
      upDays: mem.summary.upDays,
      downDays: mem.summary.downDays,
      sidewaysDays: mem.summary.sidewaysDays,
      tradeableDays: mem.summary.tradeableDays,
      flatDays: mem.summary.flatDays,
      totalOpportunities: mem.summary.totalOpportunities ?? 0,
      daysWith2PlusOps: mem.summary.daysWith2PlusOps ?? 0,
      avgOpsPerDay: mem.summary.avgOpsPerDay ?? 0,
    },
    gradeSummary: mem.gradeSummary ?? null,
    curriculum: [
      'Agent collects Nifty 3m from Upstox.',
      'Agent maps PA + S/R + phases, then hunts 2–3 slots.',
      'Agent grades each slot: target before stop = WIN.',
      'Learn which setups/phases print money — size those up.',
      'Skip weak setups in live until win rate improves.',
    ],
  };
}

export function studyMemoryPath(): string {
  return MEMORY_FILE;
}
