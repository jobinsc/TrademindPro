'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AppSidebar from '@/components/app/AppSidebar';
import AppTopBar from '@/components/app/AppTopBar';
import AppSystemStatus from '@/components/app/AppSystemStatus';
import NavHistoryTracker from '@/components/app/NavHistoryTracker';
import { ChartPeekHost } from '@/components/chart/SymbolChartLink';
import NejoicRuntimeHost from '@/components/nejoic/NejoicRuntimeHost';

const COLLAPSE_KEY = 'trademindpro_sidebar_collapsed';

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
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
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
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
  /** Phone: icon rail only. Desktop: user preference. */
  const sidebarCollapsed = isWide ? desktopCollapsed : true;

  return (
    <div className="flex min-h-dvh w-full bg-sky-soft text-sky-ink">
      <NavHistoryTracker />
      <ChartPeekHost />
      <NejoicRuntimeHost />
      {/* Sidebar — always visible (icon rail on phone, full on desktop) */}
      <div className="sticky top-0 z-40 flex h-dvh shrink-0">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={isWide ? toggleDesktop : openMobile}
          variant="desktop"
        />
      </div>

      {/* Mobile drawer */}
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
          collapsed={sidebarCollapsed}
          onToggleCollapse={isWide ? toggleDesktop : openMobile}
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
