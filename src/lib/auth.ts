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

/** Jobin (and emails/names containing jobin) are treated as admin */
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

  // Promote Jobin identities
  next = next.map((u) =>
    isJobinAdminIdentity(u.name, u.email) ? { ...u, role: 'admin' as const } : u
  );

  // If no admin exists, first account becomes admin
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

export function getSessionUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthUser;
    // Refresh from store so role/block updates apply
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

export function setSessionUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
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

  // Keep Jobin as admin even if role was changed somehow
  let userRecord = found;
  if (isJobinAdminIdentity(found.name, found.email) && found.role !== 'admin') {
    userRecord = { ...found, role: 'admin' };
    writeUsers(users.map((u) => (u.id === found.id ? userRecord : u)));
  }

  const user = toPublicUser(userRecord);
  setSessionUser(user);
  return { ok: true, user };
}

export function logoutUser() {
  setSessionUser(null);
}

/** Admin: list users without password hashes */
export function listUsersForAdmin(): AuthUser[] {
  return readUsers()
    .map(toPublicUser)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setUserBlocked(
  adminId: string,
  targetId: string,
  blocked: boolean
): { ok: true } | { ok: false; error: string } {
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

export function deleteUserAccount(
  adminId: string,
  targetId: string
): { ok: true } | { ok: false; error: string } {
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

export function setUserRole(
  adminId: string,
  targetId: string,
  role: UserRole
): { ok: true } | { ok: false; error: string } {
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
  if (
    role !== 'admin' &&
    isJobinAdminIdentity(target.name, target.email)
  ) {
    return { ok: false, error: 'Jobin must remain an admin' };
  }

  writeUsers(users.map((u) => (u.id === targetId ? { ...u, role } : u)));
  return { ok: true };
}
