import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionToken } from '@/lib/session';
import { sendGmailOtp, gmailCredentials } from '@/lib/nexus-pulse/gmail-send';
import {
  clearUnlock,
  consumeResetOtp,
  issueResetOtp,
  issueUnlockToken,
  loadNoteDoc,
  loadVault,
  saveNoteDoc,
  setNotePassword,
  verifyNotePassword,
  verifyResetOtp,
  verifyUnlockToken,
} from '@/lib/nexus-pulse/strategy-note';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest) {
  const user = verifySessionToken(readSessionCookie(req));
  if (!user || user.role !== 'admin') return null;
  return user;
}

function unlockHeader(req: NextRequest): string | null {
  return req.headers.get('x-nexus-note-unlock')?.trim() || null;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const vault = await loadVault();
  const unlocked = await verifyUnlockToken(unlockHeader(req));
  const status = {
    ok: true,
    adminOnly: true,
    passwordSet: Boolean(vault.passwordHash),
    unlocked,
    recoveryEmailMasked: vault.recoveryEmail
      ? vault.recoveryEmail.replace(/(.{2}).+(@.+)/, '$1***$2')
      : admin.email.replace(/(.{2}).+(@.+)/, '$1***$2'),
    gmailConfigured: Boolean(gmailCredentials()),
  };

  if (!unlocked) {
    return NextResponse.json(status);
  }

  const note = await loadNoteDoc();
  return NextResponse.json({ ...status, note });
}

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  let body: {
    action?: string;
    password?: string;
    newPassword?: string;
    otp?: string;
    recoveryEmail?: string;
    title?: string;
    bodyMarkdown?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || '';

  if (action === 'set_password') {
    const pw = String(body.password || '');
    if (pw.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    const vault = await loadVault();
    if (vault.passwordHash) {
      const unlocked = await verifyUnlockToken(unlockHeader(req));
      if (!unlocked) {
        return NextResponse.json(
          { ok: false, error: 'Unlock note first to change password' },
          { status: 401 }
        );
      }
    }
    const email = (body.recoveryEmail || admin.email).trim().toLowerCase();
    await setNotePassword(pw, email);
    const { token, expiresAt } = await issueUnlockToken();
    return NextResponse.json({
      ok: true,
      unlockToken: token,
      unlockExpiresAt: expiresAt,
      message: 'Note password saved',
    });
  }

  if (action === 'unlock') {
    const ok = await verifyNotePassword(String(body.password || ''));
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Wrong note password' }, { status: 401 });
    }
    const { token, expiresAt } = await issueUnlockToken();
    const note = await loadNoteDoc();
    return NextResponse.json({
      ok: true,
      unlockToken: token,
      unlockExpiresAt: expiresAt,
      note,
    });
  }

  if (action === 'lock') {
    await clearUnlock();
    return NextResponse.json({ ok: true, locked: true });
  }

  if (action === 'forgot_password') {
    const vault = await loadVault();
    const target = (vault.recoveryEmail || admin.email).trim().toLowerCase();
    // Must match logged-in admin email (or configured recovery email that equals admin)
    if (target !== admin.email.trim().toLowerCase() && target !== (vault.recoveryEmail || '')) {
      return NextResponse.json(
        { ok: false, error: 'Recovery email must match admin Gmail on this account' },
        { status: 400 }
      );
    }
    if (!vault.passwordHash) {
      return NextResponse.json(
        { ok: false, error: 'No note password set yet — use Set password first' },
        { status: 400 }
      );
    }
    const { otp, expiresAt } = await issueResetOtp();
    const mail = await sendGmailOtp(target, otp);
    return NextResponse.json({
      ok: true,
      emailed: mail.ok,
      emailError: mail.error || null,
      expiresAt,
      recoveryEmailMasked: target.replace(/(.{2}).+(@.+)/, '$1***$2'),
      message: mail.ok
        ? 'OTP sent to admin Gmail'
        : 'OTP generated. Email failed — check Gmail app-password env, or use local OTP backup file on this machine.',
    });
  }

  if (action === 'reset_password') {
    const otp = String(body.otp || '');
    const newPw = String(body.newPassword || body.password || '');
    if (newPw.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }
    const otpOk = await verifyResetOtp(otp);
    if (!otpOk) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired OTP' }, { status: 401 });
    }
    const vault = await loadVault();
    await setNotePassword(newPw, vault.recoveryEmail || admin.email);
    await consumeResetOtp();
    const { token, expiresAt } = await issueUnlockToken();
    return NextResponse.json({
      ok: true,
      unlockToken: token,
      unlockExpiresAt: expiresAt,
      message: 'Password reset — note unlocked',
    });
  }

  if (action === 'save_note') {
    const unlocked = await verifyUnlockToken(unlockHeader(req));
    if (!unlocked) {
      return NextResponse.json({ ok: false, error: 'Unlock required' }, { status: 401 });
    }
    const existing = await loadNoteDoc();
    await saveNoteDoc({
      title: String(body.title || existing.title || 'NexusPulse Strategy Note'),
      updatedAt: new Date().toISOString(),
      bodyMarkdown: String(body.bodyMarkdown ?? existing.bodyMarkdown),
    });
    const note = await loadNoteDoc();
    return NextResponse.json({ ok: true, note });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
