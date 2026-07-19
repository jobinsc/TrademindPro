export type BrokerId =
  | 'zerodha'
  | 'upstox'
  | 'angelone'
  | 'dhan'
  | 'fyers'
  | '5paisa';

export type BrokerConnection = {
  brokerId: BrokerId;
  label: string;
  apiKey: string;
  apiSecret: string;
  clientId: string;
  connected: boolean;
  connectedAt: string | null;
};

export type TerminalSnapshot = {
  available: number;
  marginUsedPct: number;
  dayPnl: number;
  openPositions: number;
};

export const BROKER_OPTIONS: {
  id: BrokerId;
  name: string;
  blurb: string;
}[] = [
  { id: 'zerodha', name: 'Zerodha', blurb: 'Kite Connect API' },
  { id: 'upstox', name: 'Upstox', blurb: 'Upstox API v2' },
  { id: 'angelone', name: 'Angel One', blurb: 'SmartAPI' },
  { id: 'dhan', name: 'Dhan', blurb: 'Dhan API' },
  { id: 'fyers', name: 'Fyers', blurb: 'Fyers API' },
  { id: '5paisa', name: '5paisa', blurb: '5paisa API' },
];

export function emptyConnection(brokerId: BrokerId = 'upstox'): BrokerConnection {
  const opt = BROKER_OPTIONS.find((b) => b.id === brokerId);
  return {
    brokerId,
    label: opt?.name || brokerId,
    apiKey: '',
    apiSecret: '',
    clientId: '',
    connected: false,
    connectedAt: null,
  };
}

export function emptySnapshot(): TerminalSnapshot {
  return {
    available: 0,
    marginUsedPct: 0,
    dayPnl: 0,
    openPositions: 0,
  };
}
