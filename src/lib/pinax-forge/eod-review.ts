/**
 * PinaxForge end-of-day review — markdown + JSON export.
 */

import { readPinaxJournal } from '@/lib/pinax-forge/journal-store';
import { istDate } from '@/lib/pinax-forge/ist';
import { loadPinaxSession } from '@/lib/pinax-forge/session-store';
import { buildPinaxTuningProfile } from '@/lib/pinax-forge/tuning';
import { PINAX_FORGE_RULES } from '@/lib/pinax-forge/rules';
import type { PinaxEodReview } from '@/lib/pinax-forge/types';

export async function buildPinaxEodReview(sessionDate?: string): Promise<PinaxEodReview> {
  const date = sessionDate || istDate();
  const session = await loadPinaxSession(date);
  const journal = await readPinaxJournal(date, 500);
  const tuning = await buildPinaxTuningProfile(date);

  if (!session) {
    return {
      sessionDate: date,
      generatedAt: new Date().toISOString(),
      hasSession: false,
      markdown: `# PinaxForge EOD Review — ${date}\n\nNo session data for this date.\n`,
      summary: null,
      tuning,
    };
  }

  const perf = session.performance;
  const morning = session.morningRead;
  const lines: string[] = [];

  lines.push(`# PinaxForge EOD Review — ${date}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
  lines.push('');
  lines.push('## Session snapshot');
  lines.push(`- **Spot:** ${session.spot.toFixed(1)}`);
  lines.push(`- **Morning bias:** ${morning?.bias ?? '—'} (${morning?.confidence ?? 0}%)`);
  lines.push(`- **3-day backdrop:** ${session.morningContext.threeDayTrend} — ${session.morningContext.threeDayNote}`);
  if (session.morningContext.pdh != null) {
    lines.push(`- **PDH / PDL:** ${session.morningContext.pdh.toFixed(0)} / ${session.morningContext.pdl?.toFixed(0) ?? '—'}`);
  }
  lines.push(`- **Auto entries:** ${session.autoPaused ? 'PAUSED' : 'ON'}`);
  lines.push('');

  lines.push(`## Performance (after ₹${PINAX_FORGE_RULES.roundTripCostInr} cost)`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Closed trades | ${perf.closedTrades} |`);
  lines.push(`| Win rate | ${perf.winRate}% |`);
  lines.push(`| Net P&L | ₹${perf.netPnl.toFixed(0)} |`);
  lines.push(`| Expectancy | ₹${perf.expectancy.toFixed(0)}/trade |`);
  lines.push(`| RR 1:1 hits | ${perf.rrHits['1'] ?? 0} |`);
  lines.push(`| RR 1:1.5 hits | ${perf.rrHits['1.5'] ?? 0} |`);
  lines.push(`| RR 1:2 hits | ${perf.rrHits['2'] ?? 0} |`);
  lines.push('');

  if (session.closedTrades.length) {
    lines.push('## Closed paper trades');
    lines.push('| Side | Strike | Entry | High | Low | Exit | Net | Reason | Ever green |');
    lines.push('|------|--------|-------|------|-----|------|-----|--------|------------|');
    for (const t of session.closedTrades) {
      const high = t.highPremium ?? t.entryPremium + (t.maxFavorablePts ?? 0);
      const low = t.lowPremium ?? t.entryPremium - (t.maxAdversePts ?? 0);
      lines.push(
        `| ${t.side} | ${t.strike} | ₹${t.entryPremium} | ₹${high} | ₹${low} | ₹${t.exitPremium ?? '—'} | ₹${t.netPnl?.toFixed(0) ?? 0} | ${t.exitReason ?? '—'} | ${t.everProfit ? 'yes' : 'no'} |`
      );
    }
    lines.push('');
    lines.push(
      '_High/Low = highest and lowest option premium after entry until close (any exit: SL, target, trail, flip)._'
    );
    lines.push('');
  }

  if (session.openTrades.length) {
    lines.push('## Still open at review time');
    for (const t of session.openTrades) {
      lines.push(
        `- ${t.side} ${t.strike} entry ₹${t.entryPremium}${t.markPremium != null ? ` mark ₹${t.markPremium}` : ''}`
      );
    }
    lines.push('');
  }

  lines.push('## Setup tuning (from recent paper history)');
  lines.push(`- Min confidence: **${tuning.minConfidence}%** (${tuning.sampleTrades} sample trades)`);
  for (const note of tuning.notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');

  const skips = journal.filter((j) => j.type === 'SKIP' || j.type === 'OVERRIDE');
  const entries = journal.filter((j) => j.type === 'ENTRY');
  lines.push('## Decision log stats');
  lines.push(`- Setups logged: ${journal.filter((j) => j.type === 'SETUP').length}`);
  lines.push(`- Paper entries: ${entries.length}`);
  lines.push(`- Skips / overrides: ${skips.length}`);
  lines.push('');

  lines.push('## Journal (last 25)');
  for (const j of journal.slice(-25)) {
    lines.push(`- \`${new Date(j.at).toLocaleTimeString('en-IN')}\` **[${j.type}]** ${j.message}`);
  }
  lines.push('');
  lines.push('---');
  lines.push(`*Paper only · RR primary 1:${PINAX_FORGE_RULES.primaryRr} · cutoff ${PINAX_FORGE_RULES.sessionEntryCutoffIst} IST · PinaxForge separate from Blink*`);

  return {
    sessionDate: date,
    generatedAt: new Date().toISOString(),
    hasSession: true,
    markdown: lines.join('\n'),
    summary: {
      spot: session.spot,
      bias: morning?.bias ?? null,
      performance: perf,
      closedCount: session.closedTrades.length,
      openCount: session.openTrades.length,
      autoPaused: session.autoPaused,
    },
    tuning,
  };
}
