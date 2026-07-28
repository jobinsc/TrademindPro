/**
 * NexusPulse daily report — story + meta (mobile sections). Mirrors generate-nexus-daily-report.py.
 */

import type { NexusPaperTrade } from '@/lib/nexus-pulse-b/types';
import type { NexusPulseSession } from '@/lib/nexus-pulse-b/types';
import { NEXUS_PULSE_B_RULES } from '@/lib/nexus-pulse-b/rules';
import type { NexusBDailyReportMeta } from '@/lib/nexus-pulse-b/daily-report-store';

export const DAILY_REPORT_BROKERAGE = NEXUS_PULSE_B_RULES.roundTripCostInr;

export type ReportTradeRow = NexusPaperTrade & {
  sessionDate?: string;
  /** Live LTP at report generation (open trades or refresh). */
  reportMarkPremium?: number;
  reportOpen?: boolean;
};

function istHm(iso: string | undefined): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function durMinutes(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? Math.floor(ms / 60_000) : 0;
}

function durHhmm(a?: string, b?: string): string {
  const m = durMinutes(a, b);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function reasonWord(r?: string): string {
  if (r === 'UT_5M') return 'Sector 7 A';
  if (r === 'UT_3M') return 'Sector 7 A (3m)';
  if (r === 'TRAIL') return 'profit trail';
  if (r === 'SL') return 'stop loss';
  if (r === 'SQ') return 'end-of-day square-off';
  if (r === 'LANE_B_15') return 'Lane B 3:00 pm rule';
  return r || 'closed';
}

function tradeLabel(t: ReportTradeRow): string {
  const sym = t.tradingSymbol?.includes('NIFTY')
    ? t.tradingSymbol
    : `${t.side} ${t.strike} ATM`;
  return sym;
}

function laneName(lid?: string): string {
  if (lid === 'current_bans') return 'Lane A';
  if (lid === 'morning_open_stop_15') return 'Lane B';
  return lid || '?';
}

export function grossTrade(t: ReportTradeRow): number {
  const entry = t.entryPremium ?? 0;
  const exitP =
    t.reportMarkPremium ??
    t.exitPremium ??
    t.markPremium ??
    entry;
  const lot = t.lotSize ?? NEXUS_PULSE_B_RULES.sensexLotSize;
  const qty = t.qty ?? 1;
  return (exitP - entry) * qty * lot;
}

export function netTrade(t: ReportTradeRow): number {
  const qty = t.qty ?? 1;
  return grossTrade(t) - DAILY_REPORT_BROKERAGE * qty;
}

export function buildDailyReportStory(
  date: string,
  trades: ReportTradeRow[],
  session: NexusPulseSession | null,
  opts?: {
    livePremiumsNote?: string;
    studyByLaneLines?: string[];
  }
): {
  story: Record<string, unknown>;
  sections: NonNullable<NexusBDailyReportMeta['sections']>;
  summary: NexusBDailyReportMeta['summary'];
  opening: string[];
  market: string[];
  calc: string[];
  tradeBlocks: string[][];
  deskSummary: string[];
  suggestions: string[];
} {
  const laneA = trades.filter((t) => t.laneId === 'current_bans');
  const laneB = trades.filter((t) => t.laneId === 'morning_open_stop_15');
  const nets = trades.map(netTrade);
  const grosses = trades.map(grossTrade);
  const totalNet = nets.reduce((s, n) => s + n, 0);
  const totalGross = grosses.reduce((s, n) => s + n, 0);
  const totalBrokerage = trades.reduce(
    (s, t) => s + DAILY_REPORT_BROKERAGE * (t.qty ?? 1),
    0
  );
  const wins = nets.filter((n) => n >= 0).length;
  const losses = nets.length - wins;
  const winNets = nets.filter((n) => n >= 0);
  const lossNets = nets.filter((n) => n < 0);
  const avgWin = winNets.length ? winNets.reduce((a, b) => a + b, 0) / winNets.length : 0;
  const avgLoss = lossNets.length ? lossNets.reduce((a, b) => a + b, 0) / lossNets.length : 0;
  const winRate = trades.length ? (100 * wins) / trades.length : 0;

  const spots = trades.map((t) => t.entrySpot).filter((x) => x > 0);
  const firstSpot = spots[0] ?? null;
  const lastSpot = session?.spot ?? spots[spots.length - 1] ?? null;
  const spotMove =
    firstSpot != null && lastSpot != null ? lastSpot - firstSpot : null;

  const ceN = trades.filter((t) => t.side === 'CE').length;
  const peN = trades.filter((t) => t.side === 'PE').length;
  const reasons = new Map<string, number>();
  for (const t of trades) {
    const k = t.reportOpen ? 'OPEN' : t.exitReason || 'unknown';
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }

  const market: string[] = [];
  if (opts?.livePremiumsNote) {
    market.push(opts.livePremiumsNote);
  }
  if (opts?.studyByLaneLines?.length) {
    market.push('Per-lane replay (same as Real Option Study):');
    market.push(...opts.studyByLaneLines);
  }
  if (!trades.length) {
    market.push('No paper trades on file for this date — run NexusPulse B session and close trades, or regenerate after market.');
    if (lastSpot) market.push(`Last Nifty spot on desk: ${lastSpot.toLocaleString('en-IN')}.`);
  } else {
    if (firstSpot != null && lastSpot != null) {
      const direction = (spotMove ?? 0) >= 0 ? 'up' : 'down';
      market.push(
        `Nifty around first entry ~${Math.round(firstSpot).toLocaleString('en-IN')}. ` +
          `Session spot ~${Math.round(lastSpot).toLocaleString('en-IN')} ` +
          `(${direction} ~${Math.abs(Math.round(spotMove ?? 0))} pts from first entry).`
      );
    }
    market.push(
      `Desk: ${ceN} CE, ${peN} PE. ` +
        (ceN > peN
          ? 'More CE — book leaned bullish.'
          : peN > ceN
            ? 'More PE — book leaned bearish.'
            : 'CE/PE balanced.')
    );
    const pos5 = session?.ut5m?.last?.pos;
    if (pos5 != null) {
      market.push(
        `End 5m Sector 7 A: ${pos5 === 1 ? 'bullish' : pos5 === -1 ? 'bearish' : 'flat'}.`
      );
    }
    for (const [code, cnt] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      market.push(`Exit mix: ${reasonWord(code)} ×${cnt}.`);
    }
  }

  const opening: string[] = [];
  if (!trades.length) {
    opening.push('No trades to report for this date yet.');
  } else {
    const mood = totalNet >= 0 ? 'green day' : 'red day';
    opening.push(
      `${mood.charAt(0).toUpperCase() + mood.slice(1)}: ${trades.length} trade(s). ` +
        `Wins ${wins}, losses ${losses} (${winRate.toFixed(0)}% win rate). ` +
        `Gross ₹${Math.round(totalGross).toLocaleString('en-IN')}, ` +
        `cost ~₹${Math.round(totalBrokerage).toLocaleString('en-IN')}, ` +
        `net after ₹${DAILY_REPORT_BROKERAGE}/lot: ₹${Math.round(totalNet).toLocaleString('en-IN')}.`
    );
  }

  const tradeBlocks: string[][] = [];
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const g = grossTrade(t);
    const n = netTrade(t);
    const exitP =
      t.reportMarkPremium ?? t.exitPremium ?? t.markPremium ?? t.entryPremium;
    const mfe = t.maxFavorablePts;
    const mae = t.maxAdversePts;
    const block = [
      `Trade ${i + 1} — ${laneName(t.laneId)} | ${tradeLabel(t)}${t.reportOpen ? ' (OPEN at report)' : ''}`,
      `Open ${istHm(t.openedAt)} → ${t.reportOpen ? 'mark' : 'close'} ${istHm(t.closedAt)} ` +
        `(held ${durHhmm(t.openedAt, t.reportOpen ? new Date().toISOString() : t.closedAt)})`,
      `Premium in ${t.entryPremium.toFixed(2)} → out ${Number(exitP).toFixed(2)} | Spot at entry ${(t.entrySpot ?? 0).toLocaleString('en-IN')}`,
      t.reportOpen
        ? `Status: still open — exit premium = live Upstox LTP at report time`
        : `Exit: ${reasonWord(t.exitReason)}`,
      `Gross ₹${Math.round(g).toLocaleString('en-IN')} | Cost ₹${DAILY_REPORT_BROKERAGE * (t.qty ?? 1)} | Net ₹${Math.round(n).toLocaleString('en-IN')}`,
    ];
    if (mfe != null || mae != null) {
      block.push(
        `Path: best +${(mfe ?? 0).toFixed(2)} pts, worst -${(mae ?? 0).toFixed(2)} pts`
      );
    }
    tradeBlocks.push(block);
  }

  const calc = [
    `Trades listed: ${trades.length}`,
    `Lane A: ${laneA.length} trades, net ₹${Math.round(laneA.reduce((s, t) => s + netTrade(t), 0)).toLocaleString('en-IN')}`,
    `Lane B: ${laneB.length} trades, net ₹${Math.round(laneB.reduce((s, t) => s + netTrade(t), 0)).toLocaleString('en-IN')}`,
    `Wins / Losses: ${wins} / ${losses} (${winRate.toFixed(0)}% win rate)`,
    `Gross P&L: ₹${Math.round(totalGross).toLocaleString('en-IN')}`,
    `Brokerage (@ ₹${DAILY_REPORT_BROKERAGE}/lot): ₹${Math.round(totalBrokerage).toLocaleString('en-IN')}`,
    `Net P&L: ₹${Math.round(totalNet).toLocaleString('en-IN')}`,
    `Avg win: ₹${Math.round(avgWin).toLocaleString('en-IN')} | Avg loss: ₹${Math.round(avgLoss).toLocaleString('en-IN')}`,
  ];

  const deskSummary: string[] = [];
  if (!trades.length) {
    deskSummary.push('Desk quiet — start NexusPulse B after 09:15 IST with Upstox connected.');
  } else if (totalNet >= 0) {
    deskSummary.push('Positive paper day — trail and Sector 7 A exits did their job.');
  } else {
    deskSummary.push('Negative paper day — review entries vs 5m align and twin-lane duplication.');
  }

  const suggestions: string[] = [];
  if (!trades.length) {
    suggestions.push('Open NexusPulse B, select lane(s), tap Start, and let paper trades archive on close.');
    suggestions.push('After trades, tap Create report again (uses session + archive + live LTP).');
  } else {
    suggestions.push('Premiums in this report use Upstox LTP at generation time for open legs.');
    suggestions.push('Keep Lane A and Lane B separate in review.');
  }

  const summary: NexusBDailyReportMeta['summary'] = {
    tradeCount: trades.length,
    wins,
    losses,
    netAfter70: Math.round(totalNet * 100) / 100,
    laneA: laneA.length,
    laneB: laneB.length,
    laneANet: Math.round(laneA.reduce((s, t) => s + netTrade(t), 0) * 100) / 100,
    laneBNet: Math.round(laneB.reduce((s, t) => s + netTrade(t), 0) * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    gross: Math.round(totalGross * 100) / 100,
    brokerage: Math.round(totalBrokerage * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    firstSpot,
    lastSpot,
    spotMove: spotMove != null ? Math.round(spotMove * 100) / 100 : null,
    ceCount: ceN,
    peCount: peN,
  };

  const sections = {
    opening,
    market,
    calc,
    tradeBlocks,
    deskSummary,
    suggestions,
    studyByLane: opts?.studyByLaneLines,
  };

  return {
    story: { date, ...summary },
    sections,
    summary,
    opening,
    market,
    calc,
    tradeBlocks,
    deskSummary,
    suggestions,
  };
}

export function metaFromStory(
  date: string,
  built: ReturnType<typeof buildDailyReportStory>,
  extra?: Partial<NexusBDailyReportMeta>
): NexusBDailyReportMeta {
  const now = new Date().toISOString();
  return {
    agent: 'NexusPulseB',
    date,
    title: `NexusPulse B Day Report — ${date}`,
    pdfFile: `NexusPulseB-Day-${date}.pdf`,
    pdfPath: `.data/nexus-pulse-b/reports/daily/NexusPulseB-Day-${date}.pdf`,
    generatedAt: now,
    summary: built.summary,
    sections: built.sections,
    simpleStory: [
      ...built.opening,
      ...built.market,
      ...built.deskSummary,
      ...built.suggestions,
    ],
    ...extra,
  };
}
