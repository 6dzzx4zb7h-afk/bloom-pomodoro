import { dayKeyFor } from './dayKey';
import type { Goal } from './goals';

export type GoalCreditSource = 'manual' | 'session' | 'carryover';

export interface GoalCredit {
  id: string;
  goalId: Goal['id'];
  delta: number;
  source: GoalCreditSource;
  sessionId?: string;
  dayKey: string;
  at: number;
}

export const GOAL_LEDGER_CAP = 1000;
export const GOAL_LEDGER_DETAIL_DAYS = 84;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: GoalCreditSource[] = ['manual', 'session', 'carryover'];
let creditIdCounter = 0;

export function newGoalCreditId(now = Date.now()): string {
  creditIdCounter = (creditIdCounter + 1) % 1000;
  return `g-${now.toString(36)}-${creditIdCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isGoalCredit(raw: unknown): raw is GoalCredit {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.goalId === 'number' &&
    Number.isFinite(row.goalId) &&
    typeof row.delta === 'number' &&
    Number.isInteger(row.delta) &&
    row.delta !== 0 &&
    SOURCES.includes(row.source as GoalCreditSource) &&
    (row.sessionId === undefined || typeof row.sessionId === 'string') &&
    typeof row.dayKey === 'string' &&
    DAY_KEY_RE.test(row.dayKey) &&
    typeof row.at === 'number' &&
    Number.isFinite(row.at)
  );
}

export function goalCreditTotal(
  ledger: readonly GoalCredit[],
  goalId: Goal['id'],
): number {
  return ledger.reduce(
    (sum, row) => (row.goalId === goalId ? sum + row.delta : sum),
    0,
  );
}

export function deriveGoalsFromLedger(
  goals: readonly Goal[],
  ledger: readonly GoalCredit[],
): Goal[] {
  return goals.map((goal) => ({
    ...goal,
    done: clamp(goalCreditTotal(ledger, goal.id), 0, goal.target),
    completedAt:
      clamp(goalCreditTotal(ledger, goal.id), 0, goal.target) >= goal.target
        ? goal.completedAt
        : undefined,
  }));
}

export interface SanitizedGoalLedger {
  ledger: GoalCredit[];
  goals: Goal[];
}

export function sanitizeGoalLedger(
  raw: unknown,
  goals: readonly Goal[],
): SanitizedGoalLedger {
  const goalIds = new Set(goals.map((goal) => goal.id));
  const ledger = Array.isArray(raw)
    ? raw.filter(
        (row): row is GoalCredit =>
          isGoalCredit(row) && goalIds.has(row.goalId),
      )
    : [];
  return { ledger, goals: deriveGoalsFromLedger(goals, ledger) };
}

export interface AppendGoalCreditOptions {
  goalId: Goal['id'];
  requestedDelta: number;
  source: Exclude<GoalCreditSource, 'carryover'>;
  at?: number;
  dayStartHour?: number;
  sessionId?: string;
}

export interface AppendGoalCreditResult {
  ledger: GoalCredit[];
  goals: Goal[];
  appliedDelta: number;
  credit?: GoalCredit;
}

export function appendGoalCredit(
  ledger: readonly GoalCredit[],
  goals: readonly Goal[],
  options: AppendGoalCreditOptions,
): AppendGoalCreditResult {
  const goal = goals.find((candidate) => candidate.id === options.goalId);
  if (!goal || !Number.isInteger(options.requestedDelta)) {
    return { ledger: [...ledger], goals: [...goals], appliedDelta: 0 };
  }

  const current = clamp(goalCreditTotal(ledger, goal.id), 0, goal.target);
  const next = clamp(current + options.requestedDelta, 0, goal.target);
  const appliedDelta = next - current;
  if (appliedDelta === 0) {
    return { ledger: [...ledger], goals: deriveGoalsFromLedger(goals, ledger), appliedDelta };
  }

  const at = options.at ?? Date.now();
  const credit: GoalCredit = {
    id: newGoalCreditId(at),
    goalId: goal.id,
    delta: appliedDelta,
    source: options.source,
    sessionId: options.sessionId,
    dayKey: dayKeyFor(at, options.dayStartHour),
    at,
  };
  const nextLedger = compactGoalLedger([...ledger, credit], at);
  const derivedGoals = deriveGoalsFromLedger(goals, nextLedger).map((candidate) =>
    candidate.id === goal.id
      ? {
          ...candidate,
          completedAt:
            candidate.done >= candidate.target
              ? (candidate.completedAt ?? at)
              : undefined,
        }
      : candidate,
  );
  return {
    ledger: nextLedger,
    goals: derivedGoals,
    appliedDelta,
    credit,
  };
}

function cutoffDayKey(now: number): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - GOAL_LEDGER_DETAIL_DAYS);
  return dayKeyFor(cutoff.getTime());
}

/**
 * Collapse only entries outside the retained detail window. Recent rows are
 * never dropped, even when that means the soft cap yields.
 */
export function compactGoalLedger(
  ledger: readonly GoalCredit[],
  now = Date.now(),
): GoalCredit[] {
  if (ledger.length <= GOAL_LEDGER_CAP) return [...ledger];
  const cutoff = cutoffDayKey(now);
  const recent = ledger.filter((row) => row.dayKey >= cutoff);
  const old = ledger.filter((row) => row.dayKey < cutoff);
  if (old.length === 0) return [...ledger];

  const sums = new Map<Goal['id'], number>();
  for (const row of old) sums.set(row.goalId, (sums.get(row.goalId) ?? 0) + row.delta);
  const baselines: GoalCredit[] = [];
  for (const [goalId, delta] of sums) {
    if (delta === 0) continue;
    const rows = old.filter((row) => row.goalId === goalId);
    const oldest = rows.reduce((a, b) => (a.at <= b.at ? a : b));
    baselines.push({
      id: newGoalCreditId(oldest.at),
      goalId,
      delta,
      source: 'carryover',
      dayKey: oldest.dayKey,
      at: oldest.at,
    });
  }
  return [...baselines, ...recent].sort((a, b) => a.at - b.at);
}

export function removeGoalCredits(
  ledger: readonly GoalCredit[],
  goalId: Goal['id'],
): GoalCredit[] {
  return ledger.filter((row) => row.goalId !== goalId);
}

export function medianSessionCredit(
  ledger: readonly GoalCredit[],
  goalId: Goal['id'],
  now = Date.now(),
  windowDays = 28,
): number | null {
  const floor = now - windowDays * 86_400_000;
  const bySession = new Map<string, number>();
  for (const row of ledger) {
    if (
      row.goalId !== goalId ||
      row.source !== 'session' ||
      row.delta <= 0 ||
      row.at < floor ||
      row.at > now
    ) {
      continue;
    }
    const key = row.sessionId ?? row.id;
    bySession.set(key, (bySession.get(key) ?? 0) + row.delta);
  }
  const values = [...bySession.values()].sort((a, b) => a - b);
  if (values.length < 3) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}
