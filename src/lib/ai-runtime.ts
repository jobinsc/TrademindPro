import { AGENT_DEFS, type AgentId, type AgentStateMap } from '@/lib/ai-agents';
import { calcPnL, isOpenTrade, summarizeTrades, type Trade } from '@/lib/trades';
import type { RiskSettings } from '@/lib/risk';

export type TradingContext = {
  trades: Trade[];
  risk: RiskSettings;
  watchlistSymbols: string[];
  alertCount: number;
  holdingsCount: number;
  strategyCount: number;
  paperCash: number | null;
};

export type AgentInsight = {
  id: string;
  agentId: AgentId;
  agentName: string;
  severity: 'info' | 'ok' | 'warn' | 'action';
  title: string;
  detail: string;
  at: string;
};

export type AgentRunResult = {
  ranAt: string;
  insights: AgentInsight[];
  briefing: string;
};

function agentName(id: AgentId): string {
  return AGENT_DEFS.find((a) => a.id === id)?.name ?? id;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Run every enabled agent against live app data */
export function runLiveAgents(
  enabled: AgentStateMap,
  ctx: TradingContext
): AgentRunResult {
  const ranAt = new Date().toISOString();
  const insights: AgentInsight[] = [];
  const summary = summarizeTrades(ctx.trades);
  const open = ctx.trades.filter(isOpenTrade);
  const closed = ctx.trades.filter((t) => !isOpenTrade(t));
  const revenge = ctx.trades.filter((t) => t.emotion === 'Revenge' || t.emotion === 'FOMO').length;

  const push = (
    agentId: AgentId,
    severity: AgentInsight['severity'],
    title: string,
    detail: string
  ) => {
    if (!enabled[agentId]) return;
    insights.push({
      id: uid(),
      agentId,
      agentName: agentName(agentId),
      severity,
      title,
      detail,
      at: ranAt,
    });
  };

  // Scanner
  if (enabled.scanner) {
    const focus =
      ctx.watchlistSymbols.slice(0, 5).join(', ') ||
      open.map((t) => t.symbol).slice(0, 5).join(', ') ||
      'NIFTY names';
    push(
      'scanner',
      'action',
      'Scan queue ready',
      `Watching ${ctx.watchlistSymbols.length || open.length} symbols (${focus}). Open Stock Scanner → Momentum Breakout, then add hits to Watchlist.`
    );
  }

  // Journal
  if (enabled.journal) {
    if (summary.total === 0) {
      push(
        'journal',
        'warn',
        'Journal empty',
        'Log your first trade in Trade Journal so this agent can spot mistakes and patterns.'
      );
    } else {
      const topMistake = closed
        .map((t) => t.mistakes?.trim())
        .filter(Boolean)
        .slice(0, 1)[0];
      push(
        'journal',
        summary.winRate >= 50 ? 'ok' : 'warn',
        `${summary.total} trades · ${summary.winRate.toFixed(0)}% win rate`,
        topMistake
          ? `Recent mistake note: “${topMistake}”. Review emotions in Reviews & Psychology.`
          : `${open.length} open · realized P&L ₹${summary.totalPnL.toFixed(0)}. Add mistake tags when you close trades.`
      );
      if (revenge >= 2) {
        push(
          'journal',
          'warn',
          'Emotional trading flagged',
          `${revenge} trades tagged FOMO/Revenge. Pause size until process feels calm.`
        );
      }
    }
  }

  // Risk
  if (enabled.risk) {
    if (ctx.risk.emergencyStop) {
      push(
        'risk',
        'warn',
        'Emergency stop ON',
        'No new risk until you release Emergency Stop in Risk Management.'
      );
    } else if (open.length > ctx.risk.maxOpenPositions) {
      push(
        'risk',
        'warn',
        'Too many open positions',
        `${open.length} open vs max ${ctx.risk.maxOpenPositions}. Close or tighten before adding.`
      );
    } else {
      const riskAmt = Math.min(
        ctx.risk.maxLossPerTrade,
        (ctx.risk.capital * ctx.risk.riskPercentPerTrade) / 100
      );
      push(
        'risk',
        'ok',
        'Risk limits active',
        `Capital ₹${ctx.risk.capital.toLocaleString('en-IN')} · ~₹${riskAmt.toFixed(0)} risk/trade · max day loss ₹${ctx.risk.maxLossPerDay}.`
      );
    }
  }

  // Strategy
  if (enabled.strategy) {
    push(
      'strategy',
      ctx.strategyCount > 0 ? 'ok' : 'info',
      ctx.strategyCount > 0 ? `${ctx.strategyCount} strategies saved` : 'No strategies yet',
      'Describe a setup in Strategy Builder (EMA / RSI templates), then send it to Backtesting.'
    );
  }

  // Sentiment
  if (enabled.sentiment) {
    push(
      'sentiment',
      'info',
      'Sentiment pulse (local)',
      'News API not connected yet. Bias: treat headlines as context only — confirm with your scan + risk rules before entry.'
    );
  }

  // Portfolio
  if (enabled.portfolio) {
    if (ctx.holdingsCount === 0) {
      push(
        'portfolio',
        'info',
        'No holdings logged',
        'Add positions in Holdings to check sector concentration and hedges.'
      );
    } else {
      push(
        'portfolio',
        'action',
        `${ctx.holdingsCount} holdings tracked`,
        'Open Holdings → review sector mix. Avoid stacking the same theme as your open journal trades.'
      );
    }
  }

  // Pattern
  if (enabled.pattern) {
    const syms = Array.from(
      new Set([...ctx.watchlistSymbols, ...open.map((t) => t.symbol)])
    ).slice(0, 4);
    push(
      'pattern',
      'info',
      'Pattern watchlist',
      syms.length
        ? `Prioritize structure on: ${syms.join(', ')}. Look for higher-high / higher-low or clean breakout+retest.`
        : 'Add watchlist symbols so pattern agent has charts to prioritize.'
    );
  }

  // Backtest
  if (enabled.backtest) {
    push(
      'backtest',
      'action',
      'Validate before live size',
      'Run a demo backtest on your main strategy, then Paper Trading with the same rules. Skip live size until both feel boring.'
    );
  }

  // Alert
  if (enabled.alert) {
    push(
      'alert',
      ctx.alertCount > 0 ? 'ok' : 'info',
      ctx.alertCount > 0 ? `${ctx.alertCount} alerts set` : 'No price alerts',
      ctx.alertCount > 0
        ? 'Alerts Agent will prioritize watchlist levels. Pause noisy ones in Alerts.'
        : 'Create price alerts from Watchlist so this agent has triggers to manage.'
    );
  }

  // Coach
  if (enabled.coach) {
    const goal =
      open.length > 0
        ? `Manage ${open.length} open trade(s) with predefined exit — no impulse adds.`
        : 'One high-quality setup only if risk is clear; otherwise journal study day.';
    push(
      'coach',
      'action',
      'Today’s coaching focus',
      `${goal} Process > P&L. Win rate now ${summary.winRate.toFixed(0)}% on closed trades.`
    );
  }

  const active = AGENT_DEFS.filter((a) => enabled[a.id]).map((a) => a.name);
  const briefing = [
    `Live agent run · ${new Date(ranAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
    `Active: ${active.length ? active.join(', ') : 'none'}`,
    `Journal: ${summary.total} trades (${open.length} open) · Win ${summary.winRate.toFixed(0)}% · P&L ₹${summary.totalPnL.toFixed(0)}`,
    `Risk: emergency ${ctx.risk.emergencyStop ? 'ON' : 'OFF'} · Watchlist ${ctx.watchlistSymbols.length} · Alerts ${ctx.alertCount}`,
    insights[0] ? `Top call: ${insights[0].title} — ${insights[0].detail}` : 'Enable agents and run again.',
  ].join('\n');

  return { ranAt, insights, briefing };
}

/** Local orchestrator — routes by intent + enabled agents + live context */
export function liveOrchestratorReply(
  prompt: string,
  enabled: AgentStateMap,
  ctx: TradingContext
): string {
  const q = prompt.trim().toLowerCase();
  if (!q) return 'Ask about briefing, risk, journal, scans, or strategy.';

  const summary = summarizeTrades(ctx.trades);
  const open = ctx.trades.filter(isOpenTrade);
  const run = runLiveAgents(enabled, ctx);

  if (ctx.risk.emergencyStop && enabled.risk) {
    return `[Risk Agent · LIVE] Emergency stop is ON. Release it in Risk Management only when you are ready. No new trades recommended.`;
  }

  if (
    q.includes('brief') ||
    q.includes('today') ||
    q.includes('plan') ||
    q.includes('morning')
  ) {
    const coach = run.insights.find((i) => i.agentId === 'coach');
    const risk = run.insights.find((i) => i.agentId === 'risk');
    return [
      '[Master Orchestrator · LIVE]',
      coach?.detail ?? 'Enable AI Trading Coach for daily focus.',
      risk ? `Risk: ${risk.detail}` : '',
      `Journal snapshot: ${summary.total} trades, ${open.length} open, win rate ${summary.winRate.toFixed(0)}%.`,
      open.length
        ? `Open: ${open.map((t) => `${t.symbol} @ ${t.entryPrice}`).slice(0, 5).join(', ')}`
        : 'No open journal trades.',
      'Next: Run Agents below, then act only on green risk + clear setup.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (q.includes('scan') || q.includes('breakout') || q.includes('momentum')) {
    if (!enabled.scanner) {
      return 'Scanner Agent is OFF. Toggle it on, then ask again — or open Stock Scanner manually.';
    }
    const hit = run.insights.find((i) => i.agentId === 'scanner');
    return `[Scanner Agent · LIVE]\n${hit?.detail ?? 'Open Stock Scanner.'}\nTip: add results to Watchlist so Alert Agent can watch levels.`;
  }

  if (q.includes('risk') || q.includes('position size') || q.includes('size')) {
    if (!enabled.risk) {
      return 'Risk Agent is OFF. Enable it to get live risk checks.';
    }
    const hit = run.insights.find((i) => i.agentId === 'risk');
    return `[Risk Agent · LIVE]\n${hit?.detail ?? 'Check Risk Management.'}\nOpen Risk → use position size calculator with your stop distance.`;
  }

  if (
    q.includes('journal') ||
    q.includes('mistake') ||
    q.includes('review') ||
    q.includes('win rate')
  ) {
    if (!enabled.journal) {
      return 'Journal Agent is OFF. Enable it to analyze your trades.';
    }
    const lines = run.insights.filter((i) => i.agentId === 'journal').map((i) => `• ${i.title}: ${i.detail}`);
    return `[Journal Agent · LIVE]\n${lines.join('\n') || 'Log more trades for deeper feedback.'}\nOpen Reviews & Psychology for emotion breakdown.`;
  }

  if (q.includes('strategy') || q.includes('ema') || q.includes('rsi') || q.includes('setup')) {
    if (!enabled.strategy && !enabled.backtest) {
      return 'Enable Strategy Builder and/or Backtesting agents, then ask again.';
    }
    return `[Strategy · LIVE]\nYou have ${ctx.strategyCount} saved strategies. Use Strategy Builder templates → Backtesting → Paper Trading (cash ${
      ctx.paperCash != null ? `₹${ctx.paperCash.toLocaleString('en-IN')}` : 'n/a'
    }) before Auto Execution.`;
  }

  if (q.includes('portfolio') || q.includes('holding') || q.includes('hedge')) {
    if (!enabled.portfolio) {
      return 'Portfolio Agent is OFF. Toggle it on for holdings advice.';
    }
    const hit = run.insights.find((i) => i.agentId === 'portfolio');
    return `[Portfolio Agent · LIVE]\n${hit?.detail}`;
  }

  if (q.includes('alert') || q.includes('notify')) {
    if (!enabled.alert) return 'Alert Agent is OFF. Enable it first.';
    const hit = run.insights.find((i) => i.agentId === 'alert');
    return `[Alert Agent · LIVE]\n${hit?.detail}`;
  }

  if (q.includes('pattern') || q.includes('candle') || q.includes('chart')) {
    if (!enabled.pattern) return 'Pattern Agent is OFF. Enable it first.';
    const hit = run.insights.find((i) => i.agentId === 'pattern');
    return `[Pattern Agent · LIVE]\n${hit?.detail}`;
  }

  if (q.includes('sentiment') || q.includes('news')) {
    if (!enabled.sentiment) return 'Sentiment Agent is OFF. Enable it first.';
    const hit = run.insights.find((i) => i.agentId === 'sentiment');
    return `[Sentiment Agent · LIVE]\n${hit?.detail}`;
  }

  if (q.includes('coach') || q.includes('help')) {
    if (!enabled.coach) return 'AI Trading Coach is OFF. Enable it first.';
    const hit = run.insights.find((i) => i.agentId === 'coach');
    return `[Coach · LIVE]\n${hit?.detail}`;
  }

  // Default: synthesize from enabled agents
  const top = run.insights.slice(0, 3);
  const openPnlHints = open
    .slice(0, 3)
    .map((t) => {
      const pnl = calcPnL({ ...t, exitPrice: t.entryPrice });
      return `${t.symbol} ${t.side} ${t.qty}@${t.entryPrice}`;
    })
    .join('; ');

  return [
    '[Master Orchestrator · LIVE]',
    `Heard: “${prompt.trim()}”`,
    `Routing across ${Object.values(enabled).filter(Boolean).length} live agents.`,
    top.length
      ? top.map((i) => `→ ${i.agentName}: ${i.title}`).join('\n')
      : 'Enable at least one agent, then click Run Agents.',
    openPnlHints ? `Open book: ${openPnlHints}` : '',
    'Ask “Today’s briefing”, “Check my risk”, or “Scan for breakouts” for focused agents.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSystemPrompt(enabled: AgentStateMap, ctx: TradingContext): string {
  const summary = summarizeTrades(ctx.trades);
  const open = ctx.trades.filter(isOpenTrade);
  const active = AGENT_DEFS.filter((a) => enabled[a.id]);
  return `You are TradeMind Pro Master AI Orchestrator for Indian markets (NSE/BSE).
Speak clearly for a retail trader. Be concise (under 180 words). Never invent live prices or guaranteed returns.
Enabled specialist agents: ${active.map((a) => a.name).join(', ') || 'none'}.
Live context:
- Trades: ${summary.total} total, ${open.length} open, win rate ${summary.winRate.toFixed(0)}%, realized P&L ₹${summary.totalPnL.toFixed(0)}
- Open symbols: ${open.map((t) => t.symbol).join(', ') || 'none'}
- Risk: capital ₹${ctx.risk.capital}, max loss/trade ₹${ctx.risk.maxLossPerTrade}, max day ₹${ctx.risk.maxLossPerDay}, emergencyStop=${ctx.risk.emergencyStop}
- Watchlist symbols: ${ctx.watchlistSymbols.slice(0, 12).join(', ') || 'none'}
- Alerts: ${ctx.alertCount}, Holdings: ${ctx.holdingsCount}, Strategies: ${ctx.strategyCount}
Route answers through the most relevant enabled agent and name it. Suggest in-app modules (Journal, Scanner, Risk, etc.) when useful.`;
}
