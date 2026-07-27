async function main() {
  const { fetchAndRunGoldPulseBacktest } = await import('../src/lib/gold-pulse/backtest');
  const r = await fetchAndRunGoldPulseBacktest();
  if (!r.ok) {
    console.error(r);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        symbol: r.symbol,
        entryTf: r.entryTf,
        htfTf: r.htfTf,
        bars5m: r.bars5m,
        bars15m: r.bars15m,
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
        exitMix: r.exitMix,
        note: r.note,
        lastTrades: r.trades.slice(-8),
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
