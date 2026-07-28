import type { NexusLaneId } from '@/lib/nexus-pulse/rules';
import { loadArchiveDay } from '@/lib/nexus-pulse/trade-archive';

export type NexusArchiveReportRun = {
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
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

export async function runNexusArchiveReport(opts: {
  fromDate: string;
  toDate: string;
  activeLanes: NexusLaneId[];
}): Promise<NexusArchiveReportRun> {
  const dates = dateRange(opts.fromDate, opts.toDate);
  const laneSet = new Set(opts.activeLanes);

  const allTrades = [];
  for (const date of dates) {
    const day = await loadArchiveDay('paper', date);
    for (const t of day.trades) {
      if (laneSet.has(t.laneId)) allTrades.push(t);
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
    note: 'Actual NexusPulse PAPER trades from archive (real Upstox option LTP at trade time).',
  };
}

