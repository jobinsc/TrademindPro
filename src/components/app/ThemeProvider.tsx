'use client';

import { useEffect, type ReactNode } from 'react';
import { applySiteTheme, readSiteTheme } from '@/lib/theme-prefs';

/** Keeps <html class="dark"> in sync after hydration (inline script handles first paint). */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applySiteTheme(readSiteTheme());
  }, []);
  return children;
}
