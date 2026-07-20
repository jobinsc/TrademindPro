'use client';

import { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { useNejoic } from '@/hooks/useNejoic';
import { useJimbo } from '@/hooks/useJimbo';
import { useRiskSettings } from '@/hooks/useRiskSettings';
import { useStrategies } from '@/hooks/useStrategies';

/**
 * Global emergency stop — turns off auto trading on every agent/module.
 */
export default function FullStopBar({
  showExitTrades = true,
}: {
  showExitTrades?: boolean;
}) {
  const { fullStop: nejoicFullStop } = useNejoic();
  const { setAutoTrade: setJimboAuto, closeOpen: closeJimbo } = useJimbo();
  const { update: updateRisk } = useRiskSettings();
  const { strategies, update: updateStrategy } = useStrategies();
  const [done, setDone] = useState<string | null>(null);

  function fullStop(alsoExitTrades: boolean) {
    nejoicFullStop(alsoExitTrades);
    setJimboAuto(false);
    if (alsoExitTrades) closeJimbo();

    updateRisk({ emergencyStop: true });

    for (const s of strategies) {
      if (s.status === 'ready' || s.status === 'live') {
        updateStrategy(s.id, { ...s, status: 'paused' });
      }
    }
    setDone(alsoExitTrades ? 'Stopped + trades closed' : 'Everything stopped');
    setTimeout(() => setDone(null), 2500);
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fullStop(false)}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700"
        >
          <OctagonX className="h-4 w-4" strokeWidth={2} />
          FULL STOP
        </button>
        {showExitTrades && (
          <button
            type="button"
            onClick={() => fullStop(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100"
          >
            FULL STOP + Exit trades
          </button>
        )}
        {done ? (
          <p className="text-[12px] font-semibold text-rose-700">{done}</p>
        ) : (
          <p className="text-[12px] text-rose-800/80">
            Stops all auto trading. “Exit trades” also closes open paper trades.
          </p>
        )}
      </div>
    </div>
  );
}
