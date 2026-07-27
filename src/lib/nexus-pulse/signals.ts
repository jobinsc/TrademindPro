import type { Candle } from '@/lib/nejoic';
import { utSnapshot, runUtBot } from '@/lib/nexus-pulse/ut-bot';
import {
  NEXUS_UT_3M,
  NEXUS_UT_5M,
} from '@/lib/nexus-pulse/rules';
import type { NexusSignalDecision, NexusUtSnapshot } from '@/lib/nexus-pulse/types';

/**
 * V2 entry: new 3m UT buy/sell on bar edge + 5m pos agrees.
 * buy3 & pos5==1 → CE; sell3 & pos5==-1 → PE.
 */
export function evaluateUtV2Entry(opts: {
  candles3m: Candle[];
  candles5m: Candle[];
  now?: Date;
}): {
  decision: NexusSignalDecision;
  ut3m: NexusUtSnapshot;
  ut5m: NexusUtSnapshot;
} {
  const ut3m = utSnapshot(opts.candles3m, NEXUS_UT_3M, '3m');
  const ut5m = utSnapshot(opts.candles5m, NEXUS_UT_5M, '5m');

  const bars3 = runUtBot(opts.candles3m, NEXUS_UT_3M);
  const last3 = bars3.length ? bars3[bars3.length - 1] : null;
  const prev3 = bars3.length > 1 ? bars3[bars3.length - 2] : null;

  const buy3m = Boolean(last3?.buy);
  const sell3m = Boolean(last3?.sell);
  const pos5m = (ut5m.last?.pos ?? 0) as -1 | 0 | 1;

  const new3mEdge =
    last3 != null &&
    prev3 != null &&
    last3.t !== prev3.t &&
    ((last3.buy && !prev3.buy) || (last3.sell && !prev3.sell));

  const at = opts.now?.toISOString() ?? new Date().toISOString();
  let side: 'CE' | 'PE' | 'FLAT' = 'FLAT';
  let reason = 'No aligned UT entry';

  if (new3mEdge && buy3m && pos5m === 1) {
    side = 'CE';
    reason = '3m UT Buy + 5m pos long → long CE';
  } else if (new3mEdge && sell3m && pos5m === -1) {
    side = 'PE';
    reason = '3m UT Sell + 5m pos short → long PE';
  } else if (buy3m && pos5m !== 1) {
    reason = '3m buy but 5m not aligned long';
  } else if (sell3m && pos5m !== -1) {
    reason = '3m sell but 5m not aligned short';
  }

  return {
    decision: {
      at,
      side,
      reason,
      buy3m,
      sell3m,
      pos5m,
      new3mEdge,
    },
    ut3m,
    ut5m,
  };
}
