'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  HeartPulse,
  Monitor,
  ListOrdered,
  Briefcase,
  Eye,
  Radar,
  CandlestickChart,
  Bell,
  Workflow,
  Zap,
  FlaskConical,
  Shield,
  Bot,
  Crown,
  Settings,
  FileText,
  LogOut,
  Sparkles,
  LineChart,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  adminOnly?: boolean;
  children?: NavItem[];
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/app/calculator', label: 'Calculator', icon: Calculator },
    ],
  },
  {
    title: 'Journal & Analytics',
    items: [
      { href: '/app/journal', label: 'Trade Journal', icon: BookOpen },
      { href: '/app/analytics', label: 'Performance', icon: BarChart3 },
      { href: '/app/reviews', label: 'Reviews & Psychology', icon: HeartPulse },
    ],
  },
  {
    title: 'Live Terminal',
    items: [
      { href: '/app/terminal', label: 'Broker Terminal', icon: Monitor },
      { href: '/app/positions', label: 'Positions & Orders', icon: ListOrdered },
      { href: '/app/holdings', label: 'Holdings & Portfolio', icon: Briefcase },
      { href: '/app/watchlist', label: 'Watchlist', icon: Eye },
    ],
  },
  {
    title: 'NSE & BSE Scanner',
    items: [
      { href: '/app/scanner', label: 'Stock Scanner', icon: Radar },
      { href: '/app/options-scanner', label: 'Options Scanner', icon: CandlestickChart },
      { href: '/app/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    title: 'Automated Trading',
    items: [
      { href: '/app/strategies', label: 'Strategy Builder', icon: Workflow },
      { href: '/app/automation', label: 'Start / Stop', icon: Zap },
      { href: '/app/paper-trading', label: 'Paper Trading', icon: FileText },
      { href: '/app/backtesting', label: 'Backtesting', icon: FlaskConical },
      { href: '/app/risk', label: 'Risk Management', icon: Shield },
    ],
  },
  {
    title: 'AI Agent System',
    items: [
      {
        href: '/app/nejoic',
        label: 'Nejoic (Nifty)',
        icon: Sparkles,
        adminOnly: true,
        exact: true,
        children: [
          {
            href: '/app/nejoic/settings',
            label: 'Settings',
            icon: Settings,
            adminOnly: true,
            exact: true,
          },
        ],
      },
      {
        href: '/app/jimbo',
        label: 'Jimbo (Stocks)',
        icon: LineChart,
        adminOnly: true,
        exact: true,
        children: [
          {
            href: '/app/jimbo/settings',
            label: 'Settings',
            icon: Settings,
            adminOnly: true,
            exact: true,
          },
        ],
      },
      { href: '/app/ai', label: 'AI Agents Hub', icon: Bot },
    ],
  },
  {
    title: 'Admin',
    items: [{ href: '/app/admin', label: 'Admin Console', icon: Crown }],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  nested,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        'relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] font-medium transition',
        collapsed ? 'justify-center px-2' : nested ? 'px-3 pl-9' : 'px-3',
        active
          ? 'bg-white/90 text-sky-deep shadow-[inset_3px_0_0_0_#1a6ba8]'
          : 'text-sky-ink/70 hover:bg-white/55 hover:text-sky-ink'
      )}
    >
      <Icon className={cn('shrink-0', nested ? 'h-3.5 w-3.5' : 'h-4 w-4')} strokeWidth={1.75} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export default function AppSidebar({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  useEffect(() => {
    setOpenMenus((prev) => {
      const next = { ...prev };
      for (const group of navGroups) {
        for (const item of group.items) {
          if (!item.children?.length) continue;
          if (pathname.startsWith(`${item.href}/`)) {
            next[item.href] = true;
          }
        }
      }
      return next;
    });
  }, [pathname]);

  function toggleMenu(href: string) {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function handleLogout() {
    logout();
    router.push('/');
  }

  const visibleGroups = navGroups
    .filter((group) => {
      if (group.title === 'Admin') return isAdmin;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => ({
          ...item,
          children: item.children?.filter((c) => !c.adminOnly || isAdmin),
        })),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-r border-[#b9d7ea] transition-[width] duration-200',
        'bg-[linear-gradient(180deg,#d9eef8_0%,#e8f4fb_45%,#dff0f9_100%)]',
        collapsed ? 'w-[72px]' : 'w-[250px]'
      )}
    >
      <div className="border-b border-[#c5dcec]/80 px-3 py-3">
        <div className={cn('flex items-start gap-2', collapsed ? 'flex-col items-center' : '')}>
          <Link href="/" className={cn('min-w-0 flex-1', collapsed && 'text-center')}>
            {collapsed ? (
              <p className="font-display text-[15px] font-bold text-sky-deep">TM</p>
            ) : (
              <>
                <p className="font-display text-[16px] font-semibold tracking-tight text-sky-ink">
                  TradeMind<span className="text-sky-deep"> Pro</span>
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-sky-ink/45">
                  AI Trading Operating System
                </p>
              </>
            )}
          </Link>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded-lg p-1.5 text-sky-deep transition hover:bg-white/70"
            >
              {collapsed ? (
                <PanelLeft className="h-4 w-4" strokeWidth={2} />
              ) : (
                <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mx-3 mt-3 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-[#c5dcec]">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold text-sky-ink">
              {user?.name || 'Trader'}
            </p>
            {isAdmin && (
              <span className="shrink-0 rounded-md bg-sky-deep/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-deep">
                Admin
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-sky-ink/50">{user?.email}</p>
        </div>
      )}

      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-ink/40">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const expanded = Boolean(openMenus[item.href]) && !collapsed;
                return (
                  <div key={item.href}>
                    <div className="flex items-center gap-0.5">
                      <div className="min-w-0 flex-1">
                        <NavLink
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          active={isActive(item.href, item.exact)}
                          collapsed={collapsed}
                        />
                      </div>
                      {hasChildren && !collapsed && (
                        <button
                          type="button"
                          aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          aria-expanded={expanded}
                          onClick={() => toggleMenu(item.href)}
                          className="mr-1 rounded-lg p-1.5 text-sky-ink/45 transition hover:bg-white/60 hover:text-sky-ink"
                        >
                          <ChevronRight
                            className={cn(
                              'h-3.5 w-3.5 transition-transform',
                              expanded && 'rotate-90'
                            )}
                            strokeWidth={2}
                          />
                        </button>
                      )}
                    </div>
                    {hasChildren && expanded && (
                      <div className="mt-0.5 ml-5 space-y-0.5 border-l border-[#b9d7ea]">
                        {item.children!.map((child) => (
                          <NavLink
                            key={child.href}
                            href={child.href}
                            label={child.label}
                            icon={child.icon}
                            nested
                            active={isActive(child.href, child.exact)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-[#c5dcec]/80 px-2 py-3">
        <NavLink
          href="/app/settings"
          label="Settings & Brokers"
          icon={Settings}
          active={isActive('/app/settings')}
          collapsed={collapsed}
        />
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl py-2 text-[13px] font-medium text-sky-ink/65 transition hover:bg-rose-50 hover:text-rose-600',
            collapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && 'Log out'}
        </button>
      </div>
    </aside>
  );
}
