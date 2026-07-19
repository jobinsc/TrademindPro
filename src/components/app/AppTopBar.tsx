'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calculator, PanelLeftClose, PanelLeft } from 'lucide-react';

export default function AppTopBar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const date = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <header className="sticky top-0 z-30 flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[#c5dcec] bg-[#e3f1f9]/95 px-3 backdrop-blur-sm md:px-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-sky-deep transition hover:bg-white/80"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
        <p className="font-mono text-[10px] font-medium tracking-wide text-sky-ink/55 md:text-[11px]">
          {date} · {time} IST
        </p>
      </div>
      <Link
        href="/app/calculator"
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sky-deep ring-1 ring-[#cfe0ee] transition hover:bg-white"
      >
        <Calculator className="h-3.5 w-3.5" strokeWidth={2} />
        Calculator
      </Link>
    </header>
  );
}
