import Link from 'next/link';
import {
  BookOpen,
  Monitor,
  Radar,
  Zap,
  Bot,
  Crown,
  ArrowRight,
  Shield,
} from 'lucide-react';
import DashboardSnapshot from '@/components/app/DashboardSnapshot';

const modules = [
  {
    href: '/app/journal',
    icon: BookOpen,
    module: 'Module 1',
    title: 'Journal & Performance',
    points: [
      'Manual & auto trade logging',
      'Psychology & mistake tracking',
      'P&L, win rate, drawdown reports',
      'Daily / weekly / monthly reviews',
    ],
  },
  {
    href: '/app/terminal',
    icon: Monitor,
    module: 'Module 2',
    title: 'Live Broker Terminal',
    points: [
      'Zerodha, Upstox, Angel One & more',
      'Live positions & floating P&L',
      'Market, Limit, SL & GTT orders',
      'Holdings, margin & risk view',
    ],
  },
  {
    href: '/app/scanner',
    icon: Radar,
    module: 'Module 3',
    title: 'NSE & BSE Scanner',
    points: [
      'Technical & fundamental scans',
      'Options chain, OI, PCR, IV',
      'Ready-made scan templates',
      'Price, pattern & volume alerts',
    ],
  },
  {
    href: '/app/strategies',
    icon: Zap,
    module: 'Module 4',
    title: 'Automated Trading',
    points: [
      'Visual & code strategy builder',
      'Backtesting & paper trading',
      'Structured + AI strategies',
      'Risk limits & emergency stop',
    ],
  },
  {
    href: '/app/ai',
    icon: Bot,
    module: 'Module 5',
    title: 'AI Agent System',
    points: [
      'Scanner, Journal & Risk agents',
      'Sentiment, News & Pattern agents',
      'Strategy builder & Backtest agents',
      'Trading Coach + Master Orchestrator',
    ],
  },
  {
    href: '/app/admin',
    icon: Crown,
    module: 'Module 6',
    title: 'Admin & Control',
    points: [
      'Users, roles & permissions',
      'Subscriptions & billing',
      'Audit logs & system health',
      'Feature flags per plan',
    ],
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
          TradeMind Pro
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-sky-ink md:text-4xl">
          Your trading operating system
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-sky-ink/60 md:text-base">
          Six modules in one platform — journal, live terminal, NSE &amp; BSE scanner,
          automation, AI agents, and admin. We build them one by one.
        </p>
      </div>

      {/* Live snapshot from journal */}
      <div className="mt-8">
        <DashboardSnapshot />
      </div>

      {/* Full module map */}
      <div className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-sky-ink md:text-2xl">
              Complete platform map
            </h2>
            <p className="mt-1 text-sm text-sky-ink/55">
              Every module from your product vision — open any to preview the screen.
            </p>
          </div>
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
          >
            Connect broker
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="group flex flex-col rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 transition hover:border-sky-mid/50 hover:shadow-[0_8px_28px_rgba(26,107,168,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-soft text-sky-deep">
                  <mod.icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  {mod.module}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-sky-ink group-hover:text-sky-deep">
                {mod.title}
              </h3>
              <ul className="mt-3 flex-1 space-y-1.5">
                {mod.points.map((point) => (
                  <li key={point} className="flex gap-2 text-[13px] leading-snug text-sky-ink/55">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-mid" />
                    {point}
                  </li>
                ))}
              </ul>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-deep">
                Open module
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Build order note */}
      <div className="mt-8 flex flex-wrap items-start gap-3 rounded-2xl border border-[#cfe0ee] bg-sky-soft/80 px-5 py-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-sky-deep" strokeWidth={1.75} />
        <div>
          <p className="font-display text-sm font-semibold text-sky-ink">
            Build order (safe &amp; clear)
          </p>
          <p className="mt-1 text-sm leading-relaxed text-sky-ink/60">
            Phase 1: Journal + Auth · Phase 2: Scanner + Terminal · Phase 3: Automation ·
            Phase 4: AI Agents · Phase 5: Scale. Use the sidebar to move between every area.
          </p>
        </div>
      </div>
    </div>
  );
}
