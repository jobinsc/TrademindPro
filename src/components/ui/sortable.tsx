'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export type SortState<K extends string = string> = {
  key: K | null;
  dir: SortDir;
};

export function compareSortValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }

  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  return as.localeCompare(bs, 'en-IN', { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(
  rows: T[],
  key: string | null,
  dir: SortDir,
  getValue: (row: T, key: string) => unknown
): T[] {
  if (!key) return rows;
  const sorted = [...rows].sort((ra, rb) => compareSortValues(getValue(ra, key), getValue(rb, key)));
  return dir === 'asc' ? sorted : sorted.reverse();
}

export function useSortable<T>(
  rows: T[],
  getValue: (row: T, key: string) => unknown,
  initial?: { key?: string; dir?: SortDir }
) {
  const [sort, setSort] = useState<SortState<string>>({
    key: initial?.key ?? null,
    dir: initial?.dir ?? 'desc',
  });
  const getValueRef = useRef(getValue);
  getValueRef.current = getValue;

  const sorted = useMemo(
    () =>
      sortRows(rows, sort.key, sort.dir, (row, key) => getValueRef.current(row, key)),
    [rows, sort.key, sort.dir]
  );

  function toggle(key: string) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return { key: null, dir: 'desc' };
    });
  }

  return { sorted, sort, toggle, setSort };
}

export function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = 'left',
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn(align === 'right' ? 'text-right' : 'text-left', className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] transition hover:text-sky-deep',
          align === 'right' && 'flex-row-reverse',
          active ? 'font-bold text-sky-deep' : 'font-semibold text-sky-ink/45'
        )}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
      </button>
    </th>
  );
}
