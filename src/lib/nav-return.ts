/** Safe in-app return path helpers for nested feature pages */

const PREV_KEY = 'trademindpro_nav_prev';
const CUR_KEY = 'trademindpro_nav_cur';

export function isSafeAppPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/app')) return false;
  if (path.includes('://') || path.includes('\\') || path.includes('..')) return false;
  return true;
}

/** Call on every /app route change so Back can return to where the user started. */
export function trackAppPath(pathname: string) {
  if (typeof window === 'undefined') return;
  if (!pathname.startsWith('/app')) return;
  try {
    const cur = sessionStorage.getItem(CUR_KEY);
    if (cur && cur !== pathname) {
      sessionStorage.setItem(PREV_KEY, cur);
    }
    sessionStorage.setItem(CUR_KEY, pathname);
  } catch {
    /* ignore */
  }
}

export function getReturnPath(fallback: string, fromQuery?: string | null): string {
  if (isSafeAppPath(fromQuery) && fromQuery !== fallback) return fromQuery;
  if (typeof window !== 'undefined') {
    try {
      const prev = sessionStorage.getItem(PREV_KEY);
      const cur = sessionStorage.getItem(CUR_KEY);
      if (isSafeAppPath(prev) && prev !== cur) return prev;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

/** Append ?from=current so nested pages can return here. */
export function hrefWithFrom(href: string, fromPath: string): string {
  if (!isSafeAppPath(fromPath)) return href;
  const qIndex = href.indexOf('?');
  const path = qIndex >= 0 ? href.slice(0, qIndex) : href;
  const search = qIndex >= 0 ? href.slice(qIndex + 1) : '';
  const params = new URLSearchParams(search);
  params.set('from', fromPath);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
