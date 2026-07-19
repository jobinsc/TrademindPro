import type { Exchange } from '@/lib/watchlist';

export type AlertCondition = 'above' | 'below';
export type AlertStatus = 'active' | 'paused' | 'triggered';
export type AlertPriority = 'low' | 'medium' | 'critical';

export type PriceAlert = {
  id: string;
  symbol: string;
  exchange: Exchange;
  condition: AlertCondition;
  targetPrice: number;
  priority: AlertPriority;
  note: string;
  status: AlertStatus;
  createdAt: string;
  triggeredAt: string | null;
};

export type AlertInput = Omit<PriceAlert, 'id' | 'createdAt' | 'triggeredAt' | 'status'> & {
  status?: AlertStatus;
};

export function emptyAlertInput(): AlertInput {
  return {
    symbol: '',
    exchange: 'NSE',
    condition: 'above',
    targetPrice: 0,
    priority: 'medium',
    note: '',
    status: 'active',
  };
}

export function summarizeAlerts(alerts: PriceAlert[]) {
  return {
    total: alerts.length,
    active: alerts.filter((a) => a.status === 'active').length,
    paused: alerts.filter((a) => a.status === 'paused').length,
    triggered: alerts.filter((a) => a.status === 'triggered').length,
  };
}
