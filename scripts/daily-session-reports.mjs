/**
 * Daily session reports orchestrator (IST).
 *
 * Creates PDFs after market close (15:15 IST):
 *   - .data/reports/ATM-Lab-Report-{YYYY-MM-DD}.pdf
 *   - .data/reports/PinaxForge-Report-{YYYY-MM-DD}.pdf
 *   - .data/nexus-pulse/reports/daily/NexusPulse-Day-{YYYY-MM-DD}.pdf
 *
 * Usage:
 *   node scripts/daily-session-reports.mjs
 *   node scripts/daily-session-reports.mjs --force
 *   node scripts/daily-session-reports.mjs --date 2026-07-22 --force
 *   node scripts/daily-session-reports.mjs --check-gate
 *   npm run reports:daily
 *   npm run reports:daily -- --force --date 2026-07-22
 *
 * Schedule (recommended — Windows Task Scheduler):
 *   1. Double-click scripts\register-daily-reports.cmd once (as your user).
 *   2. Approve UAC / Task Scheduler prompts if Windows asks.
 *   3. Task name: TradeMindPro-DailySessionReports
 *      Runs weekdays at 15:20 India Standard Time, calls this script.
 *   4. Manual: Task Scheduler → Task Scheduler Library → run that task,
 *      or: npm run reports:daily -- --force
 *
 * Belt-and-suspenders: npm run live also triggers this once per IST day
 * after 15:15 if the PDFs are not yet written.
 *
 * Does NOT touch Blink/PinaxForge trading logic — report generation only.
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, '.data', 'reports');
const STATE_DIR = join(ROOT, '.data');
const CUTOFF_MINUTES = 15 * 60 + 15; // 15:15 IST

function parseArgs(argv) {
  const out = { force: false, date: null, checkGate: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force' || a === '-f') out.force = true;
    else if (a === '--check-gate') out.checkGate = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--date') {
      out.date = argv[++i];
    } else if (a.startsWith('--date=')) {
      out.date = a.slice('--date='.length);
    }
  }
  return out;
}

/** Current wall-clock parts in Asia/Kolkata. */
function istNowParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    second: Number(parts.second),
    weekday: parts.weekday,
    minutesOfDay: hour * 60 + minute,
  };
}

function afterCutoff(parts) {
  return parts.minutesOfDay >= CUTOFF_MINUTES;
}

function pythonCmd() {
  // Prefer `py -3` on Windows, fall back to python / python3
  if (process.platform === 'win32') {
    const py = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (py.status === 0 && py.stdout?.trim()) return { cmd: 'py', prefix: ['-3'] };
  }
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (r.status === 0) return { cmd, prefix: [] };
  }
  return null;
}

