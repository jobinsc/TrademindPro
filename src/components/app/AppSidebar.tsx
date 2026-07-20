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
  X,
  Send,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import TradeMindLogo from '@/components/app/TradeMindLogo';
import { hrefWithFrom } from '@/lib/nav-return';

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
      { href: '/app/chart', label: 'Charts', icon: CandlestickChart },
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
      { href: '/app/options-scanner', label: 'Options Scanner', icon: LineChart },
      { href: '/app/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    title: 'Automated Trading',
    items: [
      { href: '/app/strategies', label: 'Strategy Builder', icon: Workflow },
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
      },
      {
        href: '/app/jimbo',
        label: 'Jimbo (Stocks)',
        icon: LineChart,
        adminOnly: true,
        exact: true,
      },
      {
        href: '/app/blink',
        label: 'Blink (Scalp)',
        icon: Zap,
        adminOnly: true,
        exact: true,
      },
      {
        href: '/app/blink/results',
        label: 'Blink Results',
        icon: Zap,
        adminOnly: true,
        exact: true,
      },
      {
        href: '/app/telegram',
        label: 'Telegram Bot',
        icon: Send,
        adminOnly: true,
        exact: true,
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
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  nested?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={label}
      onClick={() => onNavigate?.()}
      className={cn(
        'relative flex items-center gap-2.5 rounded-xl py-2 text-[13px] font-semibold transition',
        collapsed ? 'justify-center px-2' : nested ? 'px-3 pl-9' : 'px-3',
        active
          ? 'bg-white text-sky-deep shadow-[inset_3px_0_0_0_#1a6ba8]'
          : 'text-sky-ink/80 hover:bg-white/70 hover:text-sky-ink'
      )}
    >
      <Icon className={cn('shrink-0', nested ? 'h-3.5 w-3.5' : 'h-4 w-4')} strokeWidth={2} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export default function AppSidebar({
  collapsed = false,
  onToggleCollapse,
  variant = 'desktop',
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
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
    void logout();
    onNavigate?.();
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
        'flex h-dvh min-w-[72px] shrink-0 flex-col border-r border-[#c5dcec] transition-[width] duration-200',
        'bg-[linear-gradient(180deg,#eaf6fc_0%,#f5fbfe_48%,#e8f4fb_100%)]',
        collapsed ? 'w-[72px]' : 'w-[250px]',
        variant === 'mobile' && 'w-[280px] max-w-[85vw]'
      )}
    >
      {/* Brand — name only, no caption */}
      <div className="border-b border-[#d5e6f0] bg-white px-3 py-3">
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <Link
            href="/app"
            onClick={() => onNavigate?.()}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3',
              collapsed && 'justify-center'
            )}
          >
            <TradeMindLogo size={collapsed ? 34 : 38} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate font-display text-[18px] font-bold leading-none tracking-tight text-[#0F2A3D]">
                  TradeMind
                  <span className="text-[#0369A1]"> Pro</span>
                </p>
                <p className="mt-1.5 truncate text-[11px] font-medium leading-none text-[#6B8496]">
                  For serious Traders
                </p>
              </div>
            )}
          </Link>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={
                variant === 'mobile'
                  ? 'Close menu'
                  : collapsed
                    ? 'Expand sidebar'
                    : 'Collapse sidebar'
              }
              className="rounded-lg p-1.5 text-[#0369A1] transition hover:bg-[#eef6fb]"
            >
              {variant === 'mobile' ? (
                <X className="h-4 w-4" strokeWidth={2} />
              ) : collapsed ? (
                <PanelLeft className="h-4 w-4" strokeWidth={2} />
              ) : (
                <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mx-3 mt-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-[#cfe0ee]">
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
          <p className="mt-0.5 truncate text-[11px] font-medium text-sky-ink/60">{user?.email}</p>
        </div>
      )}

      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto overscroll-contain px-2 pb-4">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-ink/50">
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
                          onNavigate={onNavigate}
                        />
                      </div>
                      {hasChildren && !collapsed && (
                        <button
                          type="button"
                          aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          aria-expanded={expanded}
                          onClick={() => toggleMenu(item.href)}
                          className="mr-1 rounded-lg p-1.5 text-sky-ink/50 transition hover:bg-white hover:text-sky-ink"
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
                            href={hrefWithFrom(child.href, item.href)}
                            label={child.label}
                            icon={child.icon}
                            nested
                            active={isActive(child.href, child.exact)}
                            onNavigate={onNavigate}
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
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl py-2 text-[13px] font-semibold text-sky-ink/75 transition hover:bg-rose-50 hover:text-rose-600',
            collapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed && 'Log out'}
        </button>
      </div>
    </aside>
  );
}
