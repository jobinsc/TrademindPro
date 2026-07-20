'use client';

import { ChevronDown, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shared Settings toggle + collapsible panel for module tabs. */
export function ModuleSettingsButton({
  open,
  onToggle,
  label = 'Settings',
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
        open
          ? 'border-sky-deep bg-sky-mist text-sky-deep'
          : 'border-[#cfe0ee] bg-white text-sky-ink/70 hover:border-sky-mid/40 hover:text-sky-ink'
      }`}
    >
      <Settings2 className="h-4 w-4" strokeWidth={1.75} />
      {label}
      <ChevronDown
        className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
        strokeWidth={2}
      />
    </button>
  );
}

export function ModuleSettingsPanel({
  open,
  title,
  description,
  children,
  controls,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  /** Start / Stop / Force stop row — unique per module */
  controls?: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <section className="mt-6 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-[12px] text-sky-ink/55">{description}</p>
          ) : null}
        </div>
        {footer}
      </div>

      {controls ? (
        <div className="mt-4 rounded-xl border border-[#e8eef3] bg-sky-soft/30 px-3 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
            Run controls · this tab only
          </p>
          <div className="flex flex-wrap items-center gap-2">{controls}</div>
        </div>
      ) : null}

      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ModuleRunButton({
  variant,
  onClick,
  disabled,
  children,
}: {
  variant: 'start' | 'stop' | 'force';
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const styles = {
    start: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    stop: 'bg-amber-500 hover:bg-amber-600 text-white',
    force: 'bg-rose-600 hover:bg-rose-700 text-white',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
