/**
 * Push NexusPulse daily report index (.data/...) to Supabase user_kv (admin).
 * Usage: node scripts/sync-nexus-daily-db.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily', 'index.json');
const DB_KEY = 'nexus_pulse_daily_reports_v1';

function loadEnvLocal() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/$/, '');
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !key) {
  console.error('Missing Supabase URL or service key in .env.local');
  process.exit(1);
}

if (!existsSync(INDEX)) {
  console.error(`Missing ${INDEX} — run generate-nexus-daily-report.py first`);
  process.exit(1);
}

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const reports = index.reports || [];

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: admin, error: adminErr } = await sb
  .from('profiles')
  .select('id')
  .eq('role', 'admin')
  .limit(1)
  .maybeSingle();

if (adminErr || !admin?.id) {
  console.error('No admin profile:', adminErr?.message || 'not found');
  process.exit(1);
}

const payload = {
  agent: 'NexusPulse',
  updatedAt: new Date().toISOString(),
  reports,
};

const { error } = await sb.from('user_kv').upsert(
  {
    user_id: admin.id,
    key: DB_KEY,
    value: payload,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'user_id,key' }
);

if (error) {
  console.error('Upsert failed:', error.message);
  process.exit(1);
}

console.log(`Synced ${reports.length} NexusPulse daily report(s) to user_kv (${DB_KEY}) for admin ${admin.id}`);
