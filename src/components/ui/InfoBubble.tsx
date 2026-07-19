'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MessageCircle, X } from 'lucide-react';

type InfoBubbleProps = {
  title?: string;
  children: ReactNode;
  /** Extra class on the wrapper (e.g. mt-2) */
  className?: string;
  /** Icon size look — default next to page titles */
  size?: 'sm' | 'md';
};

/**
 * Small balloon / bubble icon. Click to read the explanation, then close with X.
 */
export default function InfoBubble({
  title = 'Info',
  children,
  className = '',
  size = 'md',
}: InfoBubbleProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const iconPad = size === 'sm' ? 'p-1' : 'p-1.5';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
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

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-[#cfe0ee] bg-white p-3.5 shadow-[0_12px_32px_rgba(22,56,79,0.14)]"
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
        </div>
      )}
    </div>
  );
}
