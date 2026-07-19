import { existsSync, readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.purge.tmp');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
}

console.log('URL set?', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()));
console.log('SECRET set?', Boolean(process.env.SUPABASE_SECRET_KEY?.trim()));

const { cloudPurgeTestUsers, cloudListUsers } = await import('../src/lib/cloud-auth.ts');
const before = await cloudListUsers();
console.log(
  'Before:',
  before.map((u) => u.email)
);
const result = await cloudPurgeTestUsers();
console.log(JSON.stringify(result, null, 2));
const after = await cloudListUsers();
console.log(
  'After:',
  after.map((u) => `${u.email} (${u.role})`)
);

if (existsSync(envPath) && result.ok) {
  try {
    unlinkSync(envPath);
  } catch {
    /* ignore */
  }
}

if (!result.ok) process.exit(1);
