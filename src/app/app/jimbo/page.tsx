'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import JimboWorkspace from '@/components/jimbo/JimboWorkspace';

export default function JimboPage() {
  return (
    <RequireAdmin>
      <JimboWorkspace />
    </RequireAdmin>
  );
}
