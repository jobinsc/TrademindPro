import { SCAN_TEMPLATES, type ScanResult } from '@/lib/scanner';
import { getEquityInstruments, type EquityInstrument } from '@/lib/instruments';
import { fetchUpstoxQuotes, type UpstoxQuote } from '@/lib/upstox-market';
import { defaultSettingsFor, type ScanSettings } from '@/lib/scan-settings';

function gapPct(q: UpstoxQuote): number {
  if (q.open <= 0 || q.close <= 0) return 0;
  return ((q.open - q.close) / q.close) * 100;
}

function rangePct(q: UpstoxQuote): number {
  if (q.lastPrice <= 0) return 0;
  return ((q.high - q.low) / q.lastPrice) * 100;
}

function bodyPct(q: UpstoxQuote): number {
  if (q.open <= 0) return 0;
  return ((q.lastPrice - q.open) / q.open) * 100;
}

function strengthFromSettings(
  changePct: number,
  settings: ScanSettings
): ScanResult['strength'] {
  const a = Math.abs(changePct);
  if (a >= settings.strongAbsChangePct) return 'Strong';
  if (a >= settings.moderateAbsChangePct) return 'Moderate';
  return 'Weak';
}

function passesFilters(q: UpstoxQuote, settings: ScanSettings, templateId: string): boolean {
  if (q.volume < settings.minVolume) return false;

  const range = rangePct(q);
  if (settings.minRangePct > 0 && range < settings.minRangePct) return false;

  const reversalLike =
    templateId === 'rsi-reversal' ||
    templateId === 'stochastic' ||
    templateId === 'williams-r' ||
    templateId === 'cci-oversold' ||
    templateId === 'cci-overbought' ||
    templateId === 'swing-cci-reversal' ||
    templateId === 'pos-cci-cycle' ||
    templateId === 'pos-mean-reversion';

  if (reversalLike) {
    if (templateId === 'cci-overbought') {
      if (q.changePct < settings.overboughtChangePct && q.changePct < 1) return false;
    } else if (
      templateId === 'cci-oversold' ||
      templateId === 'swing-cci-reversal' ||
      templateId === 'pos-cci-cycle' ||
      templateId === 'pos-mean-reversion'
    ) {
      if (q.changePct > settings.oversoldChangePct && q.changePct > -0.5) {
        // still allow mild recovery days for bounce ideas
        if (q.changePct < settings.minChangePct || q.changePct > settings.maxChangePct) return false;
      }
    } else {
      const ok =
        q.changePct <= settings.oversoldChangePct ||
        q.changePct >= settings.overboughtChangePct;
      if (!ok) return false;
    }
  } else if (templateId === 'top-losers') {
    if (q.changePct > settings.maxChangePct || q.changePct < settings.minChangePct) return false;
  } else if (
    templateId === 'nr7' ||
    templateId === 'bollinger-squeeze' ||
    templateId === 'swing-flag' ||
    templateId === 'pos-accumulation' ||
    templateId === 'pos-low-volatility'
  ) {
    if (settings.maxRangePct > 0 && range > settings.maxRangePct) return false;
    if (q.changePct < settings.minChangePct || q.changePct > settings.maxChangePct) return false;
  } else if (templateId === 'pullback-trend') {
    if (q.changePct < settings.minChangePct || q.changePct > settings.maxChangePct) return false;
  } else if (q.changePct < settings.minChangePct || q.changePct > settings.maxChangePct) {
    return false;
  }

  if (settings.minGapPct > 0 && Math.abs(gapPct(q)) < settings.minGapPct) return false;
  return true;
}

