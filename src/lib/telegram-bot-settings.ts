/**
 * Telegram Bot settings — isolated from Nejoic / Paper trading.
 * Only controls what gets analysed and sent to Telegram.
 */

import type { CatalogStrategyId } from '@/lib/strategy-catalog';
import type { NejoicAnalysisStyle, NejoicTimeframeId } from '@/lib/nejoic-options';
import { normalizeStrategyIds } from '@/lib/nejoic-options';

export type TelegramInstrument = 'AUTO' | 'NIFTY' | 'GOLD' | 'BTC';
export type TelegramMessageStyle = 'full' | 'compact' | 'signal_only';

export type TelegramBotSettings = {
  /** Master switch — stop / start all Telegram pushes */
  enabled: boolean;
  instrument: TelegramInstrument;
  timeframe: NejoicTimeframeId;
  heartbeatMinutes: number;
  messageStyle: TelegramMessageStyle;
  includeStudies: boolean;
  /** Strategies Telegram Live Pulse may evaluate */
  strategyIds: CatalogStrategyId[];
  analysisStyle: NejoicAnalysisStyle;
  minConfidence: number;
  leftBars: number;
  rightBars: number;
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  breakoutLookback: number;
  orbMinutes: number;
  updatedAt: string;
};

export const TELEGRAM_BOT_LS_KEY = 'trademindpro_telegram_bot_v1';
export const TELEGRAM_BOT_SYNC = 'trademindpro-telegram-bot-sync';

export function defaultTelegramBotSettings(): TelegramBotSettings {
  return {
    enabled: true,
    instrument: 'AUTO',
    timeframe: '15m',
    heartbeatMinutes: 15,
    messageStyle: 'full',
    includeStudies: true,
    strategyIds: ['price_action_hhll', 'swing_hl'],
    analysisStyle: 'strict',
    minConfidence: 70,
    leftBars: 5,
    rightBars: 5,
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    breakoutLookback: 20,
    orbMinutes: 15,
    updatedAt: new Date().toISOString(),
  };
}

/** Migrate once from legacy Nejoic telegram* fields if present. */
function migrateFromNejoic(): Partial<TelegramBotSettings> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('trademindpro_nejoic_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      settings?: {
        telegramNotify?: boolean;
        telegramInstrument?: TelegramInstrument;
        telegramTimeframe?: string;
        telegramHeartbeatMinutes?: number;
        telegramIncludeStudies?: boolean;
        strategyIds?: CatalogStrategyId[];
        strategyId?: CatalogStrategyId;
        analysisStyle?: NejoicAnalysisStyle;
        minConfidence?: number;
        leftBars?: number;
        rightBars?: number;
      };
    };
    const s = parsed.settings;
    if (!s) return null;
    return {
      enabled: s.telegramNotify !== false,
      instrument: s.telegramInstrument || 'AUTO',
      timeframe: (s.telegramTimeframe as NejoicTimeframeId) || '15m',
      heartbeatMinutes: s.telegramHeartbeatMinutes || 15,
      includeStudies: s.telegramIncludeStudies !== false,
      strategyIds: normalizeStrategyIds(s.strategyIds, s.strategyId),
      analysisStyle: s.analysisStyle || 'strict',
      minConfidence: s.minConfidence ?? 70,
      leftBars: s.leftBars ?? 5,
      rightBars: s.rightBars ?? 5,
    };
  } catch {
    return null;
  }
}

export function readTelegramBotSettings(): TelegramBotSettings {
  const base = defaultTelegramBotSettings();
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(TELEGRAM_BOT_LS_KEY);
    if (!raw) {
      const migrated = migrateFromNejoic();
      if (migrated) {
        const next = {
          ...base,
          ...migrated,
          strategyIds: normalizeStrategyIds(migrated.strategyIds, migrated.strategyIds?.[0]),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(TELEGRAM_BOT_LS_KEY, JSON.stringify(next));
        return next;
      }
      return base;
    }
    const parsed = JSON.parse(raw) as Partial<TelegramBotSettings>;
    const merged = { ...base, ...parsed };
    merged.strategyIds = normalizeStrategyIds(merged.strategyIds, merged.strategyIds?.[0]);
    return merged;
  } catch {
    return base;
  }
}

export function writeTelegramBotSettings(
  patch: Partial<TelegramBotSettings>
): TelegramBotSettings {
  const prev = readTelegramBotSettings();
  const next: TelegramBotSettings = {
    ...prev,
    ...patch,
    strategyIds: normalizeStrategyIds(
      patch.strategyIds ?? prev.strategyIds,
      patch.strategyIds?.[0] ?? prev.strategyIds[0]
    ),
    heartbeatMinutes: Math.max(
      3,
      Math.min(60, Math.floor(Number(patch.heartbeatMinutes ?? prev.heartbeatMinutes) || 15))
    ),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(TELEGRAM_BOT_LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(TELEGRAM_BOT_SYNC));
  }
  return next;
}

/** Shape expected by buildLivePulse / Nejoic analysis from Telegram-only settings. */
export function telegramSettingsAsPulseInput(tg: TelegramBotSettings) {
  return {
    telegramNotify: tg.enabled,
    telegramInstrument: tg.instrument,
    telegramTimeframe: tg.timeframe,
    telegramHeartbeatMinutes: tg.heartbeatMinutes,
    telegramIncludeStudies: tg.includeStudies,
    messageStyle: tg.messageStyle,
    strategyIds: tg.strategyIds,
    strategyId: tg.strategyIds[0] ?? 'price_action_hhll',
    analysisStyle: tg.analysisStyle,
    minConfidence: tg.minConfidence,
    leftBars: tg.leftBars,
    rightBars: tg.rightBars,
    emaFast: tg.emaFast,
    emaSlow: tg.emaSlow,
    rsiPeriod: tg.rsiPeriod,
    rsiOversold: tg.rsiOversold,
    rsiOverbought: tg.rsiOverbought,
    breakoutLookback: tg.breakoutLookback,
    orbMinutes: tg.orbMinutes,
    primaryTimeframe: tg.timeframe,
  };
}
