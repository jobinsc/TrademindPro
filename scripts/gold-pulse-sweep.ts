/**
 * Sweep GoldPulse params to find positive net combinations.
 * Usage: npx tsx scripts/gold-pulse-sweep.ts
 */
import {
  fetchGoldPulseCandles,
  runGoldPulseBacktest,
  type GoldBacktestParams,
  type GoldBacktestResult,
} from '../src/lib/gold-pulse/backtest';

function score(r: GoldBacktestResult): number {
  // Prefer net PnL, then lower DD, then more wins; require enough trades
  if (r.tradeCount < 8) return -1e9;
  return r.netPnl * 10 - r.maxDrawdown + r.winRate;
}

async function main() {
  const data = await fetchGoldPulseCandles();
  if (!data.ok) {
    console.error(data);
    process.exit(1);
  }

  const trails = [10, 12, 15, 18, 22];
  const keeps = [0.4, 0.5, 0.6];
  const cooldownsMin = [30, 45, 60, 90, 120];
  const slPcts = [0.003, 0.004, 0.005, 0.006];
  const minRanges = [0, 4, 6, 8];
  const sideModes: Array<GoldBacktestParams['sideMode']> = ['BOTH', 'LONG', 'SHORT'];
  const htfStable = [false, true];
  const disableFlip = [true]; // always prefer no naked 15m flip in this sweep
  const useTrail = [true, false];

  const results: GoldBacktestResult[] = [];
  let n = 0;

  for (const trailMfeTrigger of trails) {
    for (const trailKeepFrac of keeps) {
      for (const cd of cooldownsMin) {
        for (const defaultSlPct of slPcts) {
          for (const minEntryRangeUsd of minRanges) {
            for (const sideMode of sideModes) {
              for (const requireHtfStable of htfStable) {
                for (const disableEntryFlipExit of disableFlip) {
                  for (const trailOn of useTrail) {
                    // Skip keepFrac when trail off
                    if (!trailOn && trailKeepFrac !== 0.5) continue;
                    // Reduce combo explosion: skip some weak mixes
                    if (sideMode !== 'BOTH' && minEntryRangeUsd === 0 && !requireHtfStable) {
                      // still allow
                    }
                    const params: Partial<GoldBacktestParams> = {
                      trailMfeTrigger,
                      trailKeepFrac,
                      reentryCooldownMs: cd * 60_000,
                      defaultSlPct,
                      minSlUsd: Math.max(3, Math.round(defaultSlPct * 4000)),
                      minEntryRangeUsd,
                      entryRangeLookback: 3,
                      sideMode,
                      requireHtfStable,
                      disableEntryFlipExit,
                      entryFlipNeedsHtfAgainst: true,
                      useTrail: trailOn,
                      roundTripCostUsd: 5,
                    };
                    const r = runGoldPulseBacktest({
                      candlesEntry: data.candlesEntry,
                      candlesHtf: data.candlesHtf,
                      params,
                    });
                    results.push(r);
                    n += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const positive = results
    .filter((r) => r.netPnl > 0 && r.tradeCount >= 8)
    .sort((a, b) => score(b) - score(a));

  const top = (positive.length ? positive : [...results].sort((a, b) => b.netPnl - a.netPnl)).slice(
    0,
    15
  );

  console.log(
    JSON.stringify(
      {
        combosTried: n,
        positiveCount: positive.length,
        best: top.map((r) => ({
          netPnl: r.netPnl,
          grossPnl: r.grossPnl,
          trades: r.tradeCount,
          winRate: r.winRate,
          maxDD: r.maxDrawdown,
          avgWin: r.avgWin,
          avgLoss: r.avgLoss,
          exitMix: r.exitMix,
          params: {
            trail: r.params.useTrail
              ? `${r.params.trailMfeTrigger}/${r.params.trailKeepFrac}`
              : 'off',
            cooldownMin: r.params.reentryCooldownMs / 60000,
            slPct: r.params.defaultSlPct,
            minRange: r.params.minEntryRangeUsd,
            side: r.params.sideMode,
            htfStable: r.params.requireHtfStable,
            noEntryFlipExit: r.params.disableEntryFlipExit,
          },
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
