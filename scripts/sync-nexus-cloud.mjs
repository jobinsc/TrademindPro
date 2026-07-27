/**
 * Push NexusPulse local `.data` to Supabase (trades, PDFs, strategy, daily index).
 * Usage: node scripts/sync-nexus-cloud.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily', 'index.json');
const BUCKET = 'nexus-pulse';
const KV = {
  dailyReports: 'nexus_pulse_daily_reports_v1',
  tradeIndex: 'nexus_pulse_trade_index_v1',
  strategyPack: 'nexus_pulse_strategy_pack_v1',
};

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
}

const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    console.error('Bucket create failed:', error.message);
    console.error('Create bucket "nexus-pulse" in Supabase Dashboard → Storage (private).');
    process.exit(1);
  }
}

let reports = [];
if (existsSync(INDEX)) {
  reports = JSON.parse(readFileSync(INDEX, 'utf8')).reports || [];
  await upsertKv(KV.dailyReports, {
    agent: 'NexusPulse',
    updatedAt: new Date().toISOString(),
    reports,
  });
  console.log(`Daily index: ${reports.length} report(s)`);
}

const tradeIndex = { paper: [], live: [], updatedAt: new Date().toISOString() };

for (const mode of ['paper', 'live']) {
  const dir = join(ROOT, '.data', 'nexus-pulse', 'trades', mode);
  if (!existsSync(dir)) continue;
  const { readdirSync, readFileSync: readF } = await import('fs');
  for (const name of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const date = name.replace('.json', '');
    const body = JSON.parse(readF(join(dir, name), 'utf8'));
    const k = `nexus_pulse_trades_${mode}_${date}`;
    await upsertKv(k, body);
    tradeIndex[mode].push(date);
    console.log(`Trade archive: ${mode}/${date}`);
  }
}
await upsertKv(KV.tradeIndex, tradeIndex);

for (const r of reports) {
  const pdf = join(ROOT, '.data', 'nexus-pulse', 'reports', 'daily', `NexusPulse-Day-${r.date}.pdf`);
  if (!existsSync(pdf)) {
    console.warn(`Skip PDF (missing): ${r.date}`);
    continue;
  }
  const buf = readFileSync(pdf);
  const path = `reports/daily/NexusPulse-Day-${r.date}.pdf`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (error) {
    console.error(`PDF ${r.date}:`, error.message);
  } else {
    console.log(`PDF uploaded: ${path}`);
  }
}

const vault = join(ROOT, '.data', 'nexus-pulse-strategy-vault.json');
const note = join(ROOT, '.data', 'nexus-pulse-strategy-note.json');
if (existsSync(vault) && existsSync(note)) {
  await upsertKv(KV.strategyPack, {
    vault: JSON.parse(readFileSync(vault, 'utf8')),
    note: JSON.parse(readFileSync(note, 'utf8')),
    updatedAt: new Date().toISOString(),
  });
  console.log('Strategy pack synced');
}

console.log('NexusPulse cloud sync complete.');
