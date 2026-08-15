/**
 * Daily target / day-plan data model (PLAN 9.6 + PLAN 10.3).
 *
 * PLAN 10.3 extends the original single target instead of forking it: each
 * study day may keep one task-linked 9.6 target plus at most three goal-linked
 * targets. Goal actuals are always derived from the signed goal ledger.
 * Task actuals remain derived by their owning session selector and are passed
 * into the pure helpers as a callback; this module never persists an actual.
 */

import { dayKeyFor } from './dayKey';
import type { GoalCredit } from './goalLedger';
import { goalPaceForStudyDay, goalUnit, type Goal } from './goals';
import { daysBetween } from './streak';

export const DAY_PLAN_CAP = 3;
export const DAILY_TARGET_DETAIL_DAYS = 84;
export const DAILY_TARGET_AMOUNT_MAX = 99;
export const DAILY_TARGET_TITLE_MAX = 80;
export const DAILY_TARGET_UNIT_MAX = 16;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyTargetSnapshot {
  readonly title: string;
  readonly unit: string;
}

interface DailyTargetBase {
  id: string;
  dayKey: string;
  plannedAmount: number;
  snapshot: DailyTargetSnapshot;
  createdAt: number;
  carriedFromDayKey?: string;
}

export interface GoalDailyTarget extends DailyTargetBase {
  goalId: Goal['id'];
  taskId?: never;
}

export interface TaskDailyTarget extends DailyTargetBase {
  taskId: number;
  goalId?: never;
}

export type DailyTarget = GoalDailyTarget | TaskDailyTarget;

export interface WeeklyPair {
  weekKey: string;
  plannedSum: number;
  actualSum: number;
}

export interface DayPlanState {
  targets: DailyTarget[];
  archive: WeeklyPair[];
}

export const EMPTY_DAY_PLAN: DayPlanState = { targets: [], archive: [] };

export interface TaskTargetSource {
  id: number;
  t: string;
  unit?: string;
}

export type TaskTargetActual = (target: TaskDailyTarget) => number;

export interface RolloverOffer {
  target: DailyTarget;
  actual: number;
  remainder: number;
}

export interface SpreadTargetDraft {
  goalId: Goal['id'];
  dayKey: string;
  plannedAmount: number;
}

let targetCounter = 0;

