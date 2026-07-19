'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Lightbulb,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import InfoBubble from '@/components/ui/InfoBubble';
import BackToLink from '@/components/ui/BackToLink';
import { useTrades } from '@/hooks/useTrades';
import { useReviews } from '@/hooks/useReviews';
import {
  buildPsychInsights,
  emptyReview,
  type ReviewType,
} from '@/lib/reviews';
import { todayISO as tradeToday } from '@/lib/trades';

function maxDate() {
  return tradeToday();
}

const MOOD_LABELS = ['Very low', 'Low', 'Okay', 'Good', 'Excellent'];

export default function ReviewsWorkspace() {
  const { trades, ready: tradesReady } = useTrades();
  const {
    ready,
    reviews,
    rules,
    goals,
    addReview,
    deleteReview,
    toggleRule,
    resetRulesToday,
    toggleGoal,
    addGoal,
  } = useReviews();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => emptyReview('daily'));
  const [goalText, setGoalText] = useState('');

  const insights = useMemo(() => buildPsychInsights(trades), [trades]);
  const rulesDone = rules.filter((r) => r.checked).length;
  const goalsDone = goals.filter((g) => g.done).length;

  function openForm(type: ReviewType = 'daily') {
    setForm(emptyReview(type));
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.date > maxDate()) {
      alert('Review date cannot be in the future');
      return;
    }
    addReview(form);
    setOpen(false);
  }

  function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    addGoal(goalText, 'Custom');
    setGoalText('');
  }

  if (!ready || !tradesReady) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 text-center text-sm text-sky-ink/50 md:px-8">
        Loading reviews…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-mid">
            Module 1 · Reviews
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-sky-ink">
              Reviews &amp; Psychology
            </h1>
            <InfoBubble title="About Reviews">
              Check your rules, track goals, and write short reviews. Insights come from your journal emotions and mistakes.
            </InfoBubble>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openForm('daily')}
          className="inline-flex items-center gap-2 rounded-full bg-sky-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(26,107,168,0.25)] transition hover:bg-sky-ink"
        >
          <Plus className="h-4 w-4" />
          Write review
        </button>
      </div>

      {/* Coach tip */}
      <div className="mt-7 flex items-start gap-3 rounded-2xl border border-[#cfe0ee] bg-white px-5 py-4">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-deep" strokeWidth={1.75} />
        <div>
          <p className="font-display text-sm font-semibold text-sky-ink">Today’s coaching tip</p>
          <p className="mt-1 text-sm leading-relaxed text-sky-ink/65">{insights.tip}</p>
        </div>
      </div>

      {/* Psych stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Best win streak" value={`${insights.winStreak}`} />
        <Stat label="Worst loss streak" value={`${insights.lossStreak}`} />
        <Stat label="Top emotion" value={insights.topEmotion || '—'} />
        <Stat label="Rules checked" value={`${rulesDone}/${rules.length}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Rules */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-sky-ink">Rule checklist</h2>
              <p className="mt-0.5 text-[12px] text-sky-ink/45">Tick what you followed today</p>
            </div>
            <button
              type="button"
              onClick={resetRulesToday}
              className="text-xs font-semibold text-sky-deep hover:underline"
            >
              Reset
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {rules.map((rule) => (
              <li key={rule.id}>
                <button
                  type="button"
                  onClick={() => toggleRule(rule.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    rule.checked ? 'bg-sky-mist/80 text-sky-ink' : 'bg-sky-soft/60 text-sky-ink/75'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      rule.checked
                        ? 'border-sky-deep bg-sky-deep text-white'
                        : 'border-[#cfe0ee] bg-white'
                    }`}
                  >
                    {rule.checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {rule.text}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Goals */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">Goals</h2>
            <p className="mt-0.5 text-[12px] text-sky-ink/45">
              {goalsDone} of {goals.length} complete
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {goals.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => toggleGoal(goal.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    goal.done ? 'bg-emerald-50 text-sky-ink' : 'bg-sky-soft/60 text-sky-ink/75'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      goal.done
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-[#cfe0ee] bg-white'
                    }`}
                  >
                    {goal.done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span>
                    <span className={goal.done ? 'line-through opacity-70' : ''}>{goal.text}</span>
                    <span className="mt-0.5 block text-[11px] text-sky-ink/40">{goal.target}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddGoal} className="mt-4 flex gap-2">
            <input
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="New goal…"
              className="min-w-0 flex-1 rounded-xl border border-[#cfe0ee] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-mid/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-sky-deep px-3 py-2 text-sm font-semibold text-white hover:bg-sky-ink"
            >
              Add
            </button>
          </form>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Mistakes from journal */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Mistake patterns</h2>
          <p className="mt-0.5 text-[12px] text-sky-ink/45">From notes in your Trade Journal</p>
          {insights.topMistakes.length === 0 ? (
            <p className="mt-4 text-sm text-sky-ink/50">
              No mistakes logged yet.{' '}
              <Link href="/app/journal" className="font-semibold text-sky-deep hover:underline">
                Add them on trades
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {insights.topMistakes.map((m) => (
                <li
                  key={m.text}
                  className="flex items-center justify-between rounded-xl bg-sky-soft/70 px-3 py-2.5 text-sm"
                >
                  <span className="text-sky-ink/80">{m.text}</span>
                  <span className="text-[11px] font-semibold text-sky-ink/40">{m.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Risky emotions */}
        <section className="rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-sky-ink">Emotion watchlist</h2>
          <p className="mt-0.5 text-[12px] text-sky-ink/45">FOMO, Fear, Revenge, Excited</p>
          {insights.riskyEmotions.length === 0 ? (
            <p className="mt-4 text-sm text-sky-ink/50">
              No risky emotions on closed trades yet. Keep tagging emotions in the journal.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {insights.riskyEmotions.map((e) => (
                <li
                  key={e.name}
                  className="flex items-center justify-between rounded-xl bg-sky-soft/70 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-sky-ink">
                    {e.name}
                    <span className="ml-2 text-[11px] font-normal text-sky-ink/40">{e.count} trades</span>
                  </span>
                  <span
                    className={`font-semibold ${
                      e.pnl < 0 ? 'text-rose-500' : e.pnl > 0 ? 'text-emerald-600' : 'text-sky-ink'
                    }`}
                  >
                    {e.pnl >= 0 ? '+' : ''}
                    {e.pnl.toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Past reviews */}
      <section className="mt-4 rounded-2xl border border-[#cfe0ee]/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-sky-ink">Review history</h2>
            <p className="mt-0.5 text-[12px] text-sky-ink/45">Daily, weekly, and monthly check-ins</p>
          </div>
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as ReviewType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => openForm(t)}
                className="rounded-lg border border-[#cfe0ee] px-3 py-1.5 text-xs font-semibold capitalize text-sky-ink/70 hover:bg-sky-soft"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>

        {reviews.length === 0 ? (
          <p className="mt-6 text-center text-sm text-sky-ink/50">
            No reviews yet. Write a short daily review after market close.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[#e8f2fa] bg-sky-soft/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                      {r.type} · {r.date}
                    </p>
                    <p className="mt-1 text-sm text-sky-ink">
                      Mood: <strong>{MOOD_LABELS[r.mood - 1] || 'Okay'}</strong>
                      {' · '}
                      Rules: {r.followedRules ? 'Followed' : 'Broke some'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this review?')) deleteReview(r.id);
                    }}
                    className="rounded-lg p-2 text-sky-ink/35 hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {r.whatWentWell && (
                  <p className="mt-2 text-sm text-sky-ink/70">
                    <span className="font-semibold text-emerald-700">Went well: </span>
                    {r.whatWentWell}
                  </p>
                )}
                {r.whatToImprove && (
                  <p className="mt-1 text-sm text-sky-ink/70">
                    <span className="font-semibold text-amber-700">Improve: </span>
                    {r.whatToImprove}
                  </p>
                )}
                {r.notes && <p className="mt-1 text-sm text-sky-ink/55">{r.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6">
        <BackToLink
          fallback="/app/journal"
          label="Back to Trade Journal"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-deep hover:underline"
        />
      </div>

      {/* Review form drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0c3d5c]/25 backdrop-blur-[2px]">
          <button type="button" aria-label="Close" className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8f2fa] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-mid">
                  New review
                </p>
                <h2 className="font-display text-lg font-semibold capitalize text-sky-ink">
                  {form.type} check-in
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-sky-ink/50 hover:bg-sky-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Type
                </span>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ReviewType })}
                  className={inputClass}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Date
                </span>
                <input
                  type="date"
                  value={form.date}
                  max={maxDate()}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className={inputClass}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Mood ({MOOD_LABELS[form.mood - 1]})
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.mood}
                  onChange={(e) => setForm({ ...form, mood: Number(e.target.value) })}
                  className="w-full accent-sky-deep"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#cfe0ee] px-3 py-3">
                <input
                  type="checkbox"
                  checked={form.followedRules}
                  onChange={(e) => setForm({ ...form, followedRules: e.target.checked })}
                  className="h-4 w-4 rounded border-[#cfe0ee] text-sky-deep"
                />
                <span className="text-sm font-medium text-sky-ink">I followed my trading rules</span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  What went well
                </span>
                <textarea
                  value={form.whatWentWell}
                  onChange={(e) => setForm({ ...form, whatWentWell: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Waited for setup, cut loss early…"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  What to improve
                </span>
                <textarea
                  value={form.whatToImprove}
                  onChange={(e) => setForm({ ...form, whatToImprove: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Entered too early, oversized…"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-ink/45">
                  Extra notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-[#cfe0ee] py-2.5 text-sm font-semibold text-sky-ink/70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-sky-deep py-2.5 text-sm font-semibold text-white hover:bg-sky-ink"
                >
                  Save review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#cfe0ee]/90 bg-white px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-ink/40">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold text-sky-ink">{value}</p>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[#cfe0ee] bg-white px-3 py-2.5 text-sm text-sky-ink outline-none ring-sky-mid/30 placeholder:text-sky-ink/35 focus:ring-2';