function runPython(scriptRel, date) {
  const py = pythonCmd();
  if (!py) {
    return { ok: false, code: 127, out: 'Python not found (need py/python with fpdf).' };
  }
  const script = join(ROOT, scriptRel);
  const args = [...py.prefix, script, date];
  const r = spawnSync(py.cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  // 0 = ok with data, 2 = honest missing-data PDF written
  const code = r.status ?? 1;
  return { ok: code === 0 || code === 2, code, out, missing: code === 2 };
}

function stampPath(date) {
  return join(STATE_DIR, `daily-reports-done-${date}.json`);
}

function markDone(date, results) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    stampPath(date),
    JSON.stringify({ date, at: new Date().toISOString(), results }, null, 2),
    'utf8'
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/daily-session-reports.mjs [--force] [--date YYYY-MM-DD] [--check-gate]
Generates ATM Lab + PinaxForge PDFs into .data/reports/ after 15:15 IST.`);
    process.exit(0);
  }

  const now = istNowParts();
  const date = args.date || now.date;

  if (args.checkGate) {
    const ok = afterCutoff(now);
    console.log(
      JSON.stringify(
        {
          istDate: now.date,
          istTime: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`,
          cutoff: '15:15',
          afterCutoff: ok,
          wouldGenerateWithoutForce: ok,
        },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 3);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`Invalid --date ${date} (want YYYY-MM-DD)`);
    process.exit(1);
  }

  console.log(`[reports] IST now ${now.date} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')} | target date ${date}`);

  if (!args.force && !afterCutoff(now)) {
    console.log(
      `[reports] Too early — waits until 15:15 IST (use --force to override). Gate: BLOCKED.`
    );
    process.exit(3);
  }
  if (args.force && !afterCutoff(now)) {
    console.log(`[reports] --force: generating before 15:15 IST.`);
  } else {
    console.log(`[reports] After 15:15 IST gate: OK`);
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const atmSrc = join(ROOT, '.data', `blink-atm-movement-${date}.jsonl`);
  const pinaxSrc = join(ROOT, '.data', `pinax-forge-session-${date}.json`);
  const results = { atm: null, pinax: null, nexus: null };

  // ATM Lab
  if (!existsSync(atmSrc)) {
    console.log(`[reports] SKIP ATM Lab — missing ${atmSrc}`);
    results.atm = { skipped: true, reason: 'missing_source' };
  } else {
    console.log(`[reports] Generating ATM Lab report…`);
    const r = runPython(join('.data', 'reports', 'generate_atm_lab_report.py'), date);
    console.log(r.out || '(no output)');
    const pdf = join(REPORTS_DIR, `ATM-Lab-Report-${date}.pdf`);
    if (r.ok && existsSync(pdf)) {
      results.atm = { ok: true, pdf, missingData: !!r.missing };
      console.log(`[reports] ATM Lab PDF: ${pdf}`);
    } else {
      results.atm = { ok: false, error: r.out, code: r.code };
      console.error(`[reports] ATM Lab PDF failed (exit ${r.code})`);
    }
  }

  // PinaxForge
  if (!existsSync(pinaxSrc)) {
    console.log(`[reports] SKIP PinaxForge — missing ${pinaxSrc}`);
    results.pinax = { skipped: true, reason: 'missing_source' };
  } else {
    console.log(`[reports] Generating PinaxForge report…`);
    const r = runPython(join('.data', 'reports', 'generate_pinaxforge_report.py'), date);
    console.log(r.out || '(no output)');
    const pdf = join(REPORTS_DIR, `PinaxForge-Report-${date}.pdf`);
    if (r.ok && existsSync(pdf)) {
      results.pinax = { ok: true, pdf, missingData: !!r.missing };
      console.log(`[reports] PinaxForge PDF: ${pdf}`);
    } else {
      results.pinax = { ok: false, error: r.out, code: r.code };
      console.error(`[reports] PinaxForge PDF failed (exit ${r.code})`);
    }
  }

  // NexusPulse — simple daily mobile PDF (uses trade archive by date)
  const nexusArchive = join(ROOT, '.data', 'nexus-pulse', 'trades', 'paper', `${date}.json`);
  const nexusSession = join(ROOT, '.data', `nexus-pulse-session-${date}.json`);
  if (!existsSync(nexusArchive) && !existsSync(nexusSession)) {
    console.log(`[reports] SKIP NexusPulse daily — no paper archive or session for ${date}`);
    results.nexus = { skipped: true, reason: 'missing_source' };
  } else {
    console.log(`[reports] Generating NexusPulse daily report…`);
    const r = runPython('scripts/generate-nexus-daily-report.py', date);
    console.log(r.out || '(no output)');
    const pdf = join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily', `NexusPulse-Day-${date}.pdf`);
    if (r.ok && existsSync(pdf)) {
      results.nexus = { ok: true, pdf };
      console.log(`[reports] NexusPulse daily PDF: ${pdf}`);
    } else {
      results.nexus = { ok: false, error: r.out, code: r.code };
      console.error(`[reports] NexusPulse daily PDF failed (exit ${r.code})`);
    }
  }

  markDone(date, results);

  const anyOk =
    (results.atm && results.atm.ok) ||
    (results.pinax && results.pinax.ok) ||
    (results.nexus && results.nexus.ok);
  const allSkipped =
    results.atm?.skipped && results.pinax?.skipped && results.nexus?.skipped;
  if (allSkipped) {
    console.log('[reports] Done — all sources missing; nothing generated.');
    process.exit(2);
  }
  if (!anyOk) {
    console.error('[reports] Done — generation failed.');
    process.exit(1);
  }
  console.log('[reports] Done.');
  process.exit(0);
}

main();
