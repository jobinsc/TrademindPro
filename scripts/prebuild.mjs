/**
 * Production builds use `.next-build` (see next.config.mjs + build.mjs).
 * Do NOT kill port 3000 — that was stopping the live `npm run dev` server
 * whenever anything ran `next build` (agents, CI helpers, accidental builds).
 */
console.log('[prebuild] Using separate .next-build — leaving port 3000 / `npm run dev` alone.');
