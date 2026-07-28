/**
 * Compare Sector 7 G baseline vs max 1 trade/day.
 * Run: npx tsx scripts/run-gold-pulse-backtest-1perday.ts
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

  const base = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
  });
  const onePerDay = runGoldPulseBacktest({
    candlesEntry: data.candlesEntry,
    candlesHtf: data.candlesHtf,
    params: { maxTradesPerDay: 1 },
  });

  const slim = (r: typeof base, label: string) => ({
    label,
    maxTradesPerDay: r.params.maxTradesPerDay || 'unlimited',
    from: r.from,
    to: r.to,
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
    note: r.note,
  });

  console.log(
    JSON.stringify(
      {
        setup: '15m entry + 30m Sector 7 G (v6 rules)',
        compare: [slim(base, 'current v6 (no day cap)'), slim(onePerDay, 'v6 + max 1 trade/day')],
        lastTradesOnePerDay: onePerDay.trades.slice(-8),
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
