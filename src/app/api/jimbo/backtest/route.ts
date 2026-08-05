import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { runJimboPaperBacktest } from '@/lib/jimbo-backtest';
import type { JimboScanScope, JimboSettings } from '@/lib/jimbo';
import { defaultJimboSettings } from '@/lib/jimbo';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';
import { getBearerToken } from '@/lib/upstox-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Jimbo CCI backtest — Upstox original equity + option OHLC (no simulation). */
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Connect Upstox first — Jimbo backtest uses Upstox historical prices only',
        code: 'NO_TOKEN',
      },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<JimboSettings> & {
      focusSymbols?: string[];
      lookbackDays?: number;
      fromDate?: string;
      toDate?: string;
      maxTradesTotal?: number;
      btStopLossPoints?: number;
      btTargetPoints?: number;
      btMaxTradesPerDay?: number;
      btEnforceMaxTradesPerDay?: boolean;
      btMaxLotsPerTrade?: number;
      btMinConfidence?: number;
      btEnforceMaxLoss?: boolean;
      btEnforceDailyTarget?: boolean;
      btDailyMaxLoss?: number;
      btDailyProfitTarget?: number;
    };
    const defaults = defaultJimboSettings();
    const settings: JimboSettings = {
      ...defaults,
      ...body,
      scanScope: (body.scanScope || defaults.scanScope || 'liquid') as JimboScanScope,
      stopLossPoints:
        Number(body.btStopLossPoints) > 0
          ? Number(body.btStopLossPoints)
          : Number(body.stopLossPoints) > 0
            ? Number(body.stopLossPoints)
            : defaults.stopLossPoints,
      targetPoints:
        Number(body.btTargetPoints) > 0
          ? Number(body.btTargetPoints)
          : Number(body.targetPoints) > 0
            ? Number(body.targetPoints)
            : defaults.targetPoints,
      maxLotsPerTrade:
        Number(body.btMaxLotsPerTrade) > 0
          ? Math.min(3, Number(body.btMaxLotsPerTrade))
          : defaults.maxLotsPerTrade,
      minConfidence:
        Number(body.btMinConfidence) > 0
          ? Number(body.btMinConfidence)
          : defaults.minConfidence,
      maxTradesPerDay:
        Number(body.btMaxTradesPerDay) > 0
          ? Number(body.btMaxTradesPerDay)
          : Number(body.maxTradesPerDay) > 0
            ? Number(body.maxTradesPerDay)
            : defaults.maxTradesPerDay,
      enforceMaxTradesLimit:
        body.btEnforceMaxTradesPerDay != null
          ? Boolean(body.btEnforceMaxTradesPerDay)
          : Boolean(body.enforceMaxTradesLimit),
      enforceMaxLossLimit:
        body.btEnforceMaxLoss != null
          ? Boolean(body.btEnforceMaxLoss)
          : Boolean(body.enforceMaxLossLimit),
      enforceDailyTargetLimit:
        body.btEnforceDailyTarget != null
          ? Boolean(body.btEnforceDailyTarget)
          : Boolean(body.enforceDailyTargetLimit),
      dailyMaxLoss:
        Number(body.btDailyMaxLoss) > 0
          ? Number(body.btDailyMaxLoss)
          : defaults.dailyMaxLoss,
      dailyProfitTarget:
        Number(body.btDailyProfitTarget) > 0
          ? Number(body.btDailyProfitTarget)
          : defaults.dailyProfitTarget,
      mfeProfitTrail:
        body.mfeProfitTrail != null ? Boolean(body.mfeProfitTrail) : defaults.mfeProfitTrail,
      mfeTrailTriggerPts:
        Number(body.mfeTrailTriggerPts) > 0
          ? Number(body.mfeTrailTriggerPts)
          : defaults.mfeTrailTriggerPts,
      mfeTrailKeepFrac:
        Number(body.mfeTrailKeepFrac) > 0
          ? Number(body.mfeTrailKeepFrac)
          : defaults.mfeTrailKeepFrac,
    };

    const result = await runJimboPaperBacktest({
      accessToken: token,
      settings,
      focusSymbols: Array.isArray(body.focusSymbols) ? body.focusSymbols : undefined,
      fromDate: body.fromDate,
      toDate: body.toDate,
      lookbackDays: Number(body.lookbackDays) > 0 ? Number(body.lookbackDays) : 30,
      maxTradesTotal:
        Number(body.maxTradesTotal) > 0 ? Number(body.maxTradesTotal) : 0,
    });

    try {
      await ensureAppDataDir();
      const dir = path.join(getAppDataDir(), 'jimbo', 'backtests');
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `paper-${stamp}.json`);
      await fs.writeFile(
        file,
        JSON.stringify({ request: { ...body, accessToken: undefined }, result }, null, 2),
        'utf8'
      );
      return NextResponse.json({
        ...result,
        backupPath: `.data/jimbo/backtests/paper-${stamp}.json`,
      });
    } catch {
      return NextResponse.json(result);
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Jimbo backtest failed' },
      { status: 500 }
    );
  }
}
