/** Sidebar UI prefs — localStorage + cloud sync. */

export const SIDEBAR_COLLAPSED_KEY = 'trademindpro_sidebar_collapsed';
export const SIDEBAR_GROUPS_KEY = 'trademindpro_sidebar_groups_v1';
export const SIDEBAR_MENUS_KEY = 'trademindpro_sidebar_menus_v1';

/** Accept '1'/'0', true/false, 1/0 from local or cloud. */
export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (raw == null) return false;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed === true || parsed === 1 || parsed === '1';
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readJsonPref<T extends Record<string, boolean>>(key: string): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {} as T;
    return parsed as T;
  } catch {
    return {} as T;
  }
}

export function writeJsonPref(key: string, value: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
