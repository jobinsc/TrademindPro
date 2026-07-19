'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AppSidebar from '@/components/app/AppSidebar';
import AppTopBar from '@/components/app/AppTopBar';

const COLLAPSE_KEY = 'trademindpro_sidebar_collapsed';

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-sky-soft text-sky-ink">
      <AppSidebar collapsed={ready ? collapsed : false} onToggleCollapse={toggle} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopBar collapsed={collapsed} onToggleCollapse={toggle} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,#eef6fb_0%,#f7fbfe_35%,#ffffff_70%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
