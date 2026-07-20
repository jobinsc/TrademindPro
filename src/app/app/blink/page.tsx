'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import BlinkWorkspace from '@/components/blink/BlinkWorkspace';

export default function BlinkPage() {
  return (
    <RequireAdmin>
      <BlinkWorkspace />
    </RequireAdmin>
  );
}
