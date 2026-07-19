import { pullCloudData, pushCloudData } from '@/lib/cloud-sync';

export type UserRole = 'admin' | 'user';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  blocked: boolean;
  createdAt: string;
};

export type StoredUser = AuthUser & {
  passwordHash: string;
};

const USERS_KEY = 'trademindpro_users_v1';
const SESSION_KEY = 'trademindpro_session_v1';

/**
 * Cloud mode when NEXT_PUBLIC_AUTH_MODE=cloud (Supabase DB via our API — no email-confirm pain).
 * local (or unset with no cloud flag) = browser-only login.
 */
export function isCloudAuth(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE?.trim().toLowerCase() === 'cloud';
}

export function isJobinAdminIdentity(name: string, email: string): boolean {
  const n = name.trim().toLowerCase();
  const e = normalizeEmail(email);
  const local = e.split('@')[0] || '';
  return n.includes('jobin') || local.includes('jobin');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`tmp:${password}:trademind`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toPublicUser(u: StoredUser): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    blocked: u.blocked,
    createdAt: u.createdAt,
  };
}

function normalizeStored(raw: Partial<StoredUser> & { id: string; email: string }): StoredUser {
  return {
    id: raw.id,
    name: raw.name || 'User',
    email: normalizeEmail(raw.email),
    passwordHash: raw.passwordHash || '',
    role: raw.role === 'admin' ? 'admin' : 'user',
    blocked: Boolean(raw.blocked),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function migrateUsers(users: StoredUser[]): StoredUser[] {
  let next = users.map((u) => normalizeStored(u));
  next = next.map((u) =>
    isJobinAdminIdentity(u.name, u.email) ? { ...u, role: 'admin' as const } : u
  );
  if (!next.some((u) => u.role === 'admin') && next.length > 0) {
    next = next.map((u, i) => (i === 0 ? { ...u, role: 'admin' as const } : u));
  }
  return next;
}

export function readUsers(): StoredUser[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredUser>[];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .filter((u): u is Partial<StoredUser> & { id: string; email: string } =>
        Boolean(u && u.id && u.email)
      )
      .map(normalizeStored);
    const migrated = migrateUsers(normalized);
    writeUsers(migrated);
    return migrated;
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function setSessionUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getSessionUserLocal(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthUser;
    const fresh = readUsers().find((u) => u.id === session.id);
    if (!fresh) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (fresh.blocked) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const user = toPublicUser(fresh);
    setSessionUser(user);
    return user;
  } catch {
    return null;
  }
}

export function getSessionUser(): AuthUser | null {
  return getSessionUserLocal();
}

export async function getSessionUserAsync(): Promise<AuthUser | null> {
  if (!isCloudAuth()) return getSessionUserLocal();

  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
      setSessionUser(null);
      return null;
    }
    const data = (await res.json()) as { ok?: boolean; user?: AuthUser };
    if (!data.ok || !data.user) {
      setSessionUser(null);
      return null;
    }
    setSessionUser(data.user);
    return data.user;
  } catch {
    setSessionUser(null);
    return null;
  }
}

