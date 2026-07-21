/**
 * Serve the production build from `.next-build` (see scripts/build.mjs).
 */
import { spawn } from 'child_process';
import { join } from 'path';

const root = process.cwd();
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextCli, 'start', '-p', process.env.PORT || '3000'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: '.next-build',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
