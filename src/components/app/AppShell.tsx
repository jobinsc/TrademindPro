'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AppSidebar from '@/components/app/AppSidebar';
import AppTopBar from '@/components/app/AppTopBar';
import AppSystemStatus from '@/components/app/AppSystemStatus';
import NavHistoryTracker from '@/components/app/NavHistoryTracker';
import { ChartPeekHost } from '@/components/chart/SymbolChartLink';
import NejoicRuntimeHost from '@/components/nejoic/NejoicRuntimeHost';
import { onCloudSynced, pushCloudData } from '@/lib/cloud-sync';
import { readSidebarCollapsed, writeSidebarCollapsed } from '@/lib/sidebar-prefs';

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setReady(true);
    // After login/cloud pull, re-apply so we don't flash expanded forever
    return onCloudSynced(() => {
      setCollapsed(readSidebarCollapsed());
    });
  }, []);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggleDesktop() {
    setCollapsed((c) => {
      const next = !c;
      writeSidebarCollapsed(next);
      void pushCloudData();
      return next;
    });
  }

  function openMobile() {
    setMobileOpen(true);
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  const desktopCollapsed = ready ? collapsed : false;

  return (
    <div className="flex min-h-dvh w-full bg-sky-soft text-sky-ink">
      <NavHistoryTracker />
      <ChartPeekHost />
      <NejoicRuntimeHost />
      {/* Desktop sidebar — full or icon rail from md up */}
      <div className="sticky top-0 z-40 hidden h-dvh min-h-0 shrink-0 md:flex">
        <AppSidebar
          collapsed={desktopCollapsed}
          onToggleCollapse={toggleDesktop}
          variant="desktop"
        />
      </div>

      {/* Mobile drawer — tap Menu in top bar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-sky-ink/40"
            onClick={closeMobile}
          />
          <div className="absolute left-0 top-0 z-[61] h-full shadow-xl">
            <AppSidebar
              collapsed={false}
              onToggleCollapse={closeMobile}
              variant="mobile"
              onNavigate={closeMobile}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <AppTopBar
          collapsed={desktopCollapsed}
          onToggleCollapse={toggleDesktop}
          onOpenMobile={openMobile}
        />
        <AppSystemStatus />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#eef6fb_0%,#f7fbfe_35%,#ffffff_70%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
