/**
 * Paper trading hub — capital, active agent, results display.
 * Strategy / SL / target live in Nejoic (Nifty) or Jimbo (stocks).
 */

import { setBrokeragePerLot } from '@/lib/brokerage';

export type PaperAgent = 'nejoic' | 'jimbo' | 'both';

export type ExecutionMode = 'paper' | 'live';

export type PaperResultsColumns = {
  strategy: boolean;
  timeframe: boolean;
  lots: boolean;
  entryExit: boolean;
  brokerage: boolean;
  stopTarget: boolean;
  trailing: boolean;
  grossPnl: boolean;
  netPnl: boolean;
  duration: boolean;
  note: boolean;
};

export type PaperTradeSettings = {
  /** Legacy focus hint — both brains can run together */
  paperAgent: PaperAgent;
  /** Manual trades allowed while auto is running */
  allowManualWithAuto: boolean;
  /** Starting paper cash for reset & new accounts */
  startingCapital: number;
  /** Manual trade form default only */
  defaultInstrument: 'NIFTY' | 'BANKNIFTY' | 'STOCK';
  showInResults: PaperResultsColumns;
  settingsOpen: boolean;
  updatedAt: string;
};

export const PAPER_TRADE_LS_KEY = 'trademindpro_paper_settings_v1';
export const PAPER_TRADE_SYNC = 'trademindpro-paper-settings-sync';

/** Legacy keys — migrated into Nejoic on read */
type LegacyPaperPatch = {
  autoTradeEnabled?: boolean;
  strategyIds?: string[];
  timeframe?: string;
  lots?: number;
  brokeragePerLot?: number;
  targetPoints?: number;
  stopLossPoints?: number;
  trailingStopPoints?: number;
  trailingActivatePoints?: number;
};

export function defaultPaperTradeSettings(): PaperTradeSettings {
  return {
    paperAgent: 'both',
    allowManualWithAuto: true,
    startingCapital: 100000,
    defaultInstrument: 'NIFTY',
    showInResults: {
      strategy: true,
      timeframe: true,
      lots: true,
      entryExit: true,
      brokerage: true,
      stopTarget: true,
      trailing: true,
      grossPnl: false,
      netPnl: true,
      duration: true,
      note: false,
    },
    settingsOpen: false,
    updatedAt: new Date().toISOString(),
  };
}

export function readPaperTradeSettings(): PaperTradeSettings {
  const base = defaultPaperTradeSettings();
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(PAPER_TRADE_LS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PaperTradeSettings> & LegacyPaperPatch;
    const paperAgent: PaperAgent =
      parsed.paperAgent === 'jimbo'
        ? 'jimbo'
        : parsed.paperAgent === 'both'
          ? 'both'
          : parsed.paperAgent === 'nejoic'
            ? 'nejoic'
            : 'both';
    return {
      ...base,
      ...parsed,
      paperAgent,
      allowManualWithAuto: parsed.allowManualWithAuto !== false,
      showInResults: { ...base.showInResults, ...(parsed.showInResults || {}) },
    };
  } catch {
    return base;
  }
}

/** One-time: pull legacy paper SL/strategy fields into Nejoic storage */
export function migrateLegacyPaperIntoNejoic(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PAPER_TRADE_LS_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as LegacyPaperPatch;
    if (!legacy.strategyIds && legacy.targetPoints == null) return;

    const nejoicRaw = localStorage.getItem('trademindpro_nejoic_v1');
    if (!nejoicRaw) return;
    const nejoic = JSON.parse(nejoicRaw) as { settings?: Record<string, unknown> };
    const s = nejoic.settings || {};
    let changed = false;
    const patch: Record<string, unknown> = { ...s };
    if (legacy.brokeragePerLot != null && s.brokeragePerLot == null) {
      patch.brokeragePerLot = legacy.brokeragePerLot;
      changed = true;
    }
    if (legacy.targetPoints != null && s.targetPoints == null) {
      patch.targetPoints = legacy.targetPoints;
      changed = true;
    }
    if (legacy.stopLossPoints != null && s.stopLossPoints == null) {
      patch.stopLossPoints = legacy.stopLossPoints;
      changed = true;
    }
    if (legacy.trailingStopPoints != null && s.trailingStopPoints == null) {
      patch.trailingStopPoints = legacy.trailingStopPoints;
      changed = true;
    }
    if (legacy.trailingActivatePoints != null && s.trailingActivatePoints == null) {
      patch.trailingActivatePoints = legacy.trailingActivatePoints;
      changed = true;
    }
    if (legacy.strategyIds?.length && !s.strategyIds) {
      patch.strategyIds = legacy.strategyIds;
      changed = true;
    }
    if (changed) {
      nejoic.settings = patch;
      localStorage.setItem('trademindpro_nejoic_v1', JSON.stringify(nejoic));
      window.dispatchEvent(new Event('trademindpro-nejoic-sync'));
    }
  } catch {
    /* ignore */
  }
}

export function writePaperTradeSettings(
  patch: Partial<PaperTradeSettings>
): PaperTradeSettings {
  const prev = readPaperTradeSettings();
  const next: PaperTradeSettings = {
    ...prev,
    ...patch,
    paperAgent:
      patch.paperAgent === 'jimbo'
        ? 'jimbo'
        : patch.paperAgent === 'both'
          ? 'both'
          : patch.paperAgent === 'nejoic'
            ? 'nejoic'
            : prev.paperAgent,
    allowManualWithAuto:
      patch.allowManualWithAuto !== undefined ? patch.allowManualWithAuto !== false : prev.allowManualWithAuto,
    startingCapital: Math.max(
      1000,
      Math.round(Number(patch.startingCapital ?? prev.startingCapital) || 100000)
    ),
    showInResults: {
      ...prev.showInResults,
      ...(patch.showInResults || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(PAPER_TRADE_LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PAPER_TRADE_SYNC));
  }
  return next;
}
