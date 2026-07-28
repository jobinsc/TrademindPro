'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookLock, Loader2, Lock, Mail, Shield } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import RequireAdmin from '@/components/auth/RequireAdmin';

type NoteDoc = {
  title: string;
  updatedAt: string;
  bodyMarkdown: string;
};

const UNLOCK_KEY = 'nexus_pulse_b_note_unlock_v1';

function loadUnlockToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(UNLOCK_KEY);
}

function saveUnlockToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (!token) sessionStorage.removeItem(UNLOCK_KEY);
  else sessionStorage.setItem(UNLOCK_KEY, token);
}

async function api(action: string, body: Record<string, unknown> = {}) {
  const unlock = loadUnlockToken();
  const res = await fetch('/api/nexus-pulse-b/strategy-note', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(unlock ? { 'x-nexus-b-note-unlock': unlock } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || 'Request failed'));
  }
  return data;
}

async function fetchStatus() {
  const unlock = loadUnlockToken();
  const res = await fetch('/api/nexus-pulse-b/strategy-note', {
    credentials: 'include',
    headers: unlock ? { 'x-nexus-b-note-unlock': unlock } : {},
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || 'Failed to load'));
  }
  return data;
}

function StrategyNoteInner() {
  const { user } = useAuth();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [recoveryMasked, setRecoveryMasked] = useState('');
  const [note, setNote] = useState<NoteDoc | null>(null);
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mode, setMode] = useState<'gate' | 'forgot' | 'edit'>('gate');
  const [editBody, setEditBody] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    const data = await fetchStatus();
    setPasswordSet(Boolean(data.passwordSet));
    setUnlocked(Boolean(data.unlocked));
    setGmailConfigured(Boolean(data.gmailConfigured));
    setRecoveryMasked(String(data.recoveryEmailMasked || ''));
    if (data.note && typeof data.note === 'object') {
      const n = data.note as NoteDoc;
      setNote(n);
      setEditBody(n.bodyMarkdown);
      setMode('edit');
    } else {
      setNote(null);
      setMode('gate');
    }
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [refresh]);

  async function onSetPassword() {
    setBusy('Saving password…');
    setError('');
    try {
      const data = await api('set_password', {
        password,
        recoveryEmail: user?.email,
      });
      if (typeof data.unlockToken === 'string') saveUnlockToken(data.unlockToken);
      setPassword('');
      setInfo('Note password saved. Keep it private.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy('');
    }
  }

  async function onUnlock() {
    setBusy('Unlocking…');
    setError('');
    try {
      const data = await api('unlock', { password });
      if (typeof data.unlockToken === 'string') saveUnlockToken(data.unlockToken);
      setPassword('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrong password');
    } finally {
      setBusy('');
    }
  }

  async function onForgot() {
    setBusy('Sending OTP…');
    setError('');
    setInfo('');
    try {
      const data = await api('forgot_password', {});
      setInfo(
        String(
          data.message ||
            (data.emailed
              ? 'OTP emailed to admin Gmail'
              : 'OTP created — check Gmail / local backup')
        )
      );
      setMode('forgot');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Forgot failed');
    } finally {
      setBusy('');
    }
  }

  async function onReset() {
    setBusy('Resetting…');
    setError('');
    try {
      const data = await api('reset_password', { otp, newPassword });
      if (typeof data.unlockToken === 'string') saveUnlockToken(data.unlockToken);
      setOtp('');
      setNewPassword('');
      setInfo('Password changed via Gmail OTP.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy('');
    }
  }

  async function onSaveNote() {
    setBusy('Saving note…');
    setError('');
    try {
      const data = await api('save_note', {
        title: note?.title || 'NexusPulse Sector 7 B Strategy Note',
        bodyMarkdown: editBody,
      });
      if (data.note && typeof data.note === 'object') {
        setNote(data.note as NoteDoc);
      }
      setInfo('Strategy note saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  async function onLock() {
    await api('lock', {}).catch(() => undefined);
    saveUnlockToken(null);
    setUnlocked(false);
    setNote(null);
    setMode('gate');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            NexusPulse · Admin only
          </p>
          <h1 className="font-display text-2xl font-bold text-sky-deep">Strategy Note</h1>
          <p className="mt-1 text-[13px] text-sky-ink/60">
            Full desk rules. Password protected. Reset via admin Gmail OTP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/nexus-pulse-b"
            className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-deep"
          >
            Back to NexusPulse
          </Link>
          {unlocked && (
            <button
              type="button"
              onClick={() => void onLock()}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-800"
            >
              Lock note
            </button>
          )}
        </div>
      </div>

      {(error || info || busy) && (
        <div className="mt-4 space-y-2 text-[13px]">
          {busy && (
            <p className="flex items-center gap-2 text-sky-ink/60">
              <Loader2 className="h-4 w-4 animate-spin" /> {busy}
            </p>
          )}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
          {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">{info}</p>}
        </div>
      )}

      {!unlocked && mode === 'gate' && (
        <section className="mt-6 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-sky-deep" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-sky-deep">
                {passwordSet ? 'Enter note password' : 'Set note password (first time)'}
              </h2>
              <p className="mt-1 text-[12px] text-sky-ink/55">
                Recovery Gmail: {recoveryMasked || user?.email} · SMTP:{' '}
                {gmailConfigured ? 'configured' : 'not configured (OTP still generated locally)'}
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Note password"
                className="mt-3 w-full rounded-xl border border-sky-200 px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {passwordSet ? (
                  <button
                    type="button"
                    disabled={Boolean(busy) || password.length < 1}
                    onClick={() => void onUnlock()}
                    className="rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Unlock
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busy) || password.length < 6}
                    onClick={() => void onSetPassword()}
                    className="rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Save password
                  </button>
                )}
                {passwordSet && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void onForgot()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[12px] font-bold text-amber-900 disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" /> Forgot password (Gmail OTP)
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {!unlocked && mode === 'forgot' && (
        <section className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-amber-950">Reset with Gmail OTP</h2>
          <p className="mt-1 text-[12px] text-amber-900/70">
            Enter the 6-digit code sent to {recoveryMasked}, then choose a new password.
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="OTP from Gmail"
            className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New note password (min 6)"
            className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || otp.length < 4 || newPassword.length < 6}
              onClick={() => void onReset()}
              className="rounded-xl bg-amber-800 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Reset & unlock
            </button>
            <button
              type="button"
              onClick={() => setMode('gate')}
              className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-[12px] font-semibold"
            >
              Back
            </button>
          </div>
        </section>
      )}

      {unlocked && note && (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-[12px] text-emerald-900">
            <Shield className="mr-1 inline h-3.5 w-3.5" />
            Unlocked · last saved {new Date(note.updatedAt).toLocaleString('en-IN')}
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-sky-deep">
              <BookLock className="h-4 w-4" /> {note.title}
            </div>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={28}
              className="w-full rounded-xl border border-sky-100 bg-sky-soft/20 px-3 py-3 font-mono text-[12px] leading-relaxed text-sky-ink"
            />
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void onSaveNote()}
              className="mt-3 rounded-xl bg-sky-deep px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Save strategy note
            </button>
          </div>
          <article className="prose prose-sm max-w-none rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-sky-ink/90">
              {editBody}
            </pre>
          </article>
        </section>
      )}
    </div>
  );
}

export default function NexusBStrategyNoteWorkspace() {
  return (
    <RequireAdmin>
      <StrategyNoteInner />
    </RequireAdmin>
  );
}
