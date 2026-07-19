'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_GOALS,
  DEFAULT_RULES,
  type ReviewEntry,
  type TradingGoal,
  type TradingRule,
} from '@/lib/reviews';

const KEY = 'trademindpro_reviews_v1';

type Store = {
  reviews: ReviewEntry[];
  rules: TradingRule[];
  goals: TradingGoal[];
};

function emptyStore(): Store {
  return {
    reviews: [],
    rules: DEFAULT_RULES,
    goals: DEFAULT_GOALS,
  };
}

function readStore(): Store {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      rules: Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules : DEFAULT_RULES,
      goals: Array.isArray(parsed.goals) && parsed.goals.length ? parsed.goals : DEFAULT_GOALS,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function useReviews() {
  const [store, setStore] = useState<Store>(emptyStore());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = readStore();
    setStore(loaded);
    writeStore(loaded);
    setReady(true);
  }, []);

  const persist = useCallback((next: Store) => {
    setStore(next);
    writeStore(next);
  }, []);

  const addReview = useCallback(
    (input: Omit<ReviewEntry, 'id' | 'createdAt'>) => {
      const entry: ReviewEntry = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      const current = readStore();
      persist({ ...current, reviews: [entry, ...current.reviews] });
      return entry;
    },
    [persist]
  );

  const deleteReview = useCallback(
    (id: string) => {
      const current = readStore();
      persist({ ...current, reviews: current.reviews.filter((r) => r.id !== id) });
    },
    [persist]
  );

  const toggleRule = useCallback(
    (id: string) => {
      const current = readStore();
      persist({
        ...current,
        rules: current.rules.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)),
      });
    },
    [persist]
  );

  const resetRulesToday = useCallback(() => {
    const current = readStore();
    persist({
      ...current,
      rules: current.rules.map((r) => ({ ...r, checked: false })),
    });
  }, [persist]);

  const toggleGoal = useCallback(
    (id: string) => {
      const current = readStore();
      persist({
        ...current,
        goals: current.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
      });
    },
    [persist]
  );

  const addGoal = useCallback(
    (text: string, target: string) => {
      if (!text.trim()) return;
      const current = readStore();
      const goal: TradingGoal = {
        id: crypto.randomUUID(),
        text: text.trim(),
        target: target.trim() || 'Custom',
        done: false,
      };
      persist({ ...current, goals: [...current.goals, goal] });
    },
    [persist]
  );

  return {
    ready,
    reviews: store.reviews,
    rules: store.rules,
    goals: store.goals,
    addReview,
    deleteReview,
    toggleRule,
    resetRulesToday,
    toggleGoal,
    addGoal,
  };
}
