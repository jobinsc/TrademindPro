'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isUpstoxConnected, upstoxNeedsDailyRelogin } from '@/lib/upstox-client';

type Issue = {
  id: string;
  severity: 'error' | 'warn';
  message: string;
};

type HealthPayload = {
  ok?: boolean;
  label?: string;
  issues?: Issue[];
  checkedAt?: string;
};

/**
 * Top-of-app status strip: exact problems, or "Up and running".
 * Never names data vendors.
 */
export default function AppSystemStatus() {
  const [label, setLabel] = useState('Checking system…');
  const [ok, setOk] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const run = useCallback(async () => {
    const local: Issue[] = [];

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      local.push({
        id: 'offline',
        severity: 'error',
        message: 'Your device is offline — the app cannot refresh live data.',
      });
    }

    try {
      localStorage.setItem('trademindpro_health_ping', '1');
      localStorage.removeItem('trademindpro_health_ping');
    } catch {
      local.push({
        id: 'storage',
        severity: 'error',
        message: 'Browser storage is blocked — login and saved data may fail.',
      });
    }

    if (isUpstoxConnected() && upstoxNeedsDailyRelogin()) {
      local.push({
        id: 'broker',
        severity: 'warn',
        message: 'Broker session needs a fresh login in Terminal for the best live quotes.',
      });
    }

    let remote: HealthPayload = {};
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      remote = (await res.json()) as HealthPayload;
      if (!res.ok) {
        local.push({
          id: 'api',
          severity: 'error',
          message: 'System health check failed — some services may be down.',
        });
      }
    } catch {
      local.push({
        id: 'api',
        severity: 'error',
        message: 'Cannot reach the server health check.',
      });
    }

    const merged = [...local, ...(remote.issues || [])];
    // Dedupe by id
    const byId = new Map<string, Issue>();
    for (const i of merged) byId.set(i.id, i);
    const all = Array.from(byId.values());
    const hasError = all.some((i) => i.severity === 'error');
    const hasWarn = all.some((i) => i.severity === 'warn');

    setOk(!hasError);
    setIssues(all);
    if (hasError) {
      setLabel('Issues detected');
      setOpen(true);
      setDismissed(false);
    } else if (hasWarn) {
      setLabel('Up and running (minor notices)');
    } else {
      setLabel(remote.label || 'Up and running');
    }
  }, []);

  useEffect(() => {
    void run();
    const id = window.setInterval(() => void run(), 30_000);
    const onOnline = () => void run();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
    };
  }, [run]);

  if (dismissed && ok) return null;

  const showPanel = open || !ok;

  return (
    <div
      className={cn(
        'border-b px-3 py-1.5 md:px-5',
        ok
          ? 'border-emerald-200/80 bg-emerald-50/90'
          : 'border-amber-200 bg-amber-50/95'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[12px] font-bold">
          {ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2} />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" strokeWidth={2} />
          )}
          <span className={ok ? 'text-emerald-800' : 'text-amber-900'}>{label}</span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/40">
          {showPanel ? 'Hide' : 'Details'}
        </span>
      </button>

      {showPanel && (
        <div className="relative mt-1.5 rounded-lg border border-[#cfe0ee]/80 bg-white/90 px-3 py-2">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setOpen(false);
              if (ok) setDismissed(true);
            }}
            className="absolute right-2 top-2 rounded p-0.5 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {issues.length === 0 ? (
            <p className="pr-6 text-[12px] font-semibold text-emerald-800">
              Up and running — market data, app storage, and core services look healthy.
            </p>
          ) : (
            <ul className="space-y-1 pr-6">
              {issues.map((i) => (
                <li
                  key={i.id}
                  className={cn(
                    'text-[12px] font-semibold leading-snug',
                    i.severity === 'error' ? 'text-rose-700' : 'text-amber-800'
                  )}
                >
                  {i.severity === 'error' ? 'Problem: ' : 'Notice: '}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
