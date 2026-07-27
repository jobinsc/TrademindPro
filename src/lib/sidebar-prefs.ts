/** Sidebar UI prefs — localStorage + cookie backup + cloud sync. */

export const SIDEBAR_COLLAPSED_KEY = 'trademindpro_sidebar_collapsed';
export const SIDEBAR_GROUPS_KEY = 'trademindpro_sidebar_groups_v1';
export const SIDEBAR_MENUS_KEY = 'trademindpro_sidebar_menus_v1';
export const SIDEBAR_META_KEY = 'trademindpro_sidebar_meta_v1';

const COOKIE = 'tmp_sidebar_collapsed';

export type SidebarMeta = {
  collapsed: boolean;
  groups: Record<string, boolean>;
  menus: Record<string, boolean>;
  updatedAt: number;
};

/** Default: collapsed rail + closed sections (heavy menu). */
export function defaultSidebarMeta(): SidebarMeta {
  return {
    collapsed: true,
    groups: {},
    menus: {},
    updatedAt: 0,
  };
}

function readCookieCollapsed(): boolean | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)tmp_sidebar_collapsed=(1|0)/);
  if (!m) return null;
  return m[1] === '1';
}

function writeCookieCollapsed(collapsed: boolean): void {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 400; // ~400 days
  document.cookie = `${COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function coerceCollapsed(raw: string | null): boolean | null {
  if (raw == null) return null;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === true || parsed === 1 || parsed === '1') return true;
    if (parsed === false || parsed === 0 || parsed === '0') return false;
    if (parsed && typeof parsed === 'object' && 'collapsed' in (parsed as object)) {
      return Boolean((parsed as { collapsed: unknown }).collapsed);
    }
  } catch {
    /* ignore */
  }
  return null;
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

export function readSidebarMeta(): SidebarMeta {
  const base = defaultSidebarMeta();
  if (typeof window === 'undefined') return base;

  try {
    const raw = localStorage.getItem(SIDEBAR_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarMeta>;
      if (parsed && typeof parsed === 'object') {
        return {
          collapsed: Boolean(parsed.collapsed),
          groups: (parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {}) as Record<
            string,
            boolean
          >,
          menus: (parsed.menus && typeof parsed.menus === 'object' ? parsed.menus : {}) as Record<
            string,
            boolean
          >,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        };
      }
    }
  } catch {
    /* migrate from legacy keys below */
  }

  const legacyCollapsed = coerceCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY));
  const cookieCollapsed = readCookieCollapsed();
  const collapsed =
    legacyCollapsed ?? cookieCollapsed ?? true; /* heavy menu → start collapsed */

  return {
    collapsed,
    groups: readJsonPref(SIDEBAR_GROUPS_KEY),
    menus: readJsonPref(SIDEBAR_MENUS_KEY),
    updatedAt: Date.now(),
  };
}

export function writeSidebarMeta(partial: Partial<SidebarMeta> & { collapsed?: boolean }): SidebarMeta {
  const prev = readSidebarMeta();
  const next: SidebarMeta = {
    collapsed: partial.collapsed ?? prev.collapsed,
    groups: partial.groups ?? prev.groups,
    menus: partial.menus ?? prev.menus,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(SIDEBAR_META_KEY, JSON.stringify(next));
    // Legacy keys for older sync / readers
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next.collapsed ? '1' : '0');
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next.groups));
    localStorage.setItem(SIDEBAR_MENUS_KEY, JSON.stringify(next.menus));
  } catch {
    /* ignore */
  }
  writeCookieCollapsed(next.collapsed);
  return next;
}

export function readSidebarCollapsed(): boolean {
  return readSidebarMeta().collapsed;
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  writeSidebarMeta({ collapsed });
}

/** Merge cloud vs local by updatedAt — newer wins (stops stale cloud undoing collapse). */
export function mergeSidebarMetaFromCloud(cloudValue: unknown): SidebarMeta {
  const local = readSidebarMeta();
  let cloud: SidebarMeta | null = null;

  if (cloudValue && typeof cloudValue === 'object' && !Array.isArray(cloudValue)) {
    const o = cloudValue as Partial<SidebarMeta> & { collapsed?: unknown };
    cloud = {
      collapsed: Boolean(o.collapsed),
      groups: (o.groups && typeof o.groups === 'object' ? o.groups : {}) as Record<string, boolean>,
      menus: (o.menus && typeof o.menus === 'object' ? o.menus : {}) as Record<string, boolean>,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    };
  } else {
    // Legacy cloud: plain '1'/'0'/boolean for collapsed only
    const c = coerceCollapsed(
      typeof cloudValue === 'string' || typeof cloudValue === 'number' || typeof cloudValue === 'boolean'
        ? String(cloudValue)
        : null
    );
    if (c != null) {
      cloud = { ...local, collapsed: c, updatedAt: 0 };
    }
  }

  if (!cloud) return local;
  // Prefer local if timestamps equal or local newer; prefer cloud only if clearly newer
  if (cloud.updatedAt > local.updatedAt) {
    writeSidebarMeta({ ...cloud, updatedAt: cloud.updatedAt });
    return readSidebarMeta();
  }
  // Keep local collapse; rewrite so cookie+legacy stay aligned
  writeSidebarMeta({ ...local, updatedAt: Math.max(local.updatedAt, Date.now()) });
  return readSidebarMeta();
}
