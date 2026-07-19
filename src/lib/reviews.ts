import { calcPnL, isOpenTrade, todayISO, type Trade } from '@/lib/trades';

export type ReviewType = 'daily' | 'weekly' | 'monthly';

export type ReviewEntry = {
  id: string;
  type: ReviewType;
  date: string;
  mood: number;
  followedRules: boolean;
  whatWentWell: string;
  whatToImprove: string;
  notes: string;
  createdAt: string;
};

export type TradingRule = {
  id: string;
  text: string;
  checked: boolean;
};

export type TradingGoal = {
  id: string;
  text: string;
  target: string;
  done: boolean;
};

export const DEFAULT_RULES: TradingRule[] = [
  { id: 'r1', text: 'Always set a stop-loss before entry', checked: false },
  { id: 'r2', text: 'Risk only 1–2% of capital per trade', checked: false },
  { id: 'r3', text: 'No revenge trading after a loss', checked: false },
  { id: 'r4', text: 'Trade only planned setups', checked: false },
  { id: 'r5', text: 'No trading in the first 15 minutes (unless planned)', checked: false },
];

export const DEFAULT_GOALS: TradingGoal[] = [
  { id: 'g1', text: 'Follow all rules for 5 trading days', target: 'Discipline', done: false },
  { id: 'g2', text: 'Journal every trade the same day', target: 'Consistency', done: false },
  { id: 'g3', text: 'Keep max 3 open positions', target: 'Risk', done: false },
];

export function emptyReview(type: ReviewType = 'daily'): Omit<ReviewEntry, 'id' | 'createdAt'> {
  return {
    type,
    date: todayISO(),
    mood: 3,
    followedRules: true,
    whatWentWell: '',
    whatToImprove: '',
    notes: '',
  };
}

export type PsychInsight = {
  winStreak: number;
  lossStreak: number;
  topEmotion: string | null;
  riskyEmotions: { name: string; count: number; pnl: number }[];
  topMistakes: { text: string; count: number }[];
  tip: string;
};

export function buildPsychInsights(trades: Trade[]): PsychInsight {
  const closed = trades
    .filter((t) => !isOpenTrade(t))
    .map((t) => ({ trade: t, pnl: calcPnL(t)! }))
    .sort((a, b) => {
      const da = a.trade.exitDate || a.trade.tradeDate;
      const db = b.trade.exitDate || b.trade.tradeDate;
      return da.localeCompare(db);
    });

  let winStreak = 0;
  let lossStreak = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const row of closed) {
    if (row.pnl > 0) {
      curWin += 1;
      curLoss = 0;
      winStreak = Math.max(winStreak, curWin);
    } else if (row.pnl < 0) {
      curLoss += 1;
      curWin = 0;
      lossStreak = Math.max(lossStreak, curLoss);
    }
  }
  // current streak from the end
  if (closed.length) {
    const last = closed[closed.length - 1];
    if (last.pnl > 0) {
      winStreak = Math.max(winStreak, curWin);
    }
  }

  // Recalculate current streak more accurately from the end
  let endWin = 0;
  let endLoss = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (closed[i].pnl > 0) {
      if (endLoss > 0) break;
      endWin += 1;
    } else if (closed[i].pnl < 0) {
      if (endWin > 0) break;
      endLoss += 1;
    } else break;
  }

  const emotionMap = new Map<string, { count: number; pnl: number }>();
  for (const { trade, pnl } of closed) {
    const name = trade.emotion || 'Neutral';
    const cur = emotionMap.get(name) || { count: 0, pnl: 0 };
    cur.count += 1;
    cur.pnl += pnl;
    emotionMap.set(name, cur);
  }

  const emotions = [...emotionMap.entries()]
    .map(([name, v]) => ({ name, count: v.count, pnl: v.pnl }))
    .sort((a, b) => b.count - a.count);

  const topEmotion = emotions[0]?.name ?? null;
  const riskyEmotions = emotions
    .filter((e) => ['FOMO', 'Fear', 'Revenge', 'Excited'].includes(e.name))
    .sort((a, b) => a.pnl - b.pnl);

  const mistakeMap = new Map<string, number>();
  for (const t of trades) {
    const m = t.mistakes?.trim();
    if (!m) continue;
    mistakeMap.set(m, (mistakeMap.get(m) || 0) + 1);
  }
  const topMistakes = [...mistakeMap.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let tip = 'Log a few closed trades to unlock psychology insights.';
  if (closed.length > 0) {
    if (endLoss >= 2) {
      tip = 'You are on a losing streak — pause, review rules, and avoid revenge trades today.';
    } else if (riskyEmotions[0] && riskyEmotions[0].pnl < 0) {
      tip = `Trades marked “${riskyEmotions[0].name}” are hurting P&L. Slow down when you feel that emotion.`;
    } else if (topMistakes[0]) {
      tip = `Most noted mistake: “${topMistakes[0].text}”. Make that your #1 rule this week.`;
    } else if (endWin >= 2) {
      tip = 'Winning streak — stay disciplined. Don’t increase size just because you’re confident.';
    } else {
      tip = 'Keep journaling emotions on every trade. Patterns become clear after 10+ closed trades.';
    }
  }

  return {
    winStreak: Math.max(winStreak, endWin),
    lossStreak: Math.max(lossStreak, endLoss),
    topEmotion,
    riskyEmotions,
    topMistakes,
    tip,
  };
}
