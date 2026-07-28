import { fetchAndRunGoldPulseBacktest } from '../src/lib/gold-pulse/backtest';

async function main() {
  const r = await fetchAndRunGoldPulseBacktest();
  const nets = r.trades.map((t) => t.netPnl);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n <= 0);
  const inBand = nets.filter((n) => n >= 5 && n <= 6);
  const nearBand = nets.filter((n) => n >= 4 && n <= 8);
  const smallWin = wins.filter((n) => n < 10);
  const med = wins.filter((n) => n >= 10 && n < 25);
  const big = wins.filter((n) => n >= 25);
  const avg = nets.reduce((a, b) => a + b, 0) / nets.length;
  const avgW = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgL = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

  console.log(
    JSON.stringify(
      {
        trades: nets.length,
        avgNet: +avg.toFixed(2),
        avgWin: +avgW.toFixed(2),
        avgLoss: +avgL.toFixed(2),
        winsExactly5to6: inBand.length,
        winsNear4to8: nearBand.length,
        winsUnder10: smallWin.length,
        wins10to25: med.length,
        wins25plus: big.length,
        sampleWins: wins.slice(0, 20).map((n) => +n.toFixed(1)),
        note: 'net already after 5 USD cost',
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
