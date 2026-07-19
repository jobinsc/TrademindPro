import { Suspense } from 'react';
import TerminalWorkspace from '@/components/terminal/TerminalWorkspace';

export default function TerminalPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
          Loading terminal…
        </div>
      }
    >
      <TerminalWorkspace />
    </Suspense>
  );
}
