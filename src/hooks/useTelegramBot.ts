'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultTelegramBotSettings,
  readTelegramBotSettings,
  writeTelegramBotSettings,
  TELEGRAM_BOT_SYNC,
  type TelegramBotSettings,
} from '@/lib/telegram-bot-settings';

export function useTelegramBot() {
  const [settings, setSettings] = useState<TelegramBotSettings>(defaultTelegramBotSettings());
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(() => {
    setSettings(readTelegramBotSettings());
  }, []);

  useEffect(() => {
    hydrate();
    setReady(true);
    const onSync = () => hydrate();
    window.addEventListener(TELEGRAM_BOT_SYNC, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(TELEGRAM_BOT_SYNC, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [hydrate]);

  const update = useCallback((patch: Partial<TelegramBotSettings>) => {
    const next = writeTelegramBotSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { ready, settings, update };
}
