import { dayKeyFor } from '../store/dayKey';
import { goalUnit, type Goal } from '../store/goals';
import type { GoalCredit } from '../store/goalLedger';
import {
  targetActual,
  type DayPlanState,
  type TaskDailyTarget,
} from '../store/dailyTarget';
import {
  sessionCountsTowardDay,
  type SessionRecord,
} from '../store/sessions';
import { weekKeyForStudyDay } from './weekly';

const WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

export interface ObservedLanding {
  activeDays: number;
  amountPerActiveDay: number;
  projectedAt: number;
  projectedDayKey: string;
}

export interface WeeklyPlanCalibration {
  activeDays: number;
  sessionCount: number;
  planned: number;
  actual: number;
  carriedPlanned: number;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * A descriptive projection from recorded positive credits. Carryover rows are
 * deliberately excluded because they preserve totals, not dated behavior.
 */
export function observedLanding(
  ledger: readonly GoalCredit[],
  goal: Goal,
  now = Date.now(),
  dayStartHour = 0,
): ObservedLanding | null {
  const remaining = Math.max(0, goal.target - goal.done);
  if (remaining === 0) return null;
  const floor = now - WINDOW_DAYS * DAY_MS;
  const byDay = new Map<string, number>();
  for (const row of ledger) {
    if (
      row.goalId !== goal.id ||
      row.source === 'carryover' ||
      row.delta <= 0 ||
      row.at < floor ||
      row.at > now
    ) {
      continue;
    }
    byDay.set(row.dayKey, (byDay.get(row.dayKey) ?? 0) + row.delta);
  }
  const daily = [...byDay.values()].filter((amount) => amount > 0);
  if (daily.length < 3) return null;
  const amountPerActiveDay =
    daily.reduce((sum, amount) => sum + amount, 0) / daily.length;
  const daysNeeded = Math.ceil(remaining / amountPerActiveDay);
  const projected = new Date(now);
  projected.setDate(projected.getDate() + daysNeeded);
  const projectedAt = projected.getTime();
  return {
    activeDays: daily.length,
    amountPerActiveDay,
    projectedAt,
    projectedDayKey: dayKeyFor(projectedAt, dayStartHour),
  };
}

/** One neutral, basis-stated line; callers render it instead of calendar pace. */
export function observedLandingLine(result: ObservedLanding, goal: Goal): string {
  const projected = new Date(result.projectedAt);
  const date = `${MONTHS_SHORT[projected.getMonth()]} ${projected.getDate()}`;
  const amount = Math.max(1, Math.round(result.amountPerActiveDay));
  const base =
    `At the pace you’ve recorded (about ${amount} ${goalUnit(goal)} a day), ` +
    `this lands around ${date}.`;
  return result.projectedDayKey > goal.due
    ? `${base} Based on your pace so far, this might land after its date. Shrink it, or move the date?`
    : base;
}

/** Copy helper for the future day-plan amount field; silent without evidence. */
export function sessionEffortLine(
  amount: number,
  unit: string,
  medianAmountPerSession: number | null,
): string | null {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    medianAmountPerSession == null ||
    !Number.isFinite(medianAmountPerSession) ||
    medianAmountPerSession <= 0
  ) {
    return null;
  }
  const sessions = Math.max(1, Math.round(amount / medianAmountPerSession));
  return (
    `From your recorded goal credits, ${Math.round(amount)} ${unit} is about ` +
    `${sessions} of your usual sessions.`
  );
}

function previousWeekKey(studyDay: string): string {
  const current = weekKeyForStudyDay(studyDay);
  const [year, month, day] = current.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - 7);
  return dayKeyFor(date.getTime());
}

/**
 * Last week's plan mirror. Both guards matter: target rows show that planning
 * happened on three distinct days, while completed records show that the week
 * contains enough session evidence to discuss.
 */
export function weeklyPlanCalibration(
  dayPlan: DayPlanState,
  ledger: readonly GoalCredit[],
  records: readonly SessionRecord[],
  studyDay: string,
  dayStartHour = 0,
): WeeklyPlanCalibration | null {
  const currentWeek = weekKeyForStudyDay(studyDay);
  const lastWeek = previousWeekKey(studyDay);
  const targets = dayPlan.targets.filter(
    (target) => target.dayKey >= lastWeek && target.dayKey < currentWeek,
  );
  const activeDays = new Set(targets.map((target) => target.dayKey)).size;
  if (activeDays < 3) return null;
  const sessionCount = records.filter((record) => {
    if (!sessionCountsTowardDay(record)) return false;
    const dayKey = dayKeyFor(record.endedAt, dayStartHour);
    return dayKey >= lastWeek && dayKey < currentWeek;
  }).length;
  if (sessionCount < 3) return null;
  const taskActual = (target: TaskDailyTarget) =>
    records.filter(
      (record) =>
        record.taskId === target.taskId &&
        sessionCountsTowardDay(record) &&
        dayKeyFor(record.endedAt, dayStartHour) === target.dayKey,
    ).length;
  return {
    activeDays,
    sessionCount,
    planned: targets.reduce((sum, target) => sum + target.plannedAmount, 0),
    actual: targets.reduce(
      (sum, target) => sum + targetActual(target, ledger, taskActual),
      0,
    ),
    carriedPlanned: targets.reduce(
      (sum, target) => sum + (target.carriedFromDayKey ? target.plannedAmount : 0),
      0,
    ),
  };
}

export function weeklyPlanCalibrationLine(
  calibration: WeeklyPlanCalibration,
): string {
  const base =
    calibration.actual === calibration.planned
      ? `You planned ${calibration.planned} and recorded ${calibration.actual} across ${calibration.activeDays} days — that shape matched your week.`
      : `You planned ${calibration.planned} and recorded ${calibration.actual} across ${calibration.activeDays} days — planning ${calibration.actual} might feel better.`;
  return calibration.carriedPlanned > 0
    ? `${base} ${calibration.carriedPlanned} of the planned parts were carried in.`
    : base;
}