export function newDailyTargetId(now = Date.now()): string {
  targetCounter = (targetCounter + 1) % 1000;
  return `dt-${now.toString(36)}-${targetCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function isDailyTargetDayKey(raw: unknown): raw is string {
  return typeof raw === 'string' && DAY_KEY.test(raw);
}

export function isGoalDailyTarget(target: DailyTarget): target is GoalDailyTarget {
  return 'goalId' in target;
}

export function isTaskDailyTarget(target: DailyTarget): target is TaskDailyTarget {
  return 'taskId' in target;
}

function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, DAILY_TARGET_TITLE_MAX);
}

function normalizeUnit(raw: unknown): string {
  if (typeof raw !== 'string') return 'parts';
  return raw.trim().replace(/\s+/g, ' ').slice(0, DAILY_TARGET_UNIT_MAX) || 'parts';
}

function frozenSnapshot(title: unknown, unit: unknown): DailyTargetSnapshot | null {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return null;
  return Object.freeze({
    title: normalizedTitle,
    unit: normalizeUnit(unit),
  });
}

function amount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < 1 || rounded > DAILY_TARGET_AMOUNT_MAX) return null;
  return rounded;
}

/**
 * Strict entry validation shared by the goal and task target forms. A daily
 * plan is user-chosen, so blank, fractional, or out-of-range input stays in
 * the form for correction instead of being silently rewritten to one part.
 */
export function parseDailyTargetAmount(
  raw: string | number,
  maximum = DAILY_TARGET_AMOUNT_MAX,
): number | null {
  const normalizedMaximum = Math.min(
    DAILY_TARGET_AMOUNT_MAX,
    Math.max(1, Math.floor(maximum)),
  );
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > normalizedMaximum) {
    return null;
  }
  return value;
}

function validLinkId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0;
}

function sanitizeTarget(raw: unknown): DailyTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<DailyTarget> & {
    goalId?: unknown;
    taskId?: unknown;
  };
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    !isDailyTargetDayKey(value.dayKey) ||
    amount(value.plannedAmount) === null ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    (value.carriedFromDayKey !== undefined &&
      !isDailyTargetDayKey(value.carriedFromDayKey))
  ) return null;
  const snapshot = frozenSnapshot(value.snapshot?.title, value.snapshot?.unit);
  if (!snapshot) return null;
  const hasGoal = validLinkId(value.goalId);
  const hasTask = validLinkId(value.taskId);
  if (hasGoal === hasTask) return null;

  const base: DailyTargetBase = {
    id: value.id,
    dayKey: value.dayKey,
    plannedAmount: amount(value.plannedAmount)!,
    snapshot,
    createdAt: value.createdAt,
    ...(value.carriedFromDayKey
      ? { carriedFromDayKey: value.carriedFromDayKey }
      : {}),
  };
  return hasGoal
    ? { ...base, goalId: value.goalId as number }
    : { ...base, taskId: value.taskId as number };
}

export function sanitizeDailyTargets(raw: unknown): DailyTarget[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, DailyTarget>();
  for (const item of raw) {
    const target = sanitizeTarget(item);
    if (!target) continue;
    const current = byId.get(target.id);
    if (!current || target.createdAt > current.createdAt) byId.set(target.id, target);
  }

  const kept: DailyTarget[] = [];
  const goalCountByDay = new Map<string, number>();
  const taskDaySeen = new Set<string>();
  for (const target of [...byId.values()].sort(
    (a, b) =>
      a.dayKey.localeCompare(b.dayKey) ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id),
  )) {
    if (isGoalDailyTarget(target)) {
      const count = goalCountByDay.get(target.dayKey) ?? 0;
      if (count >= DAY_PLAN_CAP) continue;
      if (
        kept.some(
          (other) =>
            isGoalDailyTarget(other) &&
            other.dayKey === target.dayKey &&
            other.goalId === target.goalId,
        )
      ) continue;
      goalCountByDay.set(target.dayKey, count + 1);
      kept.push(target);
      continue;
    }
    if (taskDaySeen.has(target.dayKey)) continue;
    taskDaySeen.add(target.dayKey);
    kept.push(target);
  }
  return kept;
}

export function sanitizeDailyTargetArchive(raw: unknown): WeeklyPair[] {
  if (!Array.isArray(raw)) return [];
  const byWeek = new Map<string, WeeklyPair>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Partial<WeeklyPair>;
    if (
      !isDailyTargetDayKey(value.weekKey) ||
      typeof value.plannedSum !== 'number' ||
      !Number.isInteger(value.plannedSum) ||
      value.plannedSum < 0 ||
      typeof value.actualSum !== 'number' ||
      !Number.isInteger(value.actualSum) ||
      value.actualSum < 0
    ) continue;
    const pair = {
      weekKey: value.weekKey,
      plannedSum: value.plannedSum,
      actualSum: Math.min(value.actualSum, value.plannedSum),
    };
    const current = byWeek.get(pair.weekKey);
    if (!current || pair.plannedSum > current.plannedSum) byWeek.set(pair.weekKey, pair);
  }
  return [...byWeek.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

export function sanitizeDayPlan(raw: unknown): DayPlanState {
  if (!raw || typeof raw !== 'object') return { targets: [], archive: [] };
  const value = raw as Partial<DayPlanState>;
  return {
    targets: sanitizeDailyTargets(value.targets),
    archive: sanitizeDailyTargetArchive(value.archive),
  };
}

/**
 * Pure migration seam for the 9.6 → 10.3 shape change. The prior single
 * target is lifted whole; validation belongs to the normal load sanitizer.
 */
export function liftLegacyDailyTarget(raw: unknown): unknown[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function targetDay(
  targetAt: number,
  now: number,
  dayStartHour: number,
): { dayKey: string; todayKey: string } | null {
  if (!Number.isFinite(targetAt) || !Number.isFinite(now)) return null;
  return {
    dayKey: dayKeyFor(targetAt, dayStartHour),
    todayKey: dayKeyFor(now, dayStartHour),
  };
}

export function addGoalDailyTarget(
  state: DayPlanState,
  input: {
    goal: Goal;
    plannedAmount: number;
    targetAt: number;
    now?: number;
    dayStartHour?: number;
    carriedFromAt?: number;
  },
): DayPlanState {
  const now = input.now ?? Date.now();
  const day = targetDay(input.targetAt, now, input.dayStartHour ?? 0);
  if (
    !day ||
    !validLinkId(input.goal.id) ||
    !isDailyTargetDayKey(input.goal.due) ||
    day.dayKey < day.todayKey ||
    day.dayKey > input.goal.due ||
    (input.carriedFromAt !== undefined && !Number.isFinite(input.carriedFromAt))
  ) return state;
  const sameDay = state.targets.filter(
    (target) => isGoalDailyTarget(target) && target.dayKey === day.dayKey,
  );
  if (
    sameDay.length >= DAY_PLAN_CAP ||
    sameDay.some((target) => target.goalId === input.goal.id)
  ) return state;
  const remaining = Math.max(0, input.goal.target - input.goal.done);
  if (remaining < 1 || !Number.isFinite(input.plannedAmount)) return state;
  const plannedAmount = Math.min(
    DAILY_TARGET_AMOUNT_MAX,
    remaining,
    Math.max(1, Math.round(input.plannedAmount)),
  );
  const snapshot = frozenSnapshot(input.goal.title, goalUnit(input.goal));
  if (!snapshot) return state;
  const carriedFromDayKey =
    input.carriedFromAt === undefined
      ? undefined
      : dayKeyFor(input.carriedFromAt, input.dayStartHour);
  const target: GoalDailyTarget = {
    id: newDailyTargetId(now),
    dayKey: day.dayKey,
    goalId: input.goal.id,
    plannedAmount,
    snapshot,
    createdAt: now,
    ...(carriedFromDayKey ? { carriedFromDayKey } : {}),
  };
  return { ...state, targets: [...state.targets, target] };
}

export function addTaskDailyTarget(
  state: DayPlanState,
  input: {
    task: TaskTargetSource;
    plannedAmount: number;
    targetAt: number;
    now?: number;
    dayStartHour?: number;
  },
): DayPlanState {
  const now = input.now ?? Date.now();
  const day = targetDay(input.targetAt, now, input.dayStartHour ?? 0);
  if (
    !day ||
    !validLinkId(input.task.id) ||
    day.dayKey !== day.todayKey ||
    state.targets.some(
      (target) => isTaskDailyTarget(target) && target.dayKey === day.dayKey,
    ) ||
    !Number.isFinite(input.plannedAmount)
  ) return state;
  const snapshot = frozenSnapshot(input.task.t, input.task.unit);
  if (!snapshot) return state;
  const target: TaskDailyTarget = {
    id: newDailyTargetId(now),
    dayKey: day.dayKey,
    taskId: input.task.id,
    plannedAmount: Math.min(
      DAILY_TARGET_AMOUNT_MAX,
      Math.max(1, Math.round(input.plannedAmount)),
    ),
    snapshot,
    createdAt: now,
  };
  return { ...state, targets: [...state.targets, target] };
}

export function targetActual(
  target: DailyTarget,
  ledger: readonly GoalCredit[],
  taskActual?: TaskTargetActual,
): number {
  const raw = isGoalDailyTarget(target)
    ? ledger.reduce(
        (sum, row) =>
          row.goalId === target.goalId && row.dayKey === target.dayKey
            ? sum + row.delta
            : sum,
        0,
      )
    : taskActual?.(target) ?? 0;
  const finite = Number.isFinite(raw) ? Math.round(raw) : 0;
  return Math.max(0, Math.min(target.plannedAmount, finite));
}

export function editDailyTarget(
  state: DayPlanState,
  input: {
    id: string;
    plannedAmount: number;
    ledger: readonly GoalCredit[];
    now?: number;
    dayStartHour?: number;
    taskActual?: TaskTargetActual;
  },
): DayPlanState {
  const todayKey = dayKeyFor(input.now ?? Date.now(), input.dayStartHour);
  const target = state.targets.find((item) => item.id === input.id);
  if (
    !target ||
    target.dayKey !== todayKey ||
    !Number.isFinite(input.plannedAmount)
  ) return state;
  const requested = Math.min(
    DAILY_TARGET_AMOUNT_MAX,
    Math.max(1, Math.round(input.plannedAmount)),
  );
  const plannedAmount = Math.max(
    requested,
    targetActual(target, input.ledger, input.taskActual),
  );
  if (plannedAmount === target.plannedAmount) return state;
  return {
    ...state,
    targets: state.targets.map((item) =>
      item.id === input.id ? { ...item, plannedAmount } : item,
    ),
  };
}

export function dismissDailyTarget(state: DayPlanState, id: string): DayPlanState {
  if (!state.targets.some((target) => target.id === id)) return state;
  return { ...state, targets: state.targets.filter((target) => target.id !== id) };
}

/** Monday study-day key for already-resolved day-key arithmetic. */
export function weekKeyForDailyTarget(dayKey: string): string | null {
  if (!isDailyTargetDayKey(dayKey)) return null;
  const date = new Date(`${dayKey}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function compactDailyTargets(
  state: DayPlanState,
  ledger: readonly GoalCredit[],
  todayKey: string,
  taskActual?: TaskTargetActual,
): DayPlanState {
  if (!isDailyTargetDayKey(todayKey)) return state;
  const old = state.targets.filter(
    (target) => daysBetween(target.dayKey, todayKey) >= DAILY_TARGET_DETAIL_DAYS,
  );
  if (old.length === 0) return state;
  const byWeek = new Map<string, WeeklyPair>();
  for (const pair of state.archive) byWeek.set(pair.weekKey, { ...pair });
  for (const target of old) {
    const weekKey = weekKeyForDailyTarget(target.dayKey);
    if (!weekKey) continue;
    const pair = byWeek.get(weekKey) ?? { weekKey, plannedSum: 0, actualSum: 0 };
    pair.plannedSum += target.plannedAmount;
    pair.actualSum += targetActual(target, ledger, taskActual);
    byWeek.set(weekKey, pair);
  }
  const oldIds = new Set(old.map((target) => target.id));
  return {
    targets: state.targets.filter((target) => !oldIds.has(target.id)),
    archive: [...byWeek.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
  };
}

/**
 * Return unfinished targets from the immediately preceding study day only.
 * Callers pass the already-resolved store day key, so custom day boundaries
 * never get reinterpreted as midnight here.
 */
export function rolloverOffers(
  state: DayPlanState,
  input: {
    todayKey: string;
    ledger: readonly GoalCredit[];
    goals: readonly Goal[];
    taskActual?: TaskTargetActual;
  },
): RolloverOffer[] {
  if (!isDailyTargetDayKey(input.todayKey)) return [];
  const goals = new Map(input.goals.map((goal) => [goal.id, goal]));
  return state.targets.flatMap((target) => {
    if (daysBetween(target.dayKey, input.todayKey) !== 1) return [];
    if (isGoalDailyTarget(target)) {
      const goal = goals.get(target.goalId);
      // A goal whose date has passed belongs to the goal-date decision, not a
      // second daily-plan prompt.
      if (!goal || goal.due < input.todayKey || goal.done >= goal.target) return [];
    }
    const actual = targetActual(target, input.ledger, input.taskActual);
    const remainder = target.plannedAmount - actual;
    return remainder > 0 ? [{ target, actual, remainder }] : [];
  });
}

/** Carry one remainder into today while leaving yesterday's pair untouched. */
export function carryRolloverTarget(
  state: DayPlanState,
  input: {
    offer: RolloverOffer;
    todayKey: string;
    goals: readonly Goal[];
    now?: number;
  },
): DayPlanState {
  if (
    !isDailyTargetDayKey(input.todayKey) ||
    daysBetween(input.offer.target.dayKey, input.todayKey) !== 1 ||
    input.offer.remainder < 1
  ) return state;
  const source = input.offer.target;
  const snapshot = Object.freeze({ ...source.snapshot });
  const createdAt = input.now ?? Date.now();

  if (isGoalDailyTarget(source)) {
    const goal = input.goals.find((item) => item.id === source.goalId);
    const sameDay = state.targets.filter(
      (target) => isGoalDailyTarget(target) && target.dayKey === input.todayKey,
    );
    const remaining = goal ? Math.max(0, goal.target - goal.done) : 0;
    if (
      !goal ||
      goal.due < input.todayKey ||
      remaining < 1 ||
      sameDay.length >= DAY_PLAN_CAP ||
      sameDay.some((target) => target.goalId === source.goalId)
    ) return state;
    const target: GoalDailyTarget = {
      id: newDailyTargetId(createdAt),
      dayKey: input.todayKey,
      goalId: source.goalId,
      plannedAmount: Math.min(input.offer.remainder, remaining, DAILY_TARGET_AMOUNT_MAX),
      snapshot,
      createdAt,
      carriedFromDayKey: source.dayKey,
    };
    return { ...state, targets: [...state.targets, target] };
  }

  if (
    state.targets.some(
      (target) => isTaskDailyTarget(target) && target.dayKey === input.todayKey,
    )
  ) return state;
  const target: TaskDailyTarget = {
    id: newDailyTargetId(createdAt),
    dayKey: input.todayKey,
    taskId: source.taskId,
    plannedAmount: Math.min(input.offer.remainder, DAILY_TARGET_AMOUNT_MAX),
    snapshot,
    createdAt,
    carriedFromDayKey: source.dayKey,
  };
  return { ...state, targets: [...state.targets, target] };
}

/**
 * Prepare the existing 10.4 confirmation flow with recomputed pace. This is
 * deliberately a draft: no target is written until the user confirms.
 */
export function spreadRolloverTarget(
  offer: RolloverOffer,
  goal: Goal | undefined,
  todayKey: string,
  now = Date.now(),
): SpreadTargetDraft | null {
  if (
    !goal ||
    !isGoalDailyTarget(offer.target) ||
    offer.target.goalId !== goal.id ||
    !isDailyTargetDayKey(todayKey) ||
    daysBetween(offer.target.dayKey, todayKey) !== 1
  ) return null;
  const pace = goalPaceForStudyDay(goal, todayKey, now);
  if (pace.status !== 'active' || pace.remaining < 1) return null;
  return {
    goalId: goal.id,
    dayKey: todayKey,
    plannedAmount: Math.min(
      DAILY_TARGET_AMOUNT_MAX,
      pace.remaining,
      Math.max(1, Math.ceil(pace.perDay)),
    ),
  };
}

/** Choosing rest is intentionally a byte-for-byte history-preserving no-op. */
export function letRolloverRest(state: DayPlanState): DayPlanState {
  return state;
}
