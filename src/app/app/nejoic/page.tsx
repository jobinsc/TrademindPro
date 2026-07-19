'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import NejoicWorkspace from '@/components/nejoic/NejoicWorkspace';

export default function NejoicPage() {
  return (
    <RequireAdmin>
      <NejoicWorkspace />
    </RequireAdmin>
  );
}
