'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AppSidebar from '@/components/app/AppSidebar';
import AppTopBar from '@/components/app/AppTopBar';

const COLLAPSE_KEY = 'trademindpro_sidebar_collapsed';

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  // Close mobile drawer on resize to desktop
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

  return (
    <div className="flex min-h-dvh bg-sky-soft text-sky-ink">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <AppSidebar
          collapsed={desktopCollapsed}
          onToggleCollapse={toggleDesktop}
          variant="desktop"
        />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-sky-ink/40"
            onClick={closeMobile}
          />
          <div className="absolute left-0 top-0 h-full shadow-xl">
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
        <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#eef6fb_0%,#f7fbfe_35%,#ffffff_70%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
