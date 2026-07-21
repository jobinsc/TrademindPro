/**
 * Production builds use `.next-build` (see next.config.mjs + build.mjs).
 * Do NOT kill port 3000 — that was stopping the live `npm run dev` server
 * whenever anything ran `next build` (agents, CI helpers, accidental builds).
 */
const distDir = process.env.VERCEL ? '.next' : '.next-build';
console.log(
  `[prebuild] Building into ${distDir} — leaving port 3000 / \`npm run dev\` alone.`
);
