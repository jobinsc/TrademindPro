'use client';

import { useCallback, useEffect, useState } from 'react';
import { defaultRiskSettings, type RiskSettings } from '@/lib/risk';

const KEY = 'trademindpro_risk_v1';

function readSettings(): RiskSettings {
  if (typeof window === 'undefined') return defaultRiskSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultRiskSettings();
    return { ...defaultRiskSettings(), ...(JSON.parse(raw) as Partial<RiskSettings>) };
  } catch {
    return defaultRiskSettings();
  }
}

function writeSettings(settings: RiskSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function useRiskSettings() {
  const [settings, setSettings] = useState<RiskSettings>(defaultRiskSettings());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(readSettings());
    setReady(true);
  }, []);

  const save = useCallback((next: RiskSettings) => {
    const withTime = { ...next, updatedAt: new Date().toISOString() };
    setSettings(withTime);
    writeSettings(withTime);
  }, []);

  const update = useCallback(
    (patch: Partial<RiskSettings>) => {
      const current = readSettings();
      save({ ...current, ...patch });
    },
    [save]
  );

  const toggleEmergency = useCallback(() => {
    const current = readSettings();
    save({ ...current, emergencyStop: !current.emergencyStop });
  }, [save]);

  const resetDefaults = useCallback(() => {
    save(defaultRiskSettings());
  }, [save]);

  return { settings, ready, save, update, toggleEmergency, resetDefaults };
}
