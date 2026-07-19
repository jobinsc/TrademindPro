import { defaultRiskSettings, type RiskSettings } from '@/lib/risk';
import { normalizeTrade, type Trade } from '@/lib/trades';
import type { TradingContext } from '@/lib/ai-runtime';

/** Collect live app state from localStorage (browser only) */
export function collectTradingContext(): TradingContext {
  const empty: TradingContext = {
    trades: [],
    risk: defaultRiskSettings(),
    watchlistSymbols: [],
    alertCount: 0,
    holdingsCount: 0,
    strategyCount: 0,
    paperCash: null,
  };
  if (typeof window === 'undefined') return empty;

  try {
    const tradesRaw = localStorage.getItem('trademindpro_trades_v1');
    const trades = tradesRaw
      ? (JSON.parse(tradesRaw) as Partial<Trade>[])
          .filter((t): t is Partial<Trade> & { id: string } => Boolean(t && t.id))
          .map(normalizeTrade)
      : [];

    const riskRaw = localStorage.getItem('trademindpro_risk_v1');
    const risk = riskRaw
      ? ({ ...defaultRiskSettings(), ...(JSON.parse(riskRaw) as Partial<RiskSettings>) } as RiskSettings)
      : defaultRiskSettings();

    const listsRaw = localStorage.getItem('trademindpro_watchlists_v1');
    const lists = listsRaw ? (JSON.parse(listsRaw) as { symbols?: { symbol?: string }[] }[]) : [];
    const watchlistSymbols = Array.isArray(lists)
      ? Array.from(
          new Set(
            lists.flatMap((l) =>
              Array.isArray(l.symbols)
                ? l.symbols.map((s) => String(s.symbol || '').toUpperCase()).filter(Boolean)
                : []
            )
          )
        )
      : [];

    const alertsRaw = localStorage.getItem('trademindpro_alerts_v1');
    const alerts = alertsRaw ? (JSON.parse(alertsRaw) as unknown[]) : [];
    const holdingsRaw = localStorage.getItem('trademindpro_holdings_v1');
    const holdings = holdingsRaw ? (JSON.parse(holdingsRaw) as unknown[]) : [];
    const strategiesRaw = localStorage.getItem('trademindpro_strategies_v1');
    const strategies = strategiesRaw ? (JSON.parse(strategiesRaw) as unknown[]) : [];

    let paperCash: number | null = null;
    const paperRaw = localStorage.getItem('trademindpro_paper_v1');
    if (paperRaw) {
      const paper = JSON.parse(paperRaw) as { account?: { cash?: number }; cash?: number };
      if (typeof paper.account?.cash === 'number') paperCash = paper.account.cash;
      else if (typeof paper.cash === 'number') paperCash = paper.cash;
    }

    return {
      trades,
      risk,
      watchlistSymbols,
      alertCount: Array.isArray(alerts) ? alerts.length : 0,
      holdingsCount: Array.isArray(holdings) ? holdings.length : 0,
      strategyCount: Array.isArray(strategies) ? strategies.length : 0,
      paperCash,
    };
  } catch {
    return empty;
  }
}