function scoreQuote(templateId: string, q: UpstoxQuote, settings: ScanSettings): number {
  const abs = Math.abs(q.changePct);
  const vol = Math.log10(Math.max(q.volume, 1));
  const gap = Math.abs(gapPct(q));
  const range = rangePct(q);
  const body = Math.abs(bodyPct(q));
  const cciBias = settings.cciPeriod * 0.02;

  switch (templateId) {
    case 'momentum-breakout':
      return q.changePct * 2 + vol;
    case 'rsi-reversal':
    case 'williams-r':
      if (q.changePct <= settings.oversoldChangePct) return abs * 3 + vol + settings.rsiPeriod * 0.01;
      if (q.changePct >= settings.overboughtChangePct) return abs * 2 + vol * 0.5;
      return abs;
    case 'ema-crossover':
    case 'sma-crossover':
    case 'swing-ema-ribbon':
    case 'pos-golden-cross':
    case 'pos-200sma-trend':
      return q.changePct > 0
        ? q.changePct + vol * 0.5 + settings.emaFast / 100
        : q.changePct;
    case 'macd-cross':
    case 'swing-macd-turn':
      return q.changePct * 1.8 + vol + settings.macdSignal * 0.01;
    case 'stochastic':
      if (q.changePct <= settings.oversoldChangePct) return abs * 2.5 + vol;
      if (q.changePct >= settings.overboughtChangePct) return abs * 2 + vol * 0.4;
      return abs;
    case 'bollinger-break':
      return abs * 2.2 + range + vol;
    case 'bollinger-squeeze':
    case 'swing-flag':
      return (settings.maxRangePct - range) * 5 + vol * 0.3;
    case 'supertrend':
      return q.changePct * settings.atrMult + vol;
    case 'vwap-reclaim':
      return q.changePct > 0 ? q.changePct * 2 + vol : abs * 0.5;
    case 'atr-expansion':
      return range * 3 + abs + vol;
    case 'adx-trend':
      return abs * 2 + (abs >= settings.adxMin / 10 ? 5 : 0) + vol;
    case 'cci-zero':
    case 'cci-trend':
      return q.changePct * 2 + cciBias + vol * 0.4;
    case 'cci-oversold':
    case 'swing-cci-reversal':
    case 'pos-cci-cycle':
      return -q.changePct * 2.5 + vol + Math.abs(settings.cciOversold) * 0.01;
    case 'cci-overbought':
      return q.changePct * 2 + vol * 0.3 + settings.cciOverbought * 0.01;
    case 'mfi-flow':
      return vol * 3 + (q.changePct > 0 ? q.changePct : abs * 0.5);
    case 'roc-momentum':
    case 'awesome-osc':
      return q.changePct * 2.2 + vol;
    case 'pivot-bounce':
      return q.changePct > -2 && q.changePct < 2 ? 5 - abs + vol : abs * 0.3;
    case 'parabolic-sar':
      return q.changePct * 2.2 + vol;
    case 'ichimoku-break':
      return abs * 2 + (q.changePct > 0 ? 2 : 0) + vol;
    case 'gap-up-down':
      return gap * 3 + abs;
    case 'orb':
      return abs * 2.5 + gap + vol;
    case 'day-trade':
      return abs * 2.5 + vol + gap;
    case 'nr7':
      return (settings.maxRangePct - range) * 8 + vol * 0.2;
    case '52w-near':
      return abs * 2 + (q.changePct > 0 ? 1 : 0);
    case 'top-gainers':
    case 'swing-relative-strength':
      return q.changePct * 5 + vol;
    case 'top-losers':
      return -q.changePct * 5 + vol;
    case 'high-volume':
      return vol * 5 + abs;
    case 'rvol-spike':
      return vol * 4 + abs * settings.relativeVolumeMin;
    case 'swing-setups':
      return abs * 1.5 + (q.changePct > 0 ? vol : vol * 0.5);
    case 'pullback-trend':
      return -q.changePct * 2 + vol * 0.5;
    case 'swing-breakout-retest':
      return q.changePct * 2 + vol + gap;
    case 'swing-rsi-trend':
      return q.changePct * 1.5 + vol + settings.rsiPeriod * 0.02;
    case 'pos-stage2':
    case 'pos-breakout-weekly':
      return q.changePct * 2.5 + vol * 1.2;
    case 'pos-accumulation':
      return (2.5 - range) * 2 + vol * 0.8 + (q.changePct >= 0 ? 2 : 0);
    case 'pos-mean-reversion':
      return -q.changePct * 2 + vol * 0.4;
    case 'pos-low-volatility':
      return (settings.maxRangePct - range) * 4 + (q.changePct > 0 ? q.changePct * 2 : 0) + vol * 0.3;
    case 'engulfing-proxy':
      return body * 3 + range + vol;
    case 'undervalued':
      return q.changePct < 0 ? 5 - abs + vol * 0.3 : abs * 0.2;
    default:
      return abs + vol;
  }
}

function matchMeta(
  q: UpstoxQuote,
  byKey: Map<string, EquityInstrument>,
  bySymbol: Map<string, EquityInstrument>
): EquityInstrument | undefined {
  const direct = byKey.get(q.instrumentKey);
  if (direct) return direct;

  const colon = q.instrumentKey.includes(':')
    ? q.instrumentKey.split(':').pop()?.toUpperCase()
    : null;
  if (colon && bySymbol.has(colon)) return bySymbol.get(colon);

  if (q.symbol && bySymbol.has(q.symbol)) return bySymbol.get(q.symbol);

  if (q.instrumentKey.includes('|')) {
    const isin = q.instrumentKey.split('|')[1];
    for (const row of byKey.values()) {
      if (row.isin && row.isin === isin) return row;
    }
  }
  return undefined;
}

export async function runLiveScan(opts: {
  accessToken: string;
  templateId: string;
  exchange: 'NSE' | 'BSE';
  settings?: Partial<ScanSettings>;
}): Promise<{
  ok: true;
  source: 'upstox';
  exchange: 'NSE' | 'BSE';
  scanned: number;
  matched: number;
  universe: number;
  results: ScanResult[];
  templateName: string;
}> {
  const template = SCAN_TEMPLATES.find((t) => t.id === opts.templateId);
  if (!template) throw new Error('Unknown scan template');

  const settings: ScanSettings = {
    ...defaultSettingsFor(opts.templateId),
    ...(opts.settings || {}),
  };

  const all = await getEquityInstruments();
  const instruments = all.filter((i) => i.exchange === opts.exchange);
  if (!instruments.length) {
    throw new Error(`No ${opts.exchange} instruments loaded yet`);
  }

  const keys = instruments.map((i) => i.instrumentKey);
  const quotes = await fetchUpstoxQuotes(opts.accessToken, keys);
  const byKey = new Map(instruments.map((i) => [i.instrumentKey, i]));
  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));

  const scored: {
    quote: UpstoxQuote;
    meta: EquityInstrument;
    score: number;
  }[] = [];

  for (const q of quotes) {
    const meta = matchMeta(q, byKey, bySymbol);
    if (!meta) continue;
    if (!passesFilters(q, settings, opts.templateId)) continue;
    scored.push({
      quote: q,
      meta,
      score: scoreQuote(opts.templateId, q, settings),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const limit = Math.min(Math.max(settings.resultLimit || 40, 5), 200);
  const results: ScanResult[] = scored.slice(0, limit).map((row) => ({
    symbol: row.meta.symbol,
    exchange: row.meta.exchange,
    name: row.meta.name,
    price: row.quote.lastPrice,
    changePct: Math.round(row.quote.changePct * 100) / 100,
    signal: template.name,
    strength: strengthFromSettings(row.quote.changePct, settings),
  }));

  return {
    ok: true,
    source: 'upstox',
    exchange: opts.exchange,
    scanned: quotes.length,
    matched: scored.length,
    universe: instruments.length,
    results,
    templateName: template.name,
  };
}
