'use client';

import { useEffect, useRef } from 'react';
import { getUpstoxAccessToken } from '@/lib/upstox-client';
import {
  calcUnrealized,
  isOpenTrade,
  type Trade,
  type TradeLiveAnalysis,
} from '@/lib/trades';

const QUOTE_MS = 3000;
const ANALYZE_MS = 45_000;

/**
 * Background live LTP (3s) + price-action analysis for journal trades.
 * Runs quietly — no user prompts.
 */
export function useTradeLiveSync(
  trades: Trade[],
  ready: boolean,
  patchTradeLive: (updates: { id: string; live: TradeLiveAnalysis | null }[]) => void
) {
  const tradesRef = useRef(trades);
  tradesRef.current = trades;
  const analyzing = useRef(false);

  // Fast LTP / unrealized every 3s
  useEffect(() => {
    if (!ready) return;

    const tickQuotes = async () => {
      const list = tradesRef.current;
      const symbols = Array.from(
        new Set(list.map((t) => t.symbol.trim().toUpperCase()).filter(Boolean))
      );
      if (!symbols.length) return;

      try {
        const token = getUpstoxAccessToken();
        const res = await fetch('/api/market/live', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ symbols }),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          quotes?: { symbol: string; lastPrice: number; changePct: number | null; ok: boolean }[];
        };
        if (!Array.isArray(data.quotes)) return;
        const qMap = new Map(
          data.quotes.filter((q) => q.ok).map((q) => [q.symbol.toUpperCase(), q])
        );

        const updates: { id: string; live: TradeLiveAnalysis | null }[] = [];
        for (const t of list) {
          const q = qMap.get(t.symbol.toUpperCase());
          if (!q) continue;
          const prev = t.live;
          const unrealized = isOpenTrade(t) ? calcUnrealized(t, q.lastPrice) : null;
          updates.push({
            id: t.id,
            live: {
              ltp: q.lastPrice,
              changePct: q.changePct,
              unrealized,
              bias: prev?.bias || 'FLAT',
              setup: prev?.setup || 'PENDING',
              confidence: prev?.confidence ?? 0,
              pattern: prev?.pattern || '…',
              structureText: prev?.structureText,
              updatedAt: new Date().toISOString(),
            },
          });
        }
        if (updates.length) patchTradeLive(updates);
      } catch {
        /* ignore */
      }
    };

    void tickQuotes();
    const id = window.setInterval(() => void tickQuotes(), QUOTE_MS);
    return () => window.clearInterval(id);
  }, [ready, patchTradeLive]);

  // PA / structure analysis in background (on add + every 45s)
  useEffect(() => {
    if (!ready) return;

    const runAnalyze = async (forceIds?: Set<string>) => {
      if (analyzing.current) return;
      const list = tradesRef.current;
      const need = list.filter((t) => {
        if (forceIds?.has(t.id)) return true;
        if (!t.live || t.live.setup === 'PENDING' || !t.live.pattern || t.live.pattern === '…')
          return true;
        const age = Date.now() - new Date(t.live.updatedAt || 0).getTime();
        return age > ANALYZE_MS;
      });
      if (!need.length) return;

      analyzing.current = true;
      try {
        const symbols = Array.from(
          new Map(
            need.map((t) => [t.symbol.toUpperCase(), { symbol: t.symbol.toUpperCase() }])
          ).values()
        ).slice(0, 20);

        const token = getUpstoxAccessToken();
        const res = await fetch('/api/market/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ symbols }),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          analyses?: {
            symbol: string;
            ok: boolean;
            ltp: number | null;
            changePct: number | null;
            bias: 'CE' | 'PE' | 'FLAT';
            setup: string;
            confidence: number;
            pattern: string;
            structureText: string;
            updatedAt: string;
          }[];
        };
        if (!Array.isArray(data.analyses)) return;
        const aMap = new Map(data.analyses.map((a) => [a.symbol.toUpperCase(), a]));

        const updates: { id: string; live: TradeLiveAnalysis | null }[] = [];
        for (const t of list) {
          const a = aMap.get(t.symbol.toUpperCase());
          if (!a) continue;
          const ltp = a.ltp ?? t.live?.ltp ?? null;
          updates.push({
            id: t.id,
            live: {
              ltp,
              changePct: a.changePct ?? t.live?.changePct ?? null,
              unrealized: isOpenTrade(t) ? calcUnrealized(t, ltp) : null,
              bias: a.bias,
              setup: a.setup,
              confidence: a.confidence,
              pattern: a.pattern,
              structureText: a.structureText,
              updatedAt: a.updatedAt,
            },
          });
        }
        if (updates.length) patchTradeLive(updates);
      } catch {
        /* ignore */
      } finally {
        analyzing.current = false;
      }
    };

    // New / pending trades ASAP
    const pendingIds = new Set(
      tradesRef.current
        .filter((t) => !t.live || t.live.setup === 'PENDING' || t.live.pattern === '…')
        .map((t) => t.id)
    );
    void runAnalyze(pendingIds.size ? pendingIds : undefined);

    const id = window.setInterval(() => void runAnalyze(), ANALYZE_MS);
    return () => window.clearInterval(id);
  }, [ready, patchTradeLive, trades.length]);
}
