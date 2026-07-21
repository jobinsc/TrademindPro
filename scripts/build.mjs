/**
 * Production build into `.next-build` so it never wipes or races the
 * Turbopack/webpack `.next` folder used by `npm run dev`.
 */
import { spawn } from 'child_process';
import { join } from 'path';

const root = process.cwd();
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextCli, 'build'], {
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
