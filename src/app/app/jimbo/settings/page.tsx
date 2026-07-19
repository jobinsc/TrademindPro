'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import JimboSettingsWorkspace from '@/components/jimbo/JimboSettingsWorkspace';

export default function JimboSettingsPage() {
  return (
    <RequireAdmin>
      <JimboSettingsWorkspace />
    </RequireAdmin>
  );
}
