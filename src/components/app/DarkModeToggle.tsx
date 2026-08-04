'use client';

import { Moon, Sun } from 'lucide-react';
import { useSiteTheme } from '@/hooks/useSiteTheme';
import { cn } from '@/lib/utils';

/** Top-bar control — toggles full-site dark mode. */
export default function DarkModeToggle({ className }: { className?: string }) {
  const { isDark, ready, toggle } = useSiteTheme();

  if (!ready) {
    return (
      <span
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 ring-1 ring-[#cfe0ee]',
          className
        )}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 transition',
        isDark
          ? 'bg-slate-800 text-amber-200 ring-slate-600 hover:bg-slate-700'
          : 'bg-white/80 text-sky-ink ring-[#cfe0ee] hover:bg-white',
        className
      )}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={2} />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
