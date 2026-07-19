export type RiskSettings = {
  maxLossPerTrade: number;
  maxLossPerDay: number;
  maxOpenPositions: number;
  riskPercentPerTrade: number;
  maxMarginUtilization: number;
  trailingSlEnabled: boolean;
  autoDisableOnDayLoss: boolean;
  emergencyStop: boolean;
  capital: number;
  updatedAt: string | null;
};

export function defaultRiskSettings(): RiskSettings {
  return {
    maxLossPerTrade: 2000,
    maxLossPerDay: 5000,
    maxOpenPositions: 3,
    riskPercentPerTrade: 1,
    maxMarginUtilization: 50,
    trailingSlEnabled: true,
    autoDisableOnDayLoss: true,
    emergencyStop: false,
    capital: 100000,
    updatedAt: null,
  };
}

export function suggestedPositionSize(settings: RiskSettings, stopDistance: number): number {
  if (stopDistance <= 0 || settings.capital <= 0) return 0;
  const riskAmount = Math.min(
    settings.maxLossPerTrade,
    (settings.capital * settings.riskPercentPerTrade) / 100
  );
  return Math.floor(riskAmount / stopDistance);
}

export type RiskCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

/** Demo day P&L / open positions until live terminal feed */
export function evaluateRisk(
  settings: RiskSettings,
  live: { dayPnl: number; openPositions: number; marginUsedPct: number }
): RiskCheck[] {
  const dayLossHit = live.dayPnl <= -Math.abs(settings.maxLossPerDay);
  return [
    {
      id: 'emergency',
      label: 'Emergency stop',
      ok: !settings.emergencyStop,
      detail: settings.emergencyStop
        ? 'Trading halted — emergency stop is ON'
        : 'Emergency stop is OFF — trading allowed',
    },
    {
      id: 'day-loss',
      label: 'Daily loss limit',
      ok: !dayLossHit,
      detail: dayLossHit
        ? `Day P&L ${live.dayPnl} hit max loss ₹${settings.maxLossPerDay}`
        : `Day P&L within ₹${settings.maxLossPerDay} limit`,
    },
    {
      id: 'positions',
      label: 'Open positions',
      ok: live.openPositions <= settings.maxOpenPositions,
      detail: `${live.openPositions} / ${settings.maxOpenPositions} positions`,
    },
    {
      id: 'margin',
      label: 'Margin utilization',
      ok: live.marginUsedPct <= settings.maxMarginUtilization,
      detail: `${live.marginUsedPct}% used (max ${settings.maxMarginUtilization}%)`,
    },
    {
      id: 'auto-disable',
      label: 'Auto-disable on day loss',
      ok: true,
      detail: settings.autoDisableOnDayLoss
        ? 'Will auto-disable if daily loss limit hits'
        : 'Auto-disable is off',
    },
  ];
}
