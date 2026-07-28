/**
 * Compare Sector 7 G: unlimited vs max 1/day vs max 3/day.
 * Run: npx tsx scripts/run-gold-pulse-backtest-daycap.ts
 */

async function main() {
  const { fetchGoldPulseCandles, runGoldPulseBacktest } = await import(
    '../src/lib/gold-pulse/backtest'
  );
  const data = await fetchGoldPulseCandles();
  if (!data.ok) {
    console.error(data);
    process.exit(1);
  }

  const slim = (r: Awaited<ReturnType<typeof runGoldPulseBacktest>>, label: string) => ({
    label,
    maxTradesPerDay: r.params.maxTradesPerDay || 'unlimited',
    tradeCount: r.tradeCount,
    wins: r.wins,
    losses: r.losses,
    winRate: r.winRate,
    grossPnl: r.grossPnl,
    netPnl: r.netPnl,
    avgWin: r.avgWin,
    avgLoss: r.avgLoss,
    maxDrawdown: r.maxDrawdown,
    tradingDays: r.tradingDays,
    daysWithTrade: r.daysWithTrade,
    dayCoveragePct: r.dayCoveragePct,
    exitMix: r.exitMix,
  });

  const base = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
  });
  const one = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params: { maxTradesPerDay: 1 },
  });
  const three = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params: { maxTradesPerDay: 3 },
  });

  console.log(
    JSON.stringify(
      {
        setup: '15m entry + 30m Sector 7 G (v6)',
        from: base.from,
        to: base.to,
        compare: [
          slim(base, 'unlimited'),
          slim(one, 'max 1/day'),
          slim(three, 'max 3/day'),
        ],
        lastTradesMax3: three.trades.slice(-8),
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
