'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, Circle } from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import { useAuth } from '@/components/auth/AuthProvider';
import { useBroker } from '@/hooks/useBroker';

export default function SettingsWorkspace() {
  const { user } = useAuth();
  const { ready, connection } = useBroker();
  const [cloudAi, setCloudAi] = useState(false);

  useEffect(() => {
    fetch('/api/ai/chat')
      .then((r) => r.json())
      .then((d: { cloudAi?: boolean }) => setCloudAi(Boolean(d.cloudAi)))
      .catch(() => setCloudAi(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-7 md:px-8 md:py-9">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">Settings</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
          Settings &amp; Brokers
        </h1>
        <InfoBubble title="About Settings">
          Profile and broker connection for your TradeMind Pro account.
        </InfoBubble>
      </div>

      <section className="mt-8 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">Profile</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-sky-ink/50">Name</dt>
            <dd className="font-medium text-sky-ink">{user?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sky-ink/50">Email</dt>
            <dd className="font-medium text-sky-ink">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sky-ink/50">Role</dt>
            <dd className="font-medium capitalize text-sky-ink">{user?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-deep" strokeWidth={1.75} />
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">AI Agents</h2>
        </div>
        <p className="mt-3 text-sm text-sky-ink/60">
          Agents run live on your journal and risk data. Optional cloud AI uses OpenAI when a key is
          set in the project file <code className="rounded bg-sky-soft px-1">.env.local</code>.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-sky-ink/70">
          <li>
            Status:{' '}
            <strong className={cloudAi ? 'text-emerald-600' : 'text-sky-ink'}>
              {cloudAi ? 'Cloud AI connected' : 'Local live engine'}
            </strong>
          </li>
          <li>
            Add:{' '}
            <code className="rounded bg-sky-soft px-1 text-[12px]">
              OPENAI_API_KEY=sk-...
            </code>
          </li>
          <li>
            Optional:{' '}
            <code className="rounded bg-sky-soft px-1 text-[12px]">OPENAI_MODEL=gpt-4o-mini</code>
          </li>
          <li>Restart <code className="rounded bg-sky-soft px-1">npm run dev</code> after saving.</li>
        </ul>
        <Link
          href="/app/ai"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
        >
          Open AI Agents Hub
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="mt-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-sky-ink">Broker</h2>
        {!ready ? (
          <p className="mt-3 text-sm text-sky-ink/50">Loading…</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Circle
                className={`h-2.5 w-2.5 fill-current ${
                  connection.connected ? 'text-emerald-500' : 'text-rose-400'
                }`}
              />
              <span className="font-medium text-sky-ink">
                {connection.label}
                {connection.connected ? ' · Connected' : ' · Not connected'}
              </span>
            </div>
            <Link
              href="/app/terminal"
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-deep px-4 py-2 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Manage connection
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
