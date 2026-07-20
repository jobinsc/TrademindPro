'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import TelegramBotWorkspace from '@/components/telegram/TelegramBotWorkspace';

export default function TelegramBotPage() {
  return (
    <RequireAdmin>
      <TelegramBotWorkspace />
    </RequireAdmin>
  );
}