export async function signupUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (name.length < 2) return { ok: false, error: 'Please enter your name' };
  if (!email.includes('@') || email.length < 5) {
    return { ok: false, error: 'Please enter a valid email' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }

  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: AuthUser;
      };
      if (!res.ok || !data.ok || !data.user) {
        return { ok: false, error: data.error || 'Signup failed' };
      }
      await pullCloudData(data.user.id);
      setSessionUser(data.user);
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Network error during signup' };
    }
  }

  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: 'An account with this email already exists. Please log in.' };
  }

  const isFirst = users.length === 0;
  const role: UserRole =
    isFirst || isJobinAdminIdentity(name, email) ? 'admin' : 'user';

  const passwordHash = await hashPassword(password);
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role,
    blocked: false,
    createdAt: new Date().toISOString(),
  };
  writeUsers([...users, stored]);

  const user = toPublicUser(stored);
  setSessionUser(user);
  return { ok: true, user };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);

  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: input.password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: AuthUser;
      };
      if (!res.ok || !data.ok || !data.user) {
        return { ok: false, error: data.error || 'Login failed' };
      }
      await pullCloudData(data.user.id);
      setSessionUser(data.user);
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Network error during login' };
    }
  }

  const users = readUsers();
  const found = users.find((u) => u.email === email);
  if (!found) {
    return { ok: false, error: 'No account found with this email. Please sign up.' };
  }
  if (found.blocked) {
    return { ok: false, error: 'This account is blocked. Contact the admin.' };
  }

  const passwordHash = await hashPassword(input.password);
  if (passwordHash !== found.passwordHash) {
    return { ok: false, error: 'Incorrect password. Please try again.' };
  }

  let userRecord = found;
  if (isJobinAdminIdentity(found.name, found.email) && found.role !== 'admin') {
    userRecord = { ...found, role: 'admin' };
    writeUsers(users.map((u) => (u.id === found.id ? userRecord : u)));
  }

  const user = toPublicUser(userRecord);
  setSessionUser(user);
  return { ok: true, user };
}

export async function logoutUser(): Promise<void> {
  if (isCloudAuth()) {
    try {
      await pushCloudData();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
  }
  setSessionUser(null);
}

export async function listUsersForAdmin(): Promise<AuthUser[]> {
  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      const data = (await res.json()) as { ok?: boolean; users?: AuthUser[] };
      return data.users || [];
    } catch {
      return [];
    }
  }
  return readUsers()
    .map(toPublicUser)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setUserBlocked(
  adminId: string,
  targetId: string,
  blocked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'block', adminId, targetId, blocked }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Failed' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  const users = readUsers();
  const admin = users.find((u) => u.id === adminId);
  if (!admin || admin.role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId) {
    return { ok: false, error: 'You cannot block your own account' };
  }
  const target = users.find((u) => u.id === targetId);
  if (!target) return { ok: false, error: 'User not found' };
  if (target.role === 'admin' && isJobinAdminIdentity(target.name, target.email)) {
    return { ok: false, error: 'Cannot block the primary admin (Jobin)' };
  }

  writeUsers(users.map((u) => (u.id === targetId ? { ...u, blocked } : u)));
  return { ok: true };
}

export async function deleteUserAccount(
  adminId: string,
  targetId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', targetId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Failed' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  const users = readUsers();
  const admin = users.find((u) => u.id === adminId);
  if (!admin || admin.role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId) {
    return { ok: false, error: 'You cannot delete your own account' };
  }
  const target = users.find((u) => u.id === targetId);
  if (!target) return { ok: false, error: 'User not found' };
  if (target.role === 'admin' && isJobinAdminIdentity(target.name, target.email)) {
    return { ok: false, error: 'Cannot delete the primary admin (Jobin)' };
  }

  writeUsers(users.filter((u) => u.id !== targetId));
  return { ok: true };
}

export async function setUserRole(
  adminId: string,
  targetId: string,
  role: UserRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isCloudAuth()) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'role', adminId, targetId, role }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Failed' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  const users = readUsers();
  const admin = users.find((u) => u.id === adminId);
  if (!admin || admin.role !== 'admin') {
    return { ok: false, error: 'Only admins can do this' };
  }
  if (targetId === adminId && role !== 'admin') {
    return { ok: false, error: 'You cannot remove your own admin role' };
  }
  const target = users.find((u) => u.id === targetId);
  if (!target) return { ok: false, error: 'User not found' };
  if (role !== 'admin' && isJobinAdminIdentity(target.name, target.email)) {
    return { ok: false, error: 'Jobin must remain an admin' };
  }

  writeUsers(users.map((u) => (u.id === targetId ? { ...u, role } : u)));
  return { ok: true };
}
