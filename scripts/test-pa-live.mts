import { writeFileSync } from 'fs';

async function main() {
  const res = await fetch('http://localhost:3000/api/market/nifty');
  const data = (await res.json()) as {
    ok?: boolean;
    spot?: number;
    candles?: { t: string; open: number; high: number; low: number; close: number }[];
    error?: string;
  };
  if (!data.ok || !data.candles) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  const { runPriceAction } = await import('../src/lib/price-action.ts');
  const { analyzeNifty } = await import('../src/lib/nejoic.ts');
  const pa = runPriceAction(data.candles);
  const sig = analyzeNifty(data.candles);
  const out = {
    spot: data.spot,
    candles: data.candles.length,
    structure: pa.structureText,
    bias: sig.bias,
    setup: sig.setup,
    confidence: sig.confidence,
    labels: pa.labels.map((l) => l.label).slice(-8),
  };
  console.log(JSON.stringify(out, null, 2));
  writeFileSync('scripts/.pa-live-last.json', JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
