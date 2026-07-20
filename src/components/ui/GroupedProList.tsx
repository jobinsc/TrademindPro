'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** Compact scroll — backtesting-style panel height */
export const GROUPED_LIST_SCROLL =
  'max-h-64 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin] [scrollbar-color:#2563eb_#e8eef3]';

export const GROUPED_LIST_COMPACT_SCROLL =
  'max-h-52 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin] [scrollbar-color:#2563eb_#e8eef3]';

export function GroupedProListFrame({
  children,
  scrollClassName = GROUPED_LIST_SCROLL,
  toolbar,
}: {
  children: ReactNode;
  scrollClassName?: string;
  toolbar?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#b8c4ce] bg-white shadow-sm">
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eef3] bg-[#f8fafc] px-3 py-2">
          {toolbar}
        </div>
      ) : null}
      <div className={scrollClassName}>{children}</div>
    </div>
  );
}

export function GroupedAccordionSection({
  title,
  hint,
  count,
  selectedCount = 0,
  expanded,
  onToggleExpand,
  onAllOn,
  onAllOff,
  allOnActive = false,
  allOffActive = false,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  selectedCount?: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onAllOn?: () => void;
  onAllOff?: () => void;
  allOnActive?: boolean;
  allOffActive?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[#e8eef3] last:border-b-0">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-start gap-1.5 rounded-lg px-1 py-1 text-left hover:bg-sky-soft/60"
        >
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-sky-ink/45 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-sky-ink">{title}</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-sky-ink/50 ring-1 ring-[#e2e8f0]">
                {selectedCount}/{count} ON
              </span>
            </span>
            {hint && !expanded ? (
              <span className="mt-0.5 block truncate text-[11px] text-sky-ink/40">{hint}</span>
            ) : null}
          </span>
        </button>
        {onAllOn && onAllOff ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onAllOn}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${
                allOnActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              All ON
            </button>
            <button
              type="button"
              onClick={onAllOff}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${
                allOffActive
                  ? 'bg-slate-500 text-white hover:bg-slate-600'
                  : 'border border-[#cfe0ee] bg-white text-sky-ink/60 hover:bg-sky-soft'
              }`}
            >
              All OFF
            </button>
          </div>
        ) : null}
      </div>
      {expanded ? <ul className="pb-1.5">{children}</ul> : null}
    </section>
  );
}

/** Strategy row with explicit ON / OFF buttons */
export function GroupedOnOffRow({
  name,
  active,
  onTurnOn,
  onTurnOff,
}: {
  name: string;
  active: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-1 pl-9">
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          active ? 'font-medium text-sky-ink' : 'text-sky-ink/70'
        }`}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={onTurnOn}
        disabled={active}
        className={`min-w-[42px] rounded-md px-2 py-1 text-[10px] font-bold transition ${
          active
            ? 'bg-emerald-600 text-white'
            : 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
        } disabled:cursor-default`}
      >
        ON
      </button>
      <button
        type="button"
        onClick={onTurnOff}
        disabled={!active}
        className={`min-w-[42px] rounded-md px-2 py-1 text-[10px] font-bold transition ${
          !active
            ? 'bg-slate-500 text-white'
            : 'border border-[#cfe0ee] bg-white text-sky-ink/55 hover:bg-sky-soft'
        } disabled:cursor-default`}
      >
        OFF
      </button>
    </li>
  );
}

/** Backtesting / template pick — click row to select */
export function GroupedSelectRow({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`mx-2 flex w-[calc(100%-1rem)] items-center rounded-md py-1.5 pl-7 pr-3 text-left text-sm transition ${
          selected
            ? 'bg-[#2563eb] font-medium text-white'
            : 'text-sky-ink hover:bg-[#2563eb] hover:text-white'
        }`}
      >
        {name}
      </button>
    </li>
  );
}
