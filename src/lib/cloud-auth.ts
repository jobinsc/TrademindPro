import { createHash, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  isJobinAdminIdentity,
  normalizeEmail,
  type AuthUser,
  type UserRole,
} from '@/lib/auth';

const PASSWORD_KEY = '__password_hash';

export function hashPasswordSync(password: string): string {
  return createHash('sha256').update(`tmp:${password}:trademind`).digest('hex');
}

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  blocked: boolean;
  created_at: string;
  password_hash?: string | null;
};

function toUser(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    name: row.name || 'User',
    email: normalizeEmail(row.email),
    role: row.role === 'admin' ? 'admin' : 'user',
    blocked: Boolean(row.blocked),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

async function getPasswordHash(userId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // Prefer column if migration applied
  const { data: profile } = await sb
    .from('profiles')
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle();
  if (profile && typeof (profile as { password_hash?: string }).password_hash === 'string') {
    const h = (profile as { password_hash: string }).password_hash;
    if (h) return h;
  }

  const { data: kv } = await sb
    .from('user_kv')
    .select('value')
    .eq('user_id', userId)
    .eq('key', PASSWORD_KEY)
    .maybeSingle();
  if (!kv?.value) return null;
  if (typeof kv.value === 'string') return kv.value;
  if (typeof kv.value === 'object' && kv.value && 'hash' in (kv.value as object)) {
    return String((kv.value as { hash: string }).hash);
  }
  return null;
}

async function setPasswordHash(userId: string, passwordHash: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const { error } = await sb.from('profiles').update({ password_hash: passwordHash }).eq('id', userId);
  // Always also store in user_kv so it works without SQL migration
  await sb.from('user_kv').upsert(
    {
      user_id: userId,
      key: PASSWORD_KEY,
      value: { hash: passwordHash },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );
  void error;
}

export async function cloudSignup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Cloud backend not configured' };

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (name.length < 2) return { ok: false, error: 'Please enter your name' };
  if (!email.includes('@')) return { ok: false, error: 'Please enter a valid email' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };

  const { data: existing } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return { ok: false, error: 'An account with this email already exists. Please log in.' };

  const passwordHash = hashPasswordSync(password);
  let userId: string = randomUUID();

  // Create auth user when possible (keeps FK to auth.users working)
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (!createErr && created.user?.id) {
    userId = String(created.user.id);
  } else {
    // Maybe already exists in Auth — look up by email
    const { data: listed } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = listed?.users?.find((u) => normalizeEmail(u.email || '') === email);
    if (found?.id) {
      userId = String(found.id);
    } else if (createErr) {
      return {
        ok: false,
        error: createErr.message || 'Could not create cloud user',
      };
    }
  }

  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const isFirst = (count || 0) === 0;
  const role: UserRole =
    isFirst || isJobinAdminIdentity(name, email) ? 'admin' : 'user';

  const row = {
    id: userId,
    name,
    email,
    role,
    blocked: false,
    created_at: new Date().toISOString(),
    password_hash: passwordHash,
  };

  const { data: profile, error } = await sb.from('profiles').insert(row).select('*').single();
  if (error) {
    // Retry without password_hash column
    const { data: profile2, error: error2 } = await sb
      .from('profiles')
      .insert({
        id: userId,
        name,
        email,
        role,
        blocked: false,
        created_at: row.created_at,
      })
      .select('*')
      .single();
    if (error2) return { ok: false, error: error2.message };
    await setPasswordHash(userId, passwordHash);
    return { ok: true, user: toUser(profile2 as ProfileRow) };
  }

  await setPasswordHash(userId, passwordHash);
  return { ok: true, user: toUser(profile as ProfileRow) };
}

export async function cloudLogin(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Cloud backend not configured' };

  const email = normalizeEmail(input.email);
  const passwordHash = hashPasswordSync(input.password);

  const { data: profile, error } = await sb.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!profile) return { ok: false, error: 'No account found with this email. Please sign up.' };

  const row = profile as ProfileRow;
  if (row.blocked) return { ok: false, error: 'This account is blocked. Contact the admin.' };

  let stored = await getPasswordHash(row.id);
  if (!stored) {
    // Migrate existing Supabase user (e.g. Jobin): bind password on first cloud login
    await setPasswordHash(row.id, passwordHash);
    stored = passwordHash;
  }
  if (stored !== passwordHash) {
    return { ok: false, error: 'Incorrect password. Please try again.' };
  }

  let user = toUser(row);
  if (isJobinAdminIdentity(user.name, user.email) && user.role !== 'admin') {
    await sb.from('profiles').update({ role: 'admin' }).eq('id', user.id);
    user = { ...user, role: 'admin' };
  }
  return { ok: true, user };
}

