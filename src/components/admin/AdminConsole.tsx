'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban, CheckCircle2, Shield, Trash2, UserCog } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  deleteUserAccount,
  listUsersForAdmin,
  setUserBlocked,
  setUserRole,
  type AuthUser,
  type UserRole,
} from '@/lib/auth';

export default function AdminConsole() {
  const { user, ready, isAdmin, refreshUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    setUsers(listUsersForAdmin());
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isAdmin) return;
    reload();
  }, [ready, isAdmin, reload]);

  if (!ready) {
    return (
      <div className="px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">Loading…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center md:px-8">
        <Shield className="mx-auto h-10 w-10 text-sky-mid" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-2xl font-semibold text-sky-ink">Admin only</h1>
        <p className="mt-2 text-sm text-sky-ink/60">
          You need an admin account to open this page. Jobin’s account is the primary admin.
        </p>
        <button
          type="button"
          onClick={() => router.push('/app')}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
      </div>
    );
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2500);
  }

  function handleBlock(target: AuthUser, blocked: boolean) {
    if (!user) return;
    const result = setUserBlocked(user.id, target.id, blocked);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    reload();
    flash(blocked ? `${target.name} blocked` : `${target.name} unblocked`);
  }

  function handleDelete(target: AuthUser) {
    if (!user) return;
    if (!window.confirm(`Delete account for ${target.name} (${target.email})?`)) return;
    const result = deleteUserAccount(user.id, target.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    reload();
    flash(`${target.name} deleted`);
  }

  function handleRole(target: AuthUser, role: UserRole) {
    if (!user) return;
    const result = setUserRole(user.id, target.id, role);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    reload();
    refreshUser();
    flash(`${target.name} is now ${role}`);
  }

  const total = users.length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const blocked = users.filter((u) => u.blocked).length;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
          Module 6 · Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink">
          Admin Console
        </h1>
        <p className="mt-2 max-w-xl text-sm text-sky-ink/60">
          Signed in as <strong className="text-sky-ink">{user?.name}</strong> (admin). Manage everyone
          who creates an account on TradeMind Pro.
        </p>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Total users" value={String(total)} />
        <Stat label="Admins" value={String(admins)} />
        <Stat label="Blocked" value={String(blocked)} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#cfe0ee]/90 bg-white">
        <div className="border-b border-[#e8f2fa] px-4 py-3">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">All accounts</h2>
          <p className="text-[12px] text-sky-ink/45">Block, promote, or delete users</p>
        </div>

        {users.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-sky-ink/50">No users yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8f2fa] bg-sky-soft/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/45">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[#e8f2fa] last:border-0 hover:bg-sky-soft/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sky-ink">{u.name}</p>
                        <p className="text-[11px] text-sky-ink/45">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-sky-mist text-sky-deep'
                              : 'bg-sky-soft text-sky-ink/60'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.blocked ? (
                          <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                            Blocked
                          </span>
                        ) : (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sky-ink/55">
                        {u.createdAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {!isSelf && u.role !== 'admin' && (
                            <button
                              type="button"
                              title="Make admin"
                              onClick={() => handleRole(u, 'admin')}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-mist hover:text-sky-deep"
                            >
                              <UserCog className="h-4 w-4" />
                            </button>
                          )}
                          {!isSelf && u.role === 'admin' && (
                            <button
                              type="button"
                              title="Make regular user"
                              onClick={() => handleRole(u, 'user')}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-ink"
                            >
                              <UserCog className="h-4 w-4" />
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              type="button"
                              title={u.blocked ? 'Unblock' : 'Block'}
                              onClick={() => handleBlock(u, !u.blocked)}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-amber-50 hover:text-amber-700"
                            >
                              {u.blocked ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => handleDelete(u)}
                              className="rounded-lg p-2 text-sky-ink/40 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                          {isSelf && (
                            <span className="px-2 py-1 text-[11px] font-medium text-sky-ink/40">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[12px] text-sky-ink/45">
        Tip: Sign up with name or email containing <strong>jobin</strong> to get admin automatically.
        First account on this browser is also admin.{' '}
        <Link href="/app" className="font-semibold text-sky-deep hover:underline">
          Dashboard
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold text-sky-ink">{value}</p>
    </div>
  );
}
