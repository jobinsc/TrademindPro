/**
 * Stable local dev — keeps the server up through crashes and avoids
 * fighting production builds for the same `.next` folder.
 *
 * Critical: do NOT kill port 3000 if something is already serving.
 * Agent / duplicate `npm run dev` used to kill a healthy server, then exit,
 * leaving ERR_CONNECTION_REFUSED.
 *
 * Use `npm run dev -- --force` (or `node scripts/dev.mjs --force`) to restart.
 */
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { killPort } from './kill-port.mjs';

const root = process.cwd();
const nextDir = join(root, '.next');
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const useWebpack = process.argv.includes('--webpack');
const forceClean = process.argv.includes('--clean');
const forceRestart = process.argv.includes('--force');

let stopping = false;
let child = null;
const MAX_FAST_RESTARTS = 8;
const FAST_WINDOW_MS = 60_000;
const restartTimes = [];

function log(msg) {
  console.log(`[dev] ${msg}`);
}

function rmSafe(dir) {
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* locked — next start may still work */
  }
}

/** Leftover production BUILD_ID in `.next` breaks Turbopack HMR. */
function hadProductionBuild() {
  return existsSync(join(nextDir, 'BUILD_ID'));
}

function cleanDevArtifacts() {
  if (forceClean || hadProductionBuild()) {
    log(
      forceClean
        ? 'Full clean (.next removed)'
        : 'Removing .next (stale production BUILD_ID in dev cache)'
    );
    rmSafe(nextDir);
    return;
  }

  // Only clear caches when we are intentionally (re)starting — never while
  // another healthy server owns the port.
  rmSafe(join(nextDir, 'cache'));
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** True if http://127.0.0.1:3000 already answers. */
function isPortServing() {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: 3000, path: '/', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function shouldRestart() {
  const now = Date.now();
  while (restartTimes.length && now - restartTimes[0] > FAST_WINDOW_MS) {
    restartTimes.shift();
  }
  if (restartTimes.length >= MAX_FAST_RESTARTS) {
    log(
      `Stopped auto-restart after ${MAX_FAST_RESTARTS} crashes in ${FAST_WINDOW_MS / 1000}s — fix the error, then run npm run dev again.`
    );
    return false;
  }
  restartTimes.push(now);
  return true;
}

function startNext() {
  const args = [nextCli, 'dev', '-p', '3000'];
  if (!useWebpack) {
    args.push('--turbo');
  }

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

    log(
      `Next.js exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}) — restarting in 1s…`
    );
    if (!shouldRestart()) {
      process.exit(code ?? 1);
      return;
    }
    await waitMs(1000);
    if (stopping) return;
    killPort(3000);
    await waitMs(400);
    startNext();
  });
}

function onStop() {
  if (stopping) return;
  stopping = true;
  log('Shutting down…');
  if (child && !child.killed) {
    child.kill('SIGTERM');
  } else {
    process.exit(0);
  }
}

async function main() {
  process.on('SIGINT', onStop);
  process.on('SIGTERM', onStop);

  const alreadyUp = await isPortServing();
  if (alreadyUp && !forceRestart) {
    log('http://127.0.0.1:3000 is already serving — leaving it alone.');
    log('Open that URL in the browser. To restart: npm run dev -- --force');
    process.exit(0);
  }

  if (forceRestart || alreadyUp) {
    log('Freeing port 3000 (--force)…');
    killPort(3000);
    await waitMs(800);
  } else {
    // Port free or dead occupant — clear listeners only if something is bound
    // but not answering (zombie). killPort is a no-op when nothing listens.
    killPort(3000);
    await waitMs(400);
  }

  cleanDevArtifacts();

  if (!useWebpack) {
    log('Starting with Turbopack (use npm run dev:webpack if needed)');
  } else {
    log('Starting with Webpack');
  }
  log('Auto-restart ON — Ctrl+C to stop. Keep this window open while you work.');

  startNext();
}

main().catch((e) => {
  console.error('[dev] Failed to start:', e);
  process.exit(1);
});
