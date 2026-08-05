/**
 * One-shot: build Jimbo daily PDF from `.data/jimbo/trades/paper/YYYY-MM-DD.json`.
 * Usage: node scripts/jimbo-daily-report.mjs [YYYY-MM-DD]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const MIN_PREM = 10;

function pdfSafe(s) {
  return String(s)
    .replace(/\u20b9/g, 'Rs')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

function wrapLines(text, maxChars) {
  const words = pdfSafe(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function istClock(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtRs(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  return `${n > 0 ? '+' : ''}Rs ${Math.round(n)}`;
}

function explain(t, i) {
  const entry = t.entryPremium;
  const exit = t.exitPremium;
  const move = exit != null ? exit - entry : null;
  const note = String(t.note || '');
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
  if (/below min/i.test(note) || (entry > 0 && entry < MIN_PREM)) {
    whyOut = `Flattened under Jimbo min premium rule (no stock options below Rs ${MIN_PREM}).`;
  } else if (/theoretical SL\/Tgt/i.test(note)) {
    whyOut =
      'Exit used theoretical SL/Tgt path because Upstox option history was unavailable for that contract.';
  } else if (/repriced from Upstox OHLC/i.test(note)) {
    whyOut = 'Exit premium taken from Upstox option OHLC / live mark.';
  } else if (move != null && move <= -9.5) {
    whyOut = 'Likely hit hard stop (~10 premium points) or adverse move to that depth.';
  } else if (move != null && move >= 17) {
    whyOut = 'Strong winner - likely target / MFE trail booked near peak strength.';
  } else if (move != null && move > 0) {
    whyOut = 'Winner - SL/Tgt or MFE trail booked open profit.';
  } else if (move != null && move < 0) {
    whyOut = 'Loser - stopped or trailed out as premium fell from entry.';
  } else if (move != null && Math.abs(move) < 0.5) {
    whyOut = 'Near scratch - little premium change between entry and exit.';
  }

  const pts =
    exit != null
      ? `${move > 0 ? '+' : ''}${Math.round(move * 100) / 100}`
      : '-';
  const contract = t.tradingSymbol || `${t.symbol} ${t.strike} ${t.option}`;

  return [
    `Trade ${i}. ${contract}`,
    `When: ${istClock(t.at)} -> ${istClock(t.exitAt)} IST`,
    `Premium: Rs ${Number(entry).toFixed(2)} -> ${
      exit != null ? `Rs ${Number(exit).toFixed(2)}` : '-'
    } (${pts} pts)`,
    `Lot ${t.lotSize} x ${t.lots} · P&L ${fmtRs(t.pnl)} · ${src}`,
    `Entry: ${whyIn}`,
    `Exit: ${whyOut}`,
  ];
}

async function main() {
  const date = (process.argv[2] || '2026-08-05').slice(0, 10);
  const dayPath = path.join(root, '.data', 'jimbo', 'trades', 'paper', `${date}.json`);
  const outDir = path.join(root, '.data', 'jimbo', 'reports');
  const outPath = path.join(outDir, `Jimbo-Day-${date}.pdf`);
  const metaPath = path.join(outDir, `Jimbo-Day-${date}.meta.json`);

  const day = JSON.parse(await fs.readFile(dayPath, 'utf8'));
  const closed = (day.trades || [])
    .filter((t) => t.status === 'closed')
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
  const losses = closed.filter((t) => (t.pnl || 0) < 0).length;
  const net = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const upstox = closed.filter((t) => t.priceSource === 'upstox').length;
  const unknown = closed.filter((t) => t.priceSource && t.priceSource !== 'upstox').length;
  const best = closed.reduce((b, t) => (!b || (t.pnl || 0) > (b.pnl || 0) ? t : b), null);
  const worst = closed.reduce((b, t) => (!b || (t.pnl || 0) < (b.pnl || 0) ? t : b), null);

  const lines = [];
  lines.push(`Jimbo Daily Paper - ${date}`);
  lines.push(`Generated ${new Date().toISOString().slice(0, 19)}Z`);
  lines.push('');
  lines.push(
    `Trades ${closed.length} · W ${wins} / L ${losses}` +
      (closed.length ? ` (${Math.round((wins / closed.length) * 100)}%)` : '') +
      ` · Net ${fmtRs(net)}`
  );
  lines.push(`Upstox-priced ${upstox}/${closed.length}`);
  lines.push('');
  lines.push('1. What Jimbo did today');
  lines.push('- Jimbo paper stock-options session (NSE F&O).');
  lines.push('- Signal: CCI(31) zero-cross + price-action confirm on liquid stocks.');
  lines.push('- CE when CCI crosses up through 0; PE when CCI crosses down through 0.');
  lines.push('- Paper fills aim to use live Upstox ATM option LTP.');
  lines.push(`- Session ends ~15:12 IST. Min entry premium Rs ${MIN_PREM}.`);
  lines.push('');
  lines.push('2. Exit rules used');
  lines.push('- Default hard SL ~10 premium points; target ~18 points.');
  lines.push('- MFE trail: arm after ~7 pts peak, keep ~50% of peak MFE.');
  lines.push(`- No new entries below Rs ${MIN_PREM} premium.`);
  lines.push('- One open Jimbo paper trade at a time.');
  lines.push('');
  lines.push('3. Trades (with explanation)');
  lines.push('');
  closed.forEach((t, i) => {
    for (const row of explain(t, i + 1)) lines.push(row);
    lines.push('');
  });
  lines.push('4. Day summary');
  lines.push(
    `- Closed trades: ${closed.length} · Wins ${wins} · Losses ${losses}` +
      (closed.length ? ` · Win rate ${Math.round((wins / closed.length) * 100)}%` : '')
  );
  lines.push(`- Day net P&L: ${fmtRs(net)}`);
  lines.push(
    `- Priced on Upstox: ${upstox}/${closed.length}` +
      (unknown ? ` · Other/unknown: ${unknown}` : '')
  );
  if (best) lines.push(`- Best: ${best.symbol} ${best.option} ${best.strike} ${fmtRs(best.pnl)}`);
  if (worst)
    lines.push(`- Worst: ${worst.symbol} ${worst.option} ${worst.strike} ${fmtRs(worst.pnl)}`);
  lines.push('');
  lines.push('5. Notes for next session');
  lines.push('- Treat unknown-priced fills cautiously for journal trust.');
  lines.push(`- Sub-Rs${MIN_PREM} premiums are blocked going forward.`);
  lines.push('- Review losers vs 10-pt hard SL for lot risk sizing.');
  lines.push('- Winners with peak then smaller booked P&L show MFE trail giveback.');

  await fs.mkdir(outDir, { recursive: true });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 420;
  const PAGE_H = 595;
  const MARGIN = 36;
  const LINE = 11;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const draw = (text, bold = false) => {
    const f = bold ? fontBold : font;
    const size = bold ? 11 : 9;
    for (const line of wrapLines(text, 72)) {
      if (y < MARGIN + LINE) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.1, 0.15, 0.25) });
      y -= LINE;
    }
  };

  for (const raw of lines) {
    if (!String(raw).trim()) {
      y -= LINE * 0.4;
      continue;
    }
    draw(raw, raw.startsWith('Jimbo Daily') || /^\d\./.test(raw));
  }

  const bytes = await doc.save();
  await fs.writeFile(outPath, bytes);
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        date,
        netPnl: net,
        trades: closed.length,
        wins,
        losses,
        upstox,
        unknown,
        path: outPath,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ ok: true, path: outPath, bytes: bytes.length, net, trades: closed.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
