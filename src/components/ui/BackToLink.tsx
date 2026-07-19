'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getReturnPath } from '@/lib/nav-return';

type Props = {
  /** Default parent when no history / ?from= */
  fallback: string;
  label: string;
  className?: string;
};

/**
 * Back link that returns to the page the user came from (sidebar / previous feature),
 * falling back to the feature's parent route.
 */
export default function BackToLink({ fallback, label, className }: Props) {
  const [href, setHref] = useState(fallback);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from');
    setHref(getReturnPath(fallback, from));
  }, [fallback]);

  return (
    <Link
      href={href}
      className={
        className ||
        'inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline'
      }
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
