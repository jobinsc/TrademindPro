import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, fetchUpstoxQuotes } from '@/lib/upstox-market';
import {
  fetchNiftyOptionContracts,
  fetchNextListedNiftyOptionContracts,
  fetchUpstoxOptionGreeks,
  pickAtmContract,
} from '@/lib/upstox-options';
import {
  fetchUpstoxIntradayCandles,
  NIFTY_INDEX_INSTRUMENT_KEY,
} from '@/lib/upstox-historical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'init' | 'sample' | 'save';

type SampleKeys = {
  nifty: string;
  ce: string;
  pe: string;
};

function istDate(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function quoteFor(
  quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>,
  key: string,
  fallbackIndex = 0
) {
  return (
    quotes.find((q) => q.instrumentKey === key) ??
    quotes[fallbackIndex] ??
    null
  );
}

function quoteIdentity(
  quote: Awaited<ReturnType<typeof fetchUpstoxQuotes>>[number]
): string {
  return `${quote.instrumentKey} ${quote.symbol}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function niftyQuote(
  quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>
) {
  return (
    quotes.find((quote) => quoteIdentity(quote).includes('NIFTY50')) ??
    null
  );
}

function optionQuote(
  quotes: Awaited<ReturnType<typeof fetchUpstoxQuotes>>,
  option: 'CE' | 'PE',
  tradingSymbol?: string
) {
  const exact = tradingSymbol
    ? tradingSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
    : '';
  return (
    quotes.find((quote) => exact && quoteIdentity(quote).includes(exact)) ??
    quotes.find((quote) => quoteIdentity(quote).endsWith(option)) ??
    null
  );
}

function optionGreek(
  greeks: Awaited<ReturnType<typeof fetchUpstoxOptionGreeks>>,
  key: string,
  option: 'CE' | 'PE'
) {
  return (
    greeks.find((greek) => greek.instrumentKey === key) ??
    greeks.find((greek) => option === 'CE' ? greek.delta >= 0 : greek.delta < 0) ??
    null
  );
}

function validKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 5 &&
    value.length <= 160 &&
    /^(NSE_INDEX|NSE_FO)\|/.test(value)
  );
}

async function loadSavedSamples(date: string): Promise<unknown[]> {
  try {
    const file = path.join(
      process.cwd(),
      '.data',
      `blink-atm-movement-${date}.jsonl`
    );
    const text = await fs.readFile(file, 'utf8');
    const loaded: unknown[] = [];
    for (const line of text.trim().split(/\r?\n/)) {
      if (!line) continue;
      try {
        const row = JSON.parse(line) as { samples?: unknown[] };
        if (Array.isArray(row.samples)) loaded.push(...row.samples);
      } catch {
        // A partial final line must not prevent the rest of the session loading.
      }
    }
    return loaded.slice(-5000);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Connect Upstox first', code: 'NO_TOKEN' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: Action;
      keys?: Partial<SampleKeys>;
      strike?: number;
      runId?: string;
      date?: string;
      samples?: unknown[];
    };
    const action = body.action ?? 'sample';

    if (action === 'init') {
      const started = Date.now();
      const niftyQuotes = await fetchUpstoxQuotes(token, [
        NIFTY_INDEX_INSTRUMENT_KEY,
      ]);
      const nifty =
        niftyQuote(niftyQuotes) ??
        quoteFor(niftyQuotes, NIFTY_INDEX_INSTRUMENT_KEY);
      if (!nifty?.lastPrice) {
        return NextResponse.json(
          { ok: false, error: 'Nifty live quote unavailable' },
          { status: 502 }
        );
      }

      const date = istDate();
      // On current-week expiry day, observe next week's ATM pair. This avoids
      // measuring same-day theta collapse as if it were a repeatable scalp edge.
      let expiryMode: 'current_week' | 'next_week' = 'current_week';
      let contracts = await fetchNiftyOptionContracts(token, expiryMode);
      let ce = pickAtmContract(contracts, nifty.lastPrice, 'CE');
      let pe = pickAtmContract(contracts, nifty.lastPrice, 'PE');
      const rolledFromExpiryDay = ce?.expiry === date || pe?.expiry === date;
      if (rolledFromExpiryDay) {
        expiryMode = 'next_week';
        contracts = await fetchNiftyOptionContracts(token, expiryMode);
        ce = pickAtmContract(contracts, nifty.lastPrice, 'CE');
        pe = pickAtmContract(contracts, nifty.lastPrice, 'PE');
        if (!ce || !pe) {
          contracts = await fetchNextListedNiftyOptionContracts(token, date);
          ce = pickAtmContract(contracts, nifty.lastPrice, 'CE');
          pe = pickAtmContract(contracts, nifty.lastPrice, 'PE');
        }
      }
      if (!ce || !pe) {
        return NextResponse.json(
          { ok: false, error: `${expiryMode} ATM CE/PE contracts unavailable` },
          { status: 502 }
        );
      }

      const [optionQuotes, optionGreeks] = await Promise.all([
        fetchUpstoxQuotes(token, [ce.instrumentKey, pe.instrumentKey]),
        fetchUpstoxOptionGreeks(token, [
          ce.instrumentKey,
          pe.instrumentKey,
        ]).catch(() => []),
      ]);
      const ceQuote = optionQuote(optionQuotes, 'CE', ce.tradingSymbol);
      const peQuote = optionQuote(optionQuotes, 'PE', pe.tradingSymbol);
      const ceGreeks = optionGreek(optionGreeks, ce.instrumentKey, 'CE');
      const peGreeks = optionGreek(optionGreeks, pe.instrumentKey, 'PE');
      if (!ceQuote?.lastPrice || !peQuote?.lastPrice) {
        return NextResponse.json(
          { ok: false, error: 'ATM option quote unavailable' },
          { status: 502 }
        );
      }

      const runId = crypto.randomUUID();
      const history = await fetchUpstoxIntradayCandles({
        accessToken: token,
        instrumentKey: NIFTY_INDEX_INSTRUMENT_KEY,
        unit: 'minutes',
        interval: 1,
      });
      const savedSamples = await loadSavedSamples(date);

      return NextResponse.json({
        ok: true,
        observationOnly: true,
        serverAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        date,
        expiryMode,
        rolledFromExpiryDay,
        keys: {
          nifty: NIFTY_INDEX_INSTRUMENT_KEY,
          ce: ce.instrumentKey,
          pe: pe.instrumentKey,
        } satisfies SampleKeys,
        contracts: { ce, pe },
        sample: {
          at: new Date().toISOString(),
          nifty: nifty.lastPrice,
          ce: ceQuote.lastPrice,
          pe: peQuote.lastPrice,
          ceSpread: ceQuote.spread,
          peSpread: peQuote.spread,
          ceGreeks,
          peGreeks,
          runId,
          ceKey: ce.instrumentKey,
          peKey: pe.instrumentKey,
          strike: ce.strike,
        },
        candles: history.ok ? history.candles : [],
        savedSamples,
        candleWarning: history.ok ? null : history.error,
      });
    }

    if (action === 'sample') {
      const keys = body.keys;
      if (
        !keys ||
        !validKey(keys.nifty) ||
        !validKey(keys.ce) ||
        !validKey(keys.pe)
      ) {
        return NextResponse.json(
          { ok: false, error: 'Valid locked Nifty/CE/PE instrument keys required' },
          { status: 400 }
        );
      }

      const started = Date.now();
      const [quotes, optionGreeks] = await Promise.all([
        fetchUpstoxQuotes(token, [keys.nifty, keys.ce, keys.pe]),
        fetchUpstoxOptionGreeks(token, [keys.ce, keys.pe]).catch(() => []),
      ]);
      const nifty = niftyQuote(quotes);
      const ce = optionQuote(quotes, 'CE');
      const pe = optionQuote(quotes, 'PE');
      const ceGreeks = optionGreek(optionGreeks, keys.ce, 'CE');
      const peGreeks = optionGreek(optionGreeks, keys.pe, 'PE');
      if (!nifty || !ce || !pe) {
        return NextResponse.json(
          { ok: false, error: 'Incomplete synchronized quote snapshot' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        observationOnly: true,
        serverAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        sample: {
          at: new Date().toISOString(),
          nifty: nifty.lastPrice,
          ce: ce.lastPrice,
          pe: pe.lastPrice,
          ceSpread: ce.spread,
          peSpread: pe.spread,
          ceGreeks,
          peGreeks,
          runId:
            typeof body.runId === 'string' ? body.runId.slice(0, 80) : undefined,
          ceKey: keys.ce,
          peKey: keys.pe,
          strike: Number.isFinite(body.strike) ? body.strike : undefined,
        },
      });
    }

    if (action === 'save') {
      const date =
        typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
          ? body.date
          : istDate();
      const samples = Array.isArray(body.samples)
        ? body.samples.slice(0, 300)
        : [];
      if (!samples.length) {
        return NextResponse.json(
          { ok: false, error: 'No samples to save' },
          { status: 400 }
        );
      }

      const dir = path.join(process.cwd(), '.data');
      const file = path.join(dir, `blink-atm-movement-${date}.jsonl`);
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(
        file,
        `${JSON.stringify({
          savedAt: new Date().toISOString(),
          observationOnly: true,
          samples,
        })}\n`,
        'utf8'
      );
      return NextResponse.json({
        ok: true,
        saved: samples.length,
        file: path.basename(file),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(action)}` },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'ATM movement request failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
