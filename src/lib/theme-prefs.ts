/** Site-wide light/dark theme — stored on device, applied on <html class="dark"> */

export const THEME_KEY = 'trademindpro_theme_v1';
export type SiteTheme = 'light' | 'dark';

export const THEME_EVENT = 'trademindpro-theme';

export function readSiteTheme(): SiteTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function writeSiteTheme(theme: SiteTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applySiteTheme(theme: SiteTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function toggleSiteTheme(): SiteTheme {
  const next: SiteTheme = readSiteTheme() === 'dark' ? 'light' : 'dark';
  writeSiteTheme(next);
  applySiteTheme(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_EVENT));
  }
  return next;
}
