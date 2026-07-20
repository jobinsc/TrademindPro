'use client';

import { useNejoic } from '@/hooks/useNejoic';

/**
 * One app-wide Nejoic engine — Telegram pulse, auto paper loop, live Nifty feed.
 * Mount once in AppShell so messages send without keeping Nejoic tab open.
 */
export default function NejoicRuntimeHost() {
  useNejoic({ runtime: true });
  return null;
}
