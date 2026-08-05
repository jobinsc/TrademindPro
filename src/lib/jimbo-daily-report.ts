/**
 * Jimbo daily paper report — story + PDF (pdf-lib).
 */

import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import { loadJimboPaperBackupDay, type JimboArchivedTrade } from '@/lib/jimbo-trade-archive';
import type { JimboTrade } from '@/lib/jimbo';
import { JIMBO_MIN_OPTION_ENTRY_PREMIUM } from '@/lib/paper-exit';

const PAGE_W = 420;
const PAGE_H = 595;
const MARGIN = 36;
const LINE = 11;
const BODY = 9;

export type JimboDailyReportMeta = {
  date: string;
  title: string;
  generatedAt: string;
  summary: {
    tradeCount: number;
    wins: number;
    losses: number;
    flats: number;
    winRate: number | null;
    netPnl: number;
    upstoxPriced: number;
    unknownPriced: number;
  };
  sections: {
    opening: string[];
    rules: string[];
    tradeBlocks: string[][];
    deskSummary: string[];
    suggestions: string[];
  };
};

function pdfSafe(s: string): string {
  return s
    .replace(/\u20b9/g, 'Rs')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function istClock(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtRs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}Rs ${Math.round(n)}`;
}

function pts(entry: number, exit: number | null | undefined): string {
  if (exit == null || !Number.isFinite(exit)) return '-';
  const d = Math.round((exit - entry) * 100) / 100;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d}`;
}

function explainTrade(t: JimboTrade | JimboArchivedTrade, index: number): string[] {
  const entry = t.entryPremium;
  const exit = t.exitPremium;
  const move = exit != null ? exit - entry : null;
  const src =
    t.priceSource === 'upstox'
      ? 'Upstox live LTP'
      : t.priceSource === 'unknown'
        ? 'price source unknown (theoretical / hist gap)'
        : 'price source not tagged';

  const whyIn =
    t.option === 'CE'
      ? 'CCI crossed above 0 -> long ATM CE (bullish zero-cross + PA confirm).'
      : 'CCI crossed below 0 -> long ATM PE (bearish zero-cross + PA confirm).';

  let whyOut = 'Closed during session.';
  const note = String(t.note || '');
  if (/below min/i.test(note) || (entry > 0 && entry < JIMBO_MIN_OPTION_ENTRY_PREMIUM)) {
    whyOut = `Flattened under Jimbo min premium rule (no stock options below Rs ${JIMBO_MIN_OPTION_ENTRY_PREMIUM}).`;
  } else if (/theoretical SL\/Tgt/i.test(note)) {
    whyOut = 'Exit used theoretical SL/Tgt path because Upstox option history was unavailable for that contract.';
  } else if (/repriced from Upstox OHLC/i.test(note)) {
    whyOut = 'Exit premium taken from Upstox option OHLC / live mark.';
  } else if (move != null && move <= -9.5) {
    whyOut = 'Likely hit hard stop (~10 premium points) or adverse move to that depth.';
  } else if (move != null && move >= 17) {
    whyOut = 'Strong winner - likely target / MFE trail booked near peak strength.';
  } else if (move != null && move > 0 && t.peakPremium != null && t.peakPremium > entry) {
    whyOut = 'Winner with peak above entry - SL/Tgt or MFE trail booked open profit.';
  } else if (move != null && move < 0) {
    whyOut = 'Loser - stopped or trailed out as premium fell from entry.';
  } else if (move != null && Math.abs(move) < 0.5) {
    whyOut = 'Near scratch - little premium change between entry and exit.';
  }

  const contract =
    t.tradingSymbol || `${t.symbol} ${t.strike} ${t.option}`;

  return [
    `Trade ${index}. ${contract}`,
    `When: ${istClock(t.at)} -> ${istClock(t.exitAt)} IST`,
    `Premium: Rs ${entry.toFixed(2)} -> ${exit != null ? `Rs ${exit.toFixed(2)}` : '-'} (${pts(entry, exit)} pts)`,
    `Lot ${t.lotSize} x ${t.lots} · P&L ${fmtRs(t.pnl)} · ${src}`,
    `Entry: ${whyIn}`,
    `Exit: ${whyOut}`,
  ];
}

export function jimboDailyPdfPath(date: string): string {
  return path.join(getAppDataDir(), 'jimbo', 'reports', `Jimbo-Day-${date}.pdf`);
}

export function jimboDailyMetaPath(date: string): string {
  return path.join(getAppDataDir(), 'jimbo', 'reports', `Jimbo-Day-${date}.meta.json`);
}

