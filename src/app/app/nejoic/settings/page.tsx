'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import NejoicSettingsWorkspace from '@/components/nejoic/NejoicSettingsWorkspace';

export default function NejoicSettingsPage() {
  return (
    <RequireAdmin>
      <NejoicSettingsWorkspace />
    </RequireAdmin>
  );
}
