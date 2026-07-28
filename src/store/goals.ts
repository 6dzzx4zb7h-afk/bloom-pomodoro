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
import { daysBetween } from './streak';

export interface Goal {
  id: number;
  title: string;
  /** Deadline as YYYY-MM-DD (local). */
  due: string;
  /** Total parts the work splits into (lectures, chapters, problem sets…). */
  target: number;
  /** Parts finished so far. */
  done: number;
  /** Optional user-defined counting word. Missing values render as "parts". */
  unit?: string;
  /** Epoch ms when the goal was added — anchors the observed pace. */
  createdAt: number;
  /** Epoch ms when `done` last reached `target`; cleared if it drops back (v19). */
  completedAt?: number;
}

export type GoalDeadlineOutcome = 'before' | 'on' | 'after' | 'unknown';

export const GOAL_TARGET_MAX = 500;
export const GOAL_UNIT_MAX = 16;

export function normalizeGoalUnit(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const unit = raw.trim().slice(0, GOAL_UNIT_MAX);
  return unit || undefined;
}

export function goalUnit(goal: Pick<Goal, 'unit'>): string {
  return normalizeGoalUnit(goal.unit) ?? 'parts';
}

export function goalProgressText(
  goal: Pick<Goal, 'done' | 'target' | 'unit'>,
): string {
  return `${goal.done} of ${goal.target} ${goalUnit(goal)}`;
}

/** Parse YYYY-MM-DD as a local date (avoids the UTC shift of `new Date(str)`). */
export function parseDue(due: string): Date {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole calendar days including the due day; 1 = due today, <= 0 = past. */
export function daysLeftForStudyDay(due: string, studyDay: string): number {
  return daysBetween(studyDay, due) + 1;
}

export function daysLeft(due: string, now = Date.now(), dayStartHour = 0): number {
  return daysLeftForStudyDay(due, dayKeyFor(now, dayStartHour));
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
  return goalPaceForStudyDay(goal, dayKeyFor(now, dayStartHour), now);
}

/** Goal math from the store-resolved study day, shared by every planner label. */
export function goalPaceForStudyDay(
  goal: Goal,
  studyDay: string,
  now = Date.now(),
): GoalPace {
  const remaining = Math.max(0, goal.target - goal.done);
  const days = daysLeftForStudyDay(goal.due, studyDay);

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
      suggestion = `due today — ${remaining} to go, if today has room`;
    } else if (perDay <= 6 / 7) {
      const perWeek = Math.max(1, Math.ceil(perDay * 7));
      suggestion = `from the date and amount: about ${perWeek} a week. Want to try that pace?`;
    } else {
      suggestion = `from the date and amount: about ${Math.ceil(perDay)} a day. Want to try that pace?`;
    }
  }

  return { status: 'active', daysLeft: days, remaining, perDay, suggestion };
}

/** Chip copy for a goal card: "done ♡" / "past its date" / "due today" / "12 days". */
export function dueLabel(goal: Goal, now = Date.now(), dayStartHour = 0): string {
  return dueLabelForStudyDay(goal, dayKeyFor(now, dayStartHour));
}

export function dueLabelForStudyDay(goal: Goal, studyDay: string): string {
  if (goal.done >= goal.target) return 'done ♡';
  const days = daysLeftForStudyDay(goal.due, studyDay);
  if (days <= 0) return 'past its date';
  if (days === 1) return 'due today';
  if (days === 2) return 'due tomorrow';
  return `${days} days`;
}

/**
 * Compare a finished goal with its deadline using the same local study-day
 * boundary as the planner. Legacy completions deliberately return `unknown`:
 * a current counter cannot tell us when the work was actually finished.
 */
export function goalDeadlineOutcome(
  goal: Pick<Goal, 'done' | 'target' | 'due' | 'completedAt'>,
  dayStartHour = 0,
): GoalDeadlineOutcome | null {
  if (goal.done < goal.target) return null;
  if (
    typeof goal.completedAt !== 'number' ||
    !Number.isFinite(goal.completedAt) ||
    goal.completedAt < 0
  ) {
    return 'unknown';
  }

  const completedDay = dayKeyFor(goal.completedAt, dayStartHour);
  if (completedDay < goal.due) return 'before';
  if (completedDay > goal.due) return 'after';
  return 'on';
}

/** Warm, neutral card copy backed only by a trustworthy completion timestamp. */
export function goalDeadlineOutcomeLine(
  goal: Pick<Goal, 'done' | 'target' | 'due' | 'completedAt'>,
  dayStartHour = 0,
): string | null {
  const outcome = goalDeadlineOutcome(goal, dayStartHour);
  if (outcome === 'before') return 'Finished before the due date ♡';
  if (outcome === 'on') return 'Finished on the due date ♡';
  if (outcome === 'after') return 'Finished after the due date — the work still counts';
  if (outcome === 'unknown') return 'Finished — the completion date wasn’t recorded';
  return null;
}
