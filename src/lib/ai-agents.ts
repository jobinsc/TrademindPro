export type AgentId =
  | 'scanner'
  | 'journal'
  | 'risk'
  | 'strategy'
  | 'sentiment'
  | 'portfolio'
  | 'pattern'
  | 'backtest'
  | 'alert'
  | 'coach';

export type AgentDef = {
  id: AgentId;
  name: string;
  text: string;
};

export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'scanner',
    name: 'Market Scanner Agent',
    text: 'Scans NSE & BSE for breakouts, reversals, and momentum — learns what you act on.',
  },
  {
    id: 'journal',
    name: 'Trade Journal Agent',
    text: 'Reads your trades, finds mistake patterns, and gives weekly personalized feedback.',
  },
  {
    id: 'risk',
    name: 'Risk Management Agent',
    text: 'Watches open risk, sizes positions, and warns on revenge trading.',
  },
  {
    id: 'strategy',
    name: 'Strategy Builder Agent',
    text: 'Turns plain English into strategy logic, then backtests and suggests improvements.',
  },
  {
    id: 'sentiment',
    name: 'Sentiment & News Agent',
    text: 'Scores news and social sentiment for stocks and the wider market.',
  },
  {
    id: 'portfolio',
    name: 'Portfolio Optimization Agent',
    text: 'Finds concentration risk, suggests rebalancing and hedges.',
  },
  {
    id: 'pattern',
    name: 'Pattern Recognition Agent',
    text: 'Detects chart & candlestick patterns across timeframes with quality ratings.',
  },
  {
    id: 'backtest',
    name: 'Backtesting Agent',
    text: 'Runs historical tests, optimizes parameters, and recommends trade or skip.',
  },
  {
    id: 'alert',
    name: 'Alert & Notification Agent',
    text: 'Smart, priority-based alerts across in-app channels.',
  },
  {
    id: 'coach',
    name: 'AI Trading Coach',
    text: 'Daily briefing, weekly goals, and coaching from your journal.',
  },
];

/** Flagship Nifty options agent — full UI at /app/nejoic */
export const NEJOIC_HUB_NOTE =
  'Nejoic is your Nifty options specialist (₹2500 daily target / ₹1500 max loss). Open Nejoic from the sidebar.';

export type AgentStateMap = Record<AgentId, boolean>;

export function defaultAgentState(): AgentStateMap {
  return {
    scanner: true,
    journal: true,
    risk: true,
    strategy: false,
    sentiment: false,
    portfolio: false,
    pattern: false,
    backtest: true,
    alert: true,
    coach: true,
  };
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

/** @deprecated Prefer liveOrchestratorReply from ai-runtime */
export function demoAgentReply(
  prompt: string,
  ctx: { tradeCount: number; openTrades: number; winRate: number; emergencyStop: boolean }
): string {
  const q = prompt.trim().toLowerCase();
  if (!q) return 'Ask me about your journal, risk, or a scan idea.';
  if (ctx.emergencyStop) {
    return 'Risk emergency stop is ON. Pause new trades until you release it in Risk Management.';
  }
  if (q.includes('breakout') || q.includes('scan')) {
    return 'Open Stock Scanner → Momentum Breakout, then add strong names to Watchlist.';
  }
  if (q.includes('risk') || q.includes('position size')) {
    return 'Open Risk Management and use the position size calculator (1–2% risk per trade).';
  }
  if (q.includes('journal') || q.includes('review') || q.includes('mistake')) {
    return `You have ${ctx.tradeCount} journal trades (${ctx.openTrades} open). Win rate ≈ ${ctx.winRate.toFixed(0)}%. Check Reviews & Psychology.`;
  }
  return `Orchestrator: use Strategy Builder → Backtesting → Paper Trading, then Auto Execution with risk on.`;
}
