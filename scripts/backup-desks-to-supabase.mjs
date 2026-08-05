/**
 * Backup local paper desks to Supabase (user_kv):
 * - NexusPulse A (via existing paths)
 * - NexusPulse B sessions + trade archives
 * - Jimbo paper day files + daily PDF
 *
 * Usage: node scripts/backup-desks-to-supabase.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const adminId = admin.id;
const BUCKET = 'nexus-pulse';

async function upsertKv(k, value) {
  const { error } = await sb.from('user_kv').upsert(
    {
      user_id: adminId,
      key: k,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );
  if (error) throw new Error(`${k}: ${error.message}`);
  console.log(`KV ok: ${k}`);
}

function listDayJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      console.warn('Bucket create:', error.message);
    }
  }
}

await ensureBucket();

// --- Sector 7 A trades ---
const aIndex = { paper: [], live: [], updatedAt: new Date().toISOString() };
for (const mode of ['paper', 'live']) {
  const dir = join(ROOT, '.data', 'nexus-pulse', 'trades', mode);
  for (const name of listDayJson(dir)) {
    const date = name.replace('.json', '');
    const body = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    await upsertKv(`nexus_pulse_trades_${mode}_${date}`, body);
    aIndex[mode].push(date);
  }
}
await upsertKv('nexus_pulse_trade_index_v1', aIndex);

// --- Sector 7 B trades ---
const bIndex = { paper: [], live: [], updatedAt: new Date().toISOString() };
for (const mode of ['paper', 'live']) {
  const dir = join(ROOT, '.data', 'nexus-pulse-b', 'trades', mode);
  for (const name of listDayJson(dir)) {
    const date = name.replace('.json', '');
    const body = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    await upsertKv(`nexus_pulse_b_trades_${mode}_${date}`, body);
    bIndex[mode].push(date);
  }
}
await upsertKv('nexus_pulse_b_trade_index_v1', bIndex);

// --- Daily sessions A/B ---
const dataRoot = join(ROOT, '.data');
if (existsSync(dataRoot)) {
  for (const name of readdirSync(dataRoot)) {
    if (/^nexus-pulse-session-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
      const date = name.match(/(\d{4}-\d{2}-\d{2})/)[1];
      const body = JSON.parse(readFileSync(join(dataRoot, name), 'utf8'));
      await upsertKv(`nexus_pulse_session_${date}`, body);
    }
    if (/^nexus-pulse-b-session-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
      const date = name.match(/(\d{4}-\d{2}-\d{2})/)[1];
      const body = JSON.parse(readFileSync(join(dataRoot, name), 'utf8'));
      await upsertKv(`nexus_pulse_b_session_${date}`, body);
    }
  }
}

// --- Jimbo paper ---
const jimboIndex = { paper: [], updatedAt: new Date().toISOString() };
const jimboDir = join(ROOT, '.data', 'jimbo', 'trades', 'paper');
for (const name of listDayJson(jimboDir)) {
  const date = name.replace('.json', '');
  const body = JSON.parse(readFileSync(join(jimboDir, name), 'utf8'));
  await upsertKv(`jimbo_trades_paper_${date}`, body);
  jimboIndex.paper.push(date);
}
const jimboLatest = join(jimboDir, '_latest.json');
if (existsSync(jimboLatest)) {
  await upsertKv('jimbo_trades_paper_latest', JSON.parse(readFileSync(jimboLatest, 'utf8')));
}
await upsertKv('jimbo_trade_index_v1', jimboIndex);

// Jimbo PDF(s)
const jimboReports = join(ROOT, '.data', 'jimbo', 'reports');
if (existsSync(jimboReports)) {
  for (const name of readdirSync(jimboReports)) {
    if (!/^Jimbo-Day-\d{4}-\d{2}-\d{2}\.pdf$/.test(name)) continue;
    const buf = readFileSync(join(jimboReports, name));
    const path = `reports/jimbo/${name}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
      upsert: true,
      contentType: 'application/pdf',
    });
    if (error) console.error(`PDF ${name}:`, error.message);
    else console.log(`PDF uploaded: ${path}`);
  }
}

await upsertKv('desk_backup_meta_v1', {
  backedUpAt: new Date().toISOString(),
  aTradeDays: aIndex.paper.length,
  bTradeDays: bIndex.paper.length,
  jimboTradeDays: jimboIndex.paper.length,
  note: 'Local desk paper backup to Supabase user_kv + storage',
});

console.log('Desk backup to Supabase complete.');
