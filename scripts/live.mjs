/**
 * LIVE SESSION — run inside a Cursor terminal:
 *   npm run live
 *
 * Do NOT open external Windows cmd windows.
 * Keep that one Cursor terminal tab open while observing.
 *
 * Permanent behaviour:
 *  - NEVER exits when :3000 is already up — stays as watchdog
 *  - uses /api/live-ping (instant) not /api/health (slow Yahoo calls)
 *  - restarts only after sustained ping failures (~2.5 min)
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import { join } from 'path';
import { killPort } from './kill-port.mjs';

const root = process.cwd();
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const PORT = 3000;
const PING_PATH = '/api/live-ping';
const HEALTH_MS = 15000;
const FAIL_BEFORE_RESTART = 10; // ~150s sustained failure before restart
const RESTART_DELAY_MS = 2000;
const BOOT_GRACE_MS = 25000;
const PING_TIMEOUT_MS = 8000;
const REPORTS_CHECK_MS = 60_000; // once per minute after boot
const REPORTS_CUTOFF_MIN = 15 * 60 + 15; // 15:15 IST

let stopping = false;
let child = null;
let healthTimer = null;
let reportsTimer = null;
let failStreak = 0;
let restartCount = 0;
let bootUntil = 0;
let watchdogOnly = false;
let reportsTriggeredForDate = null;

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`[live ${ts}] ${msg}`);
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pingOk() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: PING_PATH,
        timeout: PING_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function stopHealth() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (reportsTimer) {
    clearInterval(reportsTimer);
    reportsTimer = null;
  }
}

/** IST calendar date + minutes-from-midnight. */
function istParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: hour * 60 + minute,
  };
}

function maybeRunDailyReports() {
  if (stopping) return;
  const { date, minutesOfDay } = istParts();
  if (minutesOfDay < REPORTS_CUTOFF_MIN) return;
  if (reportsTriggeredForDate === date) return;

  const atmPdf = join(root, '.data', 'reports', `ATM-Lab-Report-${date}.pdf`);
  const pinaxPdf = join(root, '.data', 'reports', `PinaxForge-Report-${date}.pdf`);
  const stamp = join(root, '.data', `daily-reports-done-${date}.json`);
  const nexusDaily = join(
    root,
    '.data',
    'nexus-pulse',
    'reports',
    'daily',
    `NexusPulse-Day-${date}.pdf`
  );
  if (existsSync(stamp) && existsSync(atmPdf) && existsSync(pinaxPdf) && existsSync(nexusDaily)) {
    reportsTriggeredForDate = date;
    return;
  }

  reportsTriggeredForDate = date;
  log(`After 15:15 IST — writing daily session PDFs for ${date}…`);
  const script = join(root, 'scripts', 'daily-session-reports.mjs');
  const childProc = spawn(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  childProc.on('exit', (code) => {
    log(`Daily reports finished (code=${code ?? 'null'}).`);
  });
}

function startHealth() {
  stopHealth();
  failStreak = 0;
  healthTimer = setInterval(async () => {
    if (stopping) return;
    if (Date.now() < bootUntil) return;

    const ok = await pingOk();
    if (ok) {
      if (failStreak > 0) log('Server ping recovered.');
      failStreak = 0;
      return;
    }
    failStreak += 1;
    log(`Ping miss ${failStreak}/${FAIL_BEFORE_RESTART} (${PING_PATH})`);
    if (failStreak >= FAIL_BEFORE_RESTART) {
      failStreak = 0;
      log('Server not answering — restarting Next.js…');
      watchdogOnly = false;
      await restart('ping-fail');
    }
  }, HEALTH_MS);

  // Belt-and-suspenders: if live stays open past 15:15 IST, generate PDFs once.
  reportsTimer = setInterval(() => {
    try {
      maybeRunDailyReports();
    } catch (e) {
      log(`Daily reports check failed: ${e?.message || e}`);
    }
  }, REPORTS_CHECK_MS);
  setTimeout(() => {
    try {
      maybeRunDailyReports();
    } catch {
      /* ignore */
    }
  }, 5000);
}

function killChild() {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      child = null;
      resolve();
      return;
    }
    const proc = child;
    child = null;
    proc.once('exit', () => resolve());
    try {
      proc.kill('SIGTERM');
    } catch {
      resolve();
      return;
    }
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve();
    }, 2500);
  });
}

async function restart(reason) {
  if (stopping) return;
  restartCount += 1;
  log(`Restart #${restartCount} (${reason})`);
  stopHealth();
  await killChild();
  killPort(PORT);
  await waitMs(RESTART_DELAY_MS);
  if (stopping) return;
  startNext();
}

function startNext() {
  watchdogOnly = false;
  const args = [nextCli, 'dev', '-p', String(PORT)];
  bootUntil = Date.now() + BOOT_GRACE_MS;
  log('Starting Next.js on :3000 — leave THIS Cursor terminal tab open.');
  child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', async (code, signal) => {
    child = null;
    if (stopping) {
      process.exit(code ?? 0);
      return;
    }
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      process.exit(0);
      return;
    }
    log(`Next.js exited (code=${code ?? 'null'}) — auto-restarting in ${RESTART_DELAY_MS}ms…`);
    await waitMs(RESTART_DELAY_MS);
    if (stopping) return;
    killPort(PORT);
    await waitMs(500);
    startNext();
    setTimeout(() => {
      if (!stopping) startHealth();
    }, BOOT_GRACE_MS);
  });

  setTimeout(() => {
    if (!stopping) startHealth();
  }, BOOT_GRACE_MS);
}

async function onStop() {
  if (stopping) return;
  stopping = true;
  log('Shutting down live session…');
  stopHealth();
  await killChild();
  process.exit(0);
}

async function main() {
  process.on('SIGINT', () => void onStop());
  process.on('SIGTERM', () => void onStop());

  log('TradePinax LIVE — Cursor Terminal only (no external cmd).');

  if (await pingOk()) {
    watchdogOnly = true;
    log(`http://127.0.0.1:${PORT} is up — watchdog attached (will restart if it dies).`);
    log('Leave THIS terminal tab open while PinaxForge / Blink / paper runs.');
    startHealth();
    return;
  }

  killPort(PORT);
  await waitMs(600);
  startNext();
}

main().catch((e) => {
  console.error('[live] Failed:', e);
  process.exit(1);
});