export async function cloudListUsers(): Promise<AuthUser[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  return ((data || []) as ProfileRow[]).map(toUser);
}

export async function cloudSetBlocked(
  adminId: string,
  targetId: string,
  blocked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Cloud not ready' };
  const { data: admin } = await sb.from('profiles').select('*').eq('id', adminId).maybeSingle();
  if (!admin || (admin as ProfileRow).role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId) return { ok: false, error: 'You cannot block your own account' };
  const { data: target } = await sb.from('profiles').select('*').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'User not found' };
  const t = target as ProfileRow;
  if (t.role === 'admin' && isJobinAdminIdentity(t.name, t.email)) {
    return { ok: false, error: 'Cannot block the primary admin (Jobin)' };
  }
  const { error } = await sb.from('profiles').update({ blocked }).eq('id', targetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cloudSetRole(
  adminId: string,
  targetId: string,
  role: UserRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Cloud not ready' };
  const { data: admin } = await sb.from('profiles').select('*').eq('id', adminId).maybeSingle();
  if (!admin || (admin as ProfileRow).role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId && role !== 'admin') {
    return { ok: false, error: 'You cannot remove your own admin role' };
  }
  const { data: target } = await sb.from('profiles').select('*').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'User not found' };
  const t = target as ProfileRow;
  if (role !== 'admin' && isJobinAdminIdentity(t.name, t.email)) {
    return { ok: false, error: 'Jobin must remain an admin' };
  }
  const { error } = await sb.from('profiles').update({ role }).eq('id', targetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cloudDeleteUser(
  adminId: string,
  targetId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'Cloud not ready' };
  const { data: admin } = await sb.from('profiles').select('*').eq('id', adminId).maybeSingle();
  if (!admin || (admin as ProfileRow).role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId) return { ok: false, error: 'You cannot delete your own account' };

  const { data: target } = await sb.from('profiles').select('*').eq('id', targetId).maybeSingle();
  if (!target) return { ok: false, error: 'User not found' };
  const t = target as ProfileRow;
  if (t.role === 'admin' && isJobinAdminIdentity(t.name, t.email)) {
    return { ok: false, error: 'Cannot delete the primary admin (Jobin)' };
  }

  // Remove user KV rows then profile
  await sb.from('user_kv').delete().eq('user_id', targetId);
  const { error } = await sb.from('profiles').delete().eq('id', targetId);
  if (error) return { ok: false, error: error.message };

  // Best-effort remove Auth user if present
  try {
    await sb.auth.admin.deleteUser(targetId);
  } catch {
    /* profile-only accounts may not exist in auth.users */
  }
  return { ok: true };
}

/** One-shot cleanup: keep only Jobin + Jeril */
export async function cloudPurgeTestUsers(): Promise<{
  ok: boolean;
  kept: string[];
  removed: string[];
  error?: string;
}> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, kept: [], removed: [], error: 'Cloud not ready' };

  const keep = new Set(['jobinsc@gmail.com', 'jerilac@yahoo.com']);
  const { data, error } = await sb.from('profiles').select('*');
  if (error) return { ok: false, kept: [], removed: [], error: error.message };

  const kept: string[] = [];
  const removed: string[] = [];
  for (const row of (data || []) as ProfileRow[]) {
    const email = normalizeEmail(row.email);
    if (keep.has(email) || isJobinAdminIdentity(row.name, email)) {
      kept.push(email);
      // Ensure Jobin stays admin
      if (isJobinAdminIdentity(row.name, email) && row.role !== 'admin') {
        await sb.from('profiles').update({ role: 'admin', blocked: false }).eq('id', row.id);
      }
      if (email === 'jerilac@yahoo.com') {
        await sb.from('profiles').update({ blocked: false, role: 'user' }).eq('id', row.id);
      }
      continue;
    }
    await sb.from('user_kv').delete().eq('user_id', row.id);
    await sb.from('profiles').delete().eq('id', row.id);
    try {
      await sb.auth.admin.deleteUser(row.id);
    } catch {
      /* ignore */
    }
    removed.push(email);
  }
  return { ok: true, kept, removed };
}
