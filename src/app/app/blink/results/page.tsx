'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import BlinkResultsWorkspace from '@/components/blink/BlinkResultsWorkspace';

export default function BlinkResultsPage() {
  return (
    <RequireAdmin>
      <BlinkResultsWorkspace />
    </RequireAdmin>
  );
}
