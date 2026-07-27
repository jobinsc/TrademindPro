/**
 * NexusPulse daily report — generate mobile PDF + update date index.
 * Usage: node scripts/nexus-daily-report.mjs [YYYY-MM-DD]
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function istDate() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const date = process.argv[2] || istDate();
const py = process.platform === 'win32' ? 'py' : 'python3';
const pyArgs =
  process.platform === 'win32'
    ? ['-3', join(ROOT, 'scripts', 'generate-nexus-daily-report.py'), date]
    : [join(ROOT, 'scripts', 'generate-nexus-daily-report.py'), date];

const r = spawnSync(py, pyArgs, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout || 'generate failed');
  process.exit(r.status ?? 1);
}
console.log(r.stdout.trim().split('\n').filter(Boolean).pop() || 'OK');
console.log(`Saved: .data/nexus-pulse/reports/daily/NexusPulse-Day-${date}.pdf`);