export async function buildJimboDailyReportMeta(date: string): Promise<JimboDailyReportMeta> {
  const day = await loadJimboPaperBackupDay(date);
  const closed = (day.trades || []).filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0).length;
  const flats = closed.filter((t) => (t.pnl ?? 0) === 0).length;
  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const upstoxPriced = closed.filter((t) => t.priceSource === 'upstox').length;
  const unknownPriced = closed.filter((t) => t.priceSource && t.priceSource !== 'upstox').length;

  const tradeBlocks = closed
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((t, i) => explainTrade(t, i + 1));

  const best = closed.reduce<(typeof closed)[0] | null>((b, t) => {
    if (!b || (t.pnl ?? 0) > (b.pnl ?? 0)) return t;
    return b;
  }, null);
  const worst = closed.reduce<(typeof closed)[0] | null>((b, t) => {
    if (!b || (t.pnl ?? 0) < (b.pnl ?? 0)) return t;
    return b;
  }, null);

  return {
    date,
    title: `Jimbo Daily Paper - ${date}`,
    generatedAt: new Date().toISOString(),
    summary: {
      tradeCount: closed.length,
      wins,
      losses,
      flats,
      winRate: closed.length ? Math.round((wins / closed.length) * 100) : null,
      netPnl,
      upstoxPriced,
      unknownPriced,
    },
    sections: {
      opening: [
        `Jimbo paper stock-options session for ${date} (NSE F&O).`,
        'Signal: CCI(31) zero-cross + price-action confirm on liquid stocks.',
        'CE when CCI crosses up through 0; PE when CCI crosses down through 0.',
        'Paper fills aim to use live Upstox ATM option LTP (not Yahoo / not simulated premium walk).',
        `Session management ends ~15:12 IST. Min entry premium Rs ${JIMBO_MIN_OPTION_ENTRY_PREMIUM}.`,
      ],
      rules: [
        'Default hard SL ~10 premium points; target ~18 points (editable on desk).',
        'MFE profit trail: arm after ~7 pts peak, keep ~50% of peak MFE.',
        `No new entries on options priced below Rs ${JIMBO_MIN_OPTION_ENTRY_PREMIUM}.`,
        'One open Jimbo paper trade at a time.',
      ],
      tradeBlocks,
      deskSummary: [
        `Closed trades: ${closed.length} · Wins ${wins} · Losses ${losses}` +
          (flats ? ` · Flat ${flats}` : '') +
          (closed.length ? ` · Win rate ${Math.round((wins / closed.length) * 100)}%` : ''),
        `Day net P&L: ${fmtRs(netPnl)}`,
        `Priced on Upstox: ${upstoxPriced}/${closed.length}` +
          (unknownPriced ? ` · Other/unknown: ${unknownPriced}` : ''),
        best
          ? `Best: ${best.symbol} ${best.option} ${best.strike} ${fmtRs(best.pnl)}`
          : 'Best: -',
        worst
          ? `Worst: ${worst.symbol} ${worst.option} ${worst.strike} ${fmtRs(worst.pnl)}`
          : 'Worst: -',
      ],
      suggestions: [
        'Treat unknown-priced fills cautiously - prefer Upstox-tagged exits for journal trust.',
        'Sub-Rs10 premiums are blocked going forward (ITC-style cheap options were flattened).',
        'Review losers vs 10-pt hard SL - if many stop at ~10 pts, size/lot risk is working as designed.',
        'Winners with large peaks then smaller booked P&L show MFE trail / giveback - expected behaviour.',
      ],
    },
  };
}

function collectLines(meta: JimboDailyReportMeta): string[] {
  const out: string[] = [];
  const s = meta.summary;
  out.push(meta.title);
  out.push(`Generated ${meta.generatedAt.slice(0, 19)}Z`);
  out.push('');
  out.push(
    `Trades ${s.tradeCount} · W ${s.wins} / L ${s.losses}` +
      (s.winRate != null ? ` (${s.winRate}%)` : '') +
      ` · Net ${fmtRs(s.netPnl)}`
  );
  out.push(`Upstox-priced ${s.upstoxPriced}/${s.tradeCount}`);
  out.push('');

  const push = (title: string, lines?: string[]) => {
    if (!lines?.length) return;
    out.push(title);
    for (const line of lines) out.push(`- ${line}`);
    out.push('');
  };

  push('1. What Jimbo did today', meta.sections.opening);
  push('2. Exit rules used', meta.sections.rules);

  if (meta.sections.tradeBlocks.length) {
    out.push('3. Trades (with explanation)');
    out.push('');
    for (const block of meta.sections.tradeBlocks) {
      for (let i = 0; i < block.length; i++) {
        out.push(i === 0 ? block[i] : `  ${block[i]}`);
      }
      out.push('');
    }
  }

  push('4. Day summary', meta.sections.deskSummary);
  push('5. Notes for next session', meta.sections.suggestions);
  return out;
}

export async function writeJimboDailyReportPdf(
  meta: JimboDailyReportMeta,
  filePath?: string
): Promise<{ ok: boolean; path: string; bytes: number; error?: string }> {
  try {
    await ensureAppDataDir();
    const outPath = filePath || jimboDailyPdfPath(meta.date);
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    const maxChars = 72;

    const drawLine = (text: string, bold = false) => {
      const f = bold ? fontBold : font;
      const size = bold ? 11 : BODY;
      for (const line of wrapLines(text, maxChars)) {
        if (y < MARGIN + LINE) {
          page = doc.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }
        page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.1, 0.15, 0.25) });
        y -= LINE;
      }
    };

    for (const raw of collectLines(meta)) {
      if (!raw.trim()) {
        y -= LINE * 0.4;
        continue;
      }
      drawLine(raw, raw === meta.title || /^\d\./.test(raw));
    }

    const pdfBytes = await doc.save();
    await fs.writeFile(outPath, pdfBytes);
    await fs.writeFile(jimboDailyMetaPath(meta.date), JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true, path: outPath, bytes: pdfBytes.length };
  } catch (e) {
    return {
      ok: false,
      path: filePath || jimboDailyPdfPath(meta.date),
      bytes: 0,
      error: e instanceof Error ? e.message : 'PDF write failed',
    };
  }
}

export async function generateJimboDailyReport(date: string): Promise<{
  ok: boolean;
  path: string;
  meta: JimboDailyReportMeta;
  bytes: number;
  error?: string;
}> {
  const meta = await buildJimboDailyReportMeta(date);
  const written = await writeJimboDailyReportPdf(meta);
  return { ...written, meta };
}
