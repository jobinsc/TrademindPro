import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/upstox-market';
import { repairJimboPaperTradesWithUpstox } from '@/lib/jimbo-paper-repair';
import { backupJimboPaperTrades } from '@/lib/jimbo-trade-archive';
import type { JimboTrade } from '@/lib/jimbo';
import fs from 'fs/promises';
import path from 'path';
import { getAppDataDir, ensureAppDataDir } from '@/lib/app-data-dir';
import { todayKey } from '@/lib/jimbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Reprice today's Jimbo paper book onto live / historical Upstox option premiums. */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Connect Upstox first', code: 'NO_TOKEN' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      trades?: JimboTrade[];
      loadFromDisk?: boolean;
      flattenExtraOpens?: boolean;
    };

    let trades: JimboTrade[] = Array.isArray(body.trades) ? body.trades : [];

    if ((!trades.length || body.loadFromDisk) && body.loadFromDisk !== false) {
      try {
        await ensureAppDataDir();
        const day = todayKey();
        const file = path.join(getAppDataDir(), 'jimbo', 'trades', 'paper', `${day}.json`);
        const raw = await fs.readFile(file, 'utf8');
        const parsed = JSON.parse(raw) as { trades?: JimboTrade[] };
        if (Array.isArray(parsed.trades) && parsed.trades.length) {
          // Prefer disk day book when client sends empty / asks loadFromDisk
          if (!trades.length || body.loadFromDisk) trades = parsed.trades;
        }
      } catch {
        /* keep client trades */
      }
    }

    if (!trades.length) {
      return NextResponse.json({
        ok: false,
        error: 'No Jimbo paper trades to repair',
      });
    }

    const report = await repairJimboPaperTradesWithUpstox({
      accessToken: token,
      trades,
      flattenExtraOpens: body.flattenExtraOpens !== false,
    });

    await backupJimboPaperTrades({
      trades: report.trades,
      note: report.note,
    });

    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Repair failed' },
      { status: 500 }
    );
  }
}
