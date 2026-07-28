import type { NexusBLaneId } from '@/lib/nexus-pulse-b/rules';
import { loadNexusBArchiveDay } from '@/lib/nexus-pulse-b/trade-archive';

export type NexusBArchiveReportRun = {
  fromDate: string;
  toDate: string;
  activeLanes: NexusBLaneId[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  days: number;
  note: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dateRange(fromDate: string, toDate: string): string[] {
  if (fromDate > toDate) return [];
  const out: string[] = [];
  const start = new Date(`${fromDate}T12:00:00Z`);
  const end = new Date(`${toDate}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function runNexusBArchiveReport(opts: {
  fromDate: string;
  toDate: string;
  activeLanes: NexusBLaneId[];
}): Promise<NexusBArchiveReportRun> {
  const dates = dateRange(opts.fromDate, opts.toDate);
  const laneSet = new Set(opts.activeLanes);

  const allTrades = [];
  for (const date of dates) {
    const day = await loadNexusBArchiveDay('paper', date);
    for (const t of day.trades) {
      if (laneSet.has(t.laneId as NexusBLaneId)) allTrades.push(t);
    }
  }

  const wins = allTrades.filter((t) => (t.netPnl ?? 0) > 0).length;
  const losses = allTrades.filter((t) => (t.netPnl ?? 0) <= 0).length;
  const netPnl = round2(allTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const grossPnl = round2(allTrades.reduce((s, t) => s + (t.grossPnl ?? 0), 0));
  const daySet = new Set(allTrades.map((t) => t.sessionDate).filter(Boolean));

  return {
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    activeLanes: opts.activeLanes,
    totalTrades: allTrades.length,
    wins,
    losses,
    winRate: allTrades.length ? Math.round((wins * 1000) / allTrades.length) / 10 : 0,
    netPnl,
    grossPnl,
    days: daySet.size,
    note: 'Sector 7 B paper archive (Sensex) — no live Upstox option replay.',
  };
}
