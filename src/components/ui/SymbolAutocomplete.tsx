'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIQUID_SCAN_UNIVERSE } from '@/lib/liquid-universe';
import { searchIndiaIndices } from '@/lib/india-indices';

export type SymbolSuggestion = {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
};

type Props = {
  value: string;
  onChange: (symbol: string) => void;
  onPick?: (item: SymbolSuggestion) => void;
  exchange?: 'NSE' | 'BSE' | 'ALL';
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
};

function liquidSuggestions(q: string): SymbolSuggestion[] {
  const upper = q.trim().toUpperCase();
  const indices = searchIndiaIndices(upper, 12);
  if (!upper) {
    // Empty field: show core indices first, then liquid equities
    const rest = LIQUID_SCAN_UNIVERSE.filter(
      (s) => !indices.some((i) => i.symbol === s)
    )
      .slice(0, 8)
      .map((symbol) => ({
        symbol,
        name: symbol,
        exchange: 'NSE' as const,
      }));
    return [...indices.slice(0, 10), ...rest].slice(0, 16);
  }

  const equities = LIQUID_SCAN_UNIVERSE.filter(
    (s) => s.includes(upper) && !indices.some((i) => i.symbol === s)
  )
    .slice(0, 10)
    .map((symbol) => ({
      symbol,
      name: symbol,
      exchange: 'NSE' as const,
    }));

  return [...indices, ...equities].slice(0, 16);
}

type MenuPos = { top: number; left: number; width: number };

export default function SymbolAutocomplete({
  value,
  onChange,
  onPick,
  exchange = 'ALL',
  placeholder = 'Type to search scrips…',
  className = '',
  required,
  disabled,
  readOnly,
  id,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SymbolSuggestion[]>(() => liquidSuggestions(''));
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function updatePos() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const menuH = Math.min(224, Math.max(120, items.length * 44 + 8));
    const openUp = spaceBelow < menuH && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    function onScroll() {
      updatePos();
    }
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  useEffect(() => {
    if (readOnly || disabled) return;

    const q = value.trim();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const local = liquidSuggestions(q);
      if (!cancelled) {
        setItems(local);
        if (open && q.length >= 1) setOpen(true);
      }

      if (q.length < 1) {
        // Keep indices visible even with empty query (don't wait on equity API)
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          limit: '15',
          exchange: exchange === 'ALL' ? 'ALL' : exchange,
        });
        const res = await fetch(`/api/market/instruments?${params}`);
        const data = (await res.json()) as {
          ok?: boolean;
          items?: { symbol: string; name: string; exchange: 'NSE' | 'BSE' }[];
        };
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items) && data.items.length) {
          setItems(
            data.items.map((i) => ({
              symbol: i.symbol,
              name: i.name || i.symbol,
              exchange: i.exchange,
            }))
          );
        } else if (local.length) {
          setItems(local);
        } else {
          setItems([]);
        }
      } catch {
        if (!cancelled) setItems(local);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, exchange, readOnly, disabled, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (inputRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(item: SymbolSuggestion) {
    onChange(item.symbol);
    onPick?.(item);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) {
      if (e.key === 'ArrowDown') {
        setOpen(true);
        setItems(liquidSuggestions(value));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showMenu = mounted && open && !readOnly && !disabled && pos;

  const menu =
    showMenu &&
    createPortal(
      <ul
        ref={menuRef}
        id={listId}
        role="listbox"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: pos.width,
          transform: pos.top < (inputRef.current?.getBoundingClientRect().top ?? 0) ? 'translateY(-100%)' : undefined,
          zIndex: 9999,
        }}
        className="max-h-56 overflow-auto rounded-xl border border-[#cfe0ee] bg-white py-1 shadow-xl"
      >
        {loading && (
          <li className="px-3 py-2 text-xs text-sky-ink/45">Searching NSE/BSE scrips…</li>
        )}
        {!loading && items.length === 0 && (
          <li className="px-3 py-2 text-xs text-sky-ink/45">
            No match — try more letters (e.g. BHARTI, RELI)
          </li>
        )}
        {items.map((item, i) => (
          <li key={`${item.exchange}:${item.symbol}`}>
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                i === active ? 'bg-sky-soft/80' : 'hover:bg-sky-soft/50'
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                // mousedown before blur so pick always registers
                e.preventDefault();
                pick(item);
              }}
            >
              <span className="min-w-0">
                <span className="font-semibold text-sky-ink">{item.symbol}</span>
                {item.name && item.name !== item.symbol && (
                  <span className="mt-0.5 block truncate text-[11px] text-sky-ink/50">
                    {item.name}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase text-sky-mid">
                {item.exchange}
              </span>
            </button>
          </li>
        ))}
      </ul>,
      document.body
    );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (!readOnly && !disabled) {
            setItems(liquidSuggestions(value));
            setOpen(true);
            requestAnimationFrame(updatePos);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {menu}
    </div>
  );
}
