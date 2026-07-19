export type AutomationStatus = 'paused' | 'ready' | 'running';

export type AutomationConfig = {
  status: AutomationStatus;
  strategyId: string | null;
  respectRiskLimits: boolean;
  paperMode: boolean;
  updatedAt: string | null;
};

export type AutomationEvent = {
  id: string;
  time: string;
  text: string;
};

export function defaultAutomation(): AutomationConfig {
  return {
    status: 'paused',
    strategyId: null,
    respectRiskLimits: true,
    paperMode: true,
    updatedAt: null,
  };
}

/** Normalize older saved status "armed" → "ready" */
export function normalizeAutomationStatus(status: string): AutomationStatus {
  if (status === 'armed') return 'ready';
  if (status === 'running' || status === 'ready' || status === 'paused') return status;
  return 'paused';
}
