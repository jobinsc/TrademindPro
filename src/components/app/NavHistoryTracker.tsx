'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackAppPath } from '@/lib/nav-return';

/** Records /app navigation so nested pages can return to the starting feature. */
export default function NavHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    trackAppPath(pathname.split('?')[0]);
  }, [pathname]);

  return null;
}
