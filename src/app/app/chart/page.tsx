'use client';

import { Suspense } from 'react';
import ChartWorkspace from '@/components/chart/ChartWorkspace';

export default function ChartPage() {
  return (
    <Suspense
      fallback={
        <div className="px-5 py-16 text-center text-sm text-sky-ink/50">Loading chart…</div>
      }
    >
      <ChartWorkspace />
    </Suspense>
  );
}
