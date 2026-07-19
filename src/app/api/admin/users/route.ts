import { NextRequest, NextResponse } from 'next/server';
import { cloudDeleteUser, cloudListUsers, cloudSetBlocked, cloudSetRole } from '@/lib/cloud-auth';
import type { UserRole } from '@/lib/auth';
import { readSessionCookie, verifySessionToken } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest) {
  const user = verifySessionToken(readSessionCookie(req));
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const users = await cloudListUsers();
  return NextResponse.json({ ok: true, users });
}

export async function PATCH(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: {
    action?: string;
    targetId?: string;
    blocked?: boolean;
    role?: UserRole;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'block') {
    const result = await cloudSetBlocked(admin.id, String(body.targetId || ''), Boolean(body.blocked));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === 'role') {
    const result = await cloudSetRole(
      admin.id,
      String(body.targetId || ''),
      body.role === 'admin' ? 'admin' : 'user'
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === 'delete') {
    const result = await cloudDeleteUser(admin.id, String(body.targetId || ''));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
