import { CLOUD_SYNC_KEYS } from '@/lib/cloud-sync-keys';

export { CLOUD_SYNC_KEYS };

const SYNC_EVENT = 'trademindpro-cloud-synced';

function parseStored(raw: string | null): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function serializeStored(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Pull cloud rows into localStorage via server API. If empty, push local up. */
export async function pullCloudData(_userId?: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'No window' };

  try {
    const res = await fetch('/api/sync', { credentials: 'include' });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      rows?: { key: string; value: unknown }[];
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Pull failed' };

    const rows = data.rows || [];
    if (rows.length === 0) {
      return pushCloudData();
    }

    for (const row of rows) {
      if (!CLOUD_SYNC_KEYS.includes(row.key as (typeof CLOUD_SYNC_KEYS)[number])) continue;
      if (row.value === null || row.value === undefined) continue;
      localStorage.setItem(row.key, serializeStored(row.value));
    }

    window.dispatchEvent(new Event(SYNC_EVENT));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pull failed' };
  }
}

/** Push current localStorage values to cloud via server API. */
export async function pushCloudData(_userId?: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'No window' };

  const rows = CLOUD_SYNC_KEYS.map((key) => {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return { key, value: parseStored(raw) };
  }).filter(Boolean) as { key: string; value: unknown }[];

  if (rows.length === 0) return { ok: true };

  try {
    const res = await fetch('/api/sync', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Push failed' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Push failed' };
  }
}

export function onCloudSynced(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}
