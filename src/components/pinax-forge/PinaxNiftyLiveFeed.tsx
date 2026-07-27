'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { isLocalAppHost, pingLocalServer } from '@/lib/local-server';

type NiftyCandle = { t: string; close: number; high: number; low: number; open: number };

type NiftyPayload = {
  ok?: boolean;
  spot?: number | null;
  candles?: NiftyCandle[];
  fetchedAt?: string;
  error?: string;
};

const FEED_MS = 3000;

function sparkPoints(closes: number[], w: number, h: number): string {
  if (closes.length < 2) return '';
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((c - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
}

export default function PinaxNiftyLiveFeed() {
  const [spot, setSpot] = useState<number | null>(null);
  const [prevSpot, setPrevSpot] = useState<number | null>(null);
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sparkCloses, setSparkCloses] = useState<number[]>([]);
  const [error, setError] = useState('');
  const tickRef = useRef(0);

  const pull = useCallback(async () => {
    if (!isLocalAppHost()) return;
    const serverOk = await pingLocalServer(4000);
    if (!serverOk) {
      setLive(false);
      return;
    }

    try {
      const res = await fetch('/api/market/nifty?tf=1m&limit=60', { cache: 'no-store' });
      const data = (await res.json()) as NiftyPayload;
      if (!data.ok || data.spot == null) {
        setError(data.error || 'Nifty feed unavailable');
        setLive(false);
        return;
      }

      const nextSpot = Number(data.spot);
      const candles = data.candles ?? [];
      const closes = candles.map((c) => c.close).slice(-40);

      setSpot((prev) => {
        if (prev != null && nextSpot !== prev) {
          setFlash(nextSpot > prev ? 'up' : 'down');
          window.setTimeout(() => setFlash(null), 600);
          setPrevSpot(prev);
        } else if (prev == null) {
          setPrevSpot(nextSpot);
        }
        return nextSpot;
      });

      if (candles.length) {
        setDayOpen(candles[0].open);
      }
      setSparkCloses(closes);
      setUpdatedAt(data.fetchedAt || new Date().toISOString());
      setLive(true);
      setError('');
      tickRef.current += 1;
    } catch {
      setLive(false);
      setError('Feed paused — waiting for server…');
    }
  }, []);

  useEffect(() => {
    void pull();
    const id = window.setInterval(() => void pull(), FEED_MS);
    return () => window.clearInterval(id);
  }, [pull]);

  const fromOpen =
    spot != null && dayOpen != null ? Math.round((spot - dayOpen) * 10) / 10 : null;
  const tickDelta =
    spot != null && prevSpot != null && spot !== prevSpot
      ? Math.round((spot - prevSpot) * 10) / 10
      : null;

  return (
    <section className="mt-4 rounded-2xl border border-[#dbe8f2] bg-gradient-to-br from-white to-sky-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-deep" />
            <h2 className="font-display text-[14px] font-semibold text-sky-ink">
              Nifty 50 live feed
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                live
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-sky-400'}`}
              />
              {live ? 'Live · 3s' : 'Waiting'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-sky-ink/50">
            1m Yahoo stream — watch spot move while PinaxForge polls setups (~45s).
          </p>
        </div>
        {updatedAt && (
          <p className="text-[10px] text-sky-ink/45">
            Updated {new Date(updatedAt).toLocaleTimeString('en-IN')}
            {tickRef.current > 0 ? ` · beat #${tickRef.current}` : ''}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div
          className={`rounded-xl px-4 py-2 transition-colors duration-300 ${
            flash === 'up'
              ? 'bg-emerald-100'
              : flash === 'down'
                ? 'bg-rose-100'
                : 'bg-white/80'
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
            Spot
          </p>
          <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-sky-ink">
            {spot != null ? spot.toFixed(2) : '—'}
          </p>
          <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
            {fromOpen != null && (
              <span
                className={
                  fromOpen >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'
                }
              >
                {fromOpen >= 0 ? '+' : ''}
                {fromOpen} from open
              </span>
            )}
            {tickDelta != null && tickDelta !== 0 && (
              <span className="text-sky-ink/55">
                last tick {tickDelta >= 0 ? '+' : ''}
                {tickDelta}
              </span>
            )}
          </div>
        </div>

        {sparkCloses.length > 1 && (
          <div className="min-w-[140px] flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-ink/45">
              Last {sparkCloses.length} × 1m
            </p>
            <svg viewBox="0 0 140 44" className="h-11 w-full max-w-[200px]" aria-hidden>
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-sky-deep"
                points={sparkPoints(sparkCloses, 140, 44)}
              />
            </svg>
          </div>
        )}
      </div>

      {error && !live && (
        <p className="mt-2 text-[11px] text-amber-800">{error}</p>
      )}
    </section>
  );
}
