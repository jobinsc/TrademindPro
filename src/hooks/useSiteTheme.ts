'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  THEME_EVENT,
  THEME_KEY,
  applySiteTheme,
  readSiteTheme,
  toggleSiteTheme,
  type SiteTheme,
} from '@/lib/theme-prefs';

export function useSiteTheme() {
  const [theme, setTheme] = useState<SiteTheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = readSiteTheme();
    setTheme(current);
    applySiteTheme(current);
    setReady(true);

    function sync() {
      const t = readSiteTheme();
      setTheme(t);
      applySiteTheme(t);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === THEME_KEY || !e.key) sync();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme(toggleSiteTheme());
  }, []);

  return { theme, ready, toggle, isDark: theme === 'dark' };
}
