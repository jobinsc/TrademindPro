'use client';

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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  /** Hide from non-admin users */
  adminOnly?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
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
      { href: '/app/automation', label: 'Auto Execution', icon: Zap },
      { href: '/app/paper-trading', label: 'Paper Trading', icon: FileText },
      { href: '/app/backtesting', label: 'Backtesting', icon: FlaskConical },
      { href: '/app/risk', label: 'Risk Management', icon: Shield },
    ],
  },
  {
    title: 'AI Agent System',
    items: [
      { href: '/app/nejoic', label: 'Nejoic (Nifty)', icon: Sparkles, adminOnly: true },
      { href: '/app/nejoic/settings', label: 'Nejoic Settings', icon: Settings, adminOnly: true },
      { href: '/app/jimbo', label: 'Jimbo (Stocks)', icon: LineChart, adminOnly: true },
      { href: '/app/jimbo/settings', label: 'Jimbo Settings', icon: Settings, adminOnly: true },
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
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition',
        active
          ? 'bg-sky-mist text-sky-deep shadow-[inset_3px_0_0_0_#1a6ba8]'
          : 'text-sky-ink/65 hover:bg-sky-soft hover:text-sky-ink'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="flex h-screen w-[250px] shrink-0 flex-col border-r border-[#cfe0ee] bg-white">
      <div className="border-b border-[#e8f2fa] px-4 py-4">
        <Link href="/" className="block">
          <p className="font-display text-[16px] font-semibold tracking-tight text-sky-ink">
            TradeMind<span className="text-sky-deep"> Pro</span>
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-sky-ink/40">
            AI Trading Operating System
          </p>
        </Link>
      </div>

      <div className="mx-3 mt-3 rounded-xl bg-sky-soft px-3 py-2.5 ring-1 ring-[#cfe0ee]">
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

      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-ink/35">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  active={isActive(item.href, item.exact)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-[#e8f2fa] px-2 py-3">
        <NavLink
          href="/app/settings"
          label="Settings & Brokers"
          icon={Settings}
          active={isActive('/app/settings')}
        />
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-sky-ink/65 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Log out
        </button>
      </div>
    </aside>
  );
}
