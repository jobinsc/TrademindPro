/**
 * NexusPulse daily report PDF — pure Node (no Python). Mobile / production safe.
 */

import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { NexusBDailyReportMeta } from '@/lib/nexus-pulse-b/daily-report-store';
import { dailyPdfPath } from '@/lib/nexus-pulse-b/daily-report-store';

const PAGE_W = 420; // A5 width pt
const PAGE_H = 595;
const MARGIN = 36;
const LINE = 11;
const BODY = 9;

function pdfSafe(s: string): string {
  return s
    .replace(/\u20b9/g, 'Rs')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
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

function collectLines(meta: NexusBDailyReportMeta): string[] {
  const out: string[] = [];
  out.push(meta.title);
  out.push(`Generated ${meta.generatedAt.slice(0, 19)}Z`);
  if (meta.reportSource === 'real_option_replay') {
    out.push('Source: Real Option Study replay (Upstox)');
  }
  if (meta.premiumModel) out.push(meta.premiumModel);
  out.push('');
  const s = meta.summary;
  out.push(
    `Trades ${s.tradeCount} · W ${s.wins} / L ${s.losses}` +
      (s.winRate != null ? ` (${s.winRate}%)` : '') +
      ` · Net ~Rs ${Math.round(s.netAfter70)}`
  );
  if (s.gross != null) out.push(`Gross Rs ${Math.round(s.gross)} · Cost Rs ${Math.round(s.brokerage ?? 0)}`);
  out.push('');

  const pushSection = (title: string, lines?: string[]) => {
    if (!lines?.length) return;
    out.push(title);
    for (const line of lines) out.push(`· ${line}`);
    out.push('');
  };

  pushSection('1. What happened', meta.sections?.opening);
  pushSection('2. Market', meta.sections?.market);
  pushSection('Study by lane', meta.sections?.studyByLane);
  pushSection('3. Calculation', meta.sections?.calc);

  if (meta.sections?.tradeBlocks?.length) {
    out.push('4. Trades');
    for (const block of meta.sections.tradeBlocks) {
      for (let i = 0; i < block.length; i++) {
        out.push(i === 0 ? block[i] : `  · ${block[i]}`);
      }
      out.push('');
    }
  }

  pushSection('5. Summary', meta.sections?.deskSummary);
  pushSection('6. Suggestions', meta.sections?.suggestions);

  if (!meta.sections && meta.simpleStory?.length) {
    pushSection('Story', meta.simpleStory);
  }

  return out;
}

export async function writeNexusBDailyReportPdf(
  meta: NexusBDailyReportMeta,
  filePath?: string
): Promise<{ ok: boolean; path: string; bytes: number; error?: string }> {
  try {
    const outPath = filePath || dailyPdfPath(meta.date);
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
      const isTitle = raw === meta.title;
      drawLine(raw, isTitle);
    }

    const pdfBytes = await doc.save();
    await fs.writeFile(outPath, pdfBytes);
    return { ok: true, path: outPath, bytes: pdfBytes.length };
  } catch (e) {
    return {
      ok: false,
      path: filePath || dailyPdfPath(meta.date),
      bytes: 0,
      error: e instanceof Error ? e.message : 'PDF write failed',
    };
  }
}

export async function ensureNexusBDailyReportPdf(date: string): Promise<Buffer | null> {
  const pdfPath = dailyPdfPath(date);
  try {
    return await fs.readFile(pdfPath);
  } catch {
    /* generate below */
  }
  const { loadDailyReportMeta } = await import('@/lib/nexus-pulse-b/daily-report-store');
  const meta = await loadDailyReportMeta(date);
  if (!meta) return null;
  const w = await writeNexusBDailyReportPdf(meta, pdfPath);
  if (!w.ok) return null;
  try {
    return await fs.readFile(pdfPath);
  } catch {
    return null;
  }
}
