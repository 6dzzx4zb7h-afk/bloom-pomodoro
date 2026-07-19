/**
 * Goals & deadlines — data layer.
 *
 * Types and the pace math for the opt-in planner ("put everything you're
 * working toward in"). No React in here; state lives in useBloom so goals persist with the
 * rest of the app. The guiding rule for suggestions: offer a concrete pace
 * while finishing is realistic, and go quiet (never nag, never fantasize)
 * when it isn't.
 */

import { dayKeyFor } from './dayKey';

export interface Goal {
  id: number;
  title: string;
  /** Deadline as YYYY-MM-DD (local). */
  due: string;
  /** Total parts the work splits into (lectures, chapters, problem sets…). */
  target: number;
  /** Parts finished so far. */
  done: number;
  /** Epoch ms when the goal was added — anchors the observed pace. */
  createdAt: number;
  /** Epoch ms when `done` last reached `target`; cleared if it drops back (v19). */
  completedAt?: number;
}

export const GOAL_TARGET_MAX = 500;

/** Parse YYYY-MM-DD as a local date (avoids the UTC shift of `new Date(str)`). */
export function parseDue(due: string): Date {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole calendar days including the due day; 1 = due today, <= 0 = past. */
export function daysLeft(due: string, now = Date.now(), dayStartHour = 0): number {
  const current = parseDue(dayKeyFor(now, dayStartHour));
  const end = parseDue(due);
  const currentUtc = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - currentUtc) / 86400000) + 1;
}

export type GoalStatus = 'done' | 'overdue' | 'active';

export interface GoalPace {
  status: GoalStatus;
  daysLeft: number;
  remaining: number;
  /** Parts per day needed to land on the deadline (active goals only). */
  perDay: number;
  /** One warm line: the pace that gets you there — or null when it wouldn't help. */
  suggestion: string | null;
}

/**
 * The heart of the planner: where do I stand, and what pace finishes this?
 * Suggestions stay silent for overdue goals and for paces that are clearly
 * out of reach (either absurd in absolute terms, or far beyond the pace the
 * user has actually shown) — a number nobody can hit is noise, not help.
 */
export function goalPace(goal: Goal, now = Date.now(), dayStartHour = 0): GoalPace {
  const remaining = Math.max(0, goal.target - goal.done);
  const days = daysLeft(goal.due, now, dayStartHour);

  if (remaining === 0) {
    return { status: 'done', daysLeft: days, remaining, perDay: 0, suggestion: null };
  }
  if (days <= 0) {
    return { status: 'overdue', daysLeft: days, remaining, perDay: 0, suggestion: null };
  }

  const perDay = remaining / days;

  // Observed pace since the goal was added (needs a little history to mean
  // anything). 4x the shown pace is the line between "stretch" and "fiction".
  const historyDays = (now - goal.createdAt) / 86400000;
  const observed = historyDays >= 3 && goal.done > 0 ? goal.done / historyDays : null;
  const unrealistic = perDay > 20 || (observed != null && perDay > observed * 4 + 1);

  let suggestion: string | null = null;
  if (!unrealistic) {
    if (days === 1) {
      suggestion = `due today — ${remaining} to go, one last push ♡`;
    } else if (perDay <= 6 / 7) {
      const perWeek = Math.max(1, Math.ceil(perDay * 7));
      suggestion = `about ${perWeek} a week gets you there with room to breathe`;
    } else {
      suggestion = `about ${Math.ceil(perDay)} a day and you'll land right on time`;
    }
  }

  return { status: 'active', daysLeft: days, remaining, perDay, suggestion };
}

/** Chip copy for a goal card: "done ♡" / "overdue" / "due today" / "12 days". */
export function dueLabel(goal: Goal, now = Date.now(), dayStartHour = 0): string {
  if (goal.done >= goal.target) return 'done ♡';
  const days = daysLeft(goal.due, now, dayStartHour);
  if (days <= 0) return 'overdue';
  if (days === 1) return 'due today';
  if (days === 2) return 'due tomorrow';
  return `${days} days`;
}

/** Today as YYYY-MM-DD (local) — the min for the date picker. */
export function todayStr(now = new Date()): string {
  return dayKeyFor(now.getTime());
}
