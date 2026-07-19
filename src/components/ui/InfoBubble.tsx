'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X } from 'lucide-react';

type InfoBubbleProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
};

/**
 * Info balloon — opens in a portal so it is not clipped by page overflow.
 */
export default function InfoBubble({
  title = 'Info',
  children,
  className = '',
  size = 'md',
}: InfoBubbleProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 24);
    let left = r.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }
    let top = r.bottom + 8;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const iconPad = size === 'sm' ? 'p-1' : 'p-1.5';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Hide info' : 'Show info'}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center rounded-full ${iconPad} text-sky-deep ring-1 ring-sky-mid/35 transition hover:bg-sky-soft hover:ring-sky-mid/55 ${
          open ? 'bg-sky-soft' : 'bg-white'
        }`}
      >
        <MessageCircle className={iconSize} strokeWidth={2} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={title}
            style={{ top: pos.top, left: pos.left, width: 'min(22rem, calc(100vw - 1.5rem))' }}
            className="fixed z-[100] rounded-2xl border border-[#cfe0ee] bg-white p-3.5 shadow-[0_12px_32px_rgba(22,56,79,0.18)]"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                {title}
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-md p-0.5 text-sky-ink/40 hover:bg-sky-soft hover:text-sky-ink"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="text-sm leading-relaxed text-sky-ink/75">{children}</div>
          </div>,
          document.body
        )}
    </div>
  );
}
