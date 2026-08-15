import { describe, expect, it } from 'vitest';

import {
  DAILY_TARGET_DETAIL_DAYS,
  DAILY_TARGET_TITLE_MAX,
  DAILY_TARGET_UNIT_MAX,
  DAY_PLAN_CAP,
  EMPTY_DAY_PLAN,
  addGoalDailyTarget,
  addTaskDailyTarget,
  compactDailyTargets,
  carryRolloverTarget,
  editDailyTarget,
  isGoalDailyTarget,
  liftLegacyDailyTarget,
  letRolloverRest,
  parseDailyTargetAmount,
  rolloverOffers,
  sanitizeDayPlan,
  sanitizeDailyTargets,
  spreadRolloverTarget,
  targetActual,
  type DayPlanState,
  type GoalDailyTarget,
  type TaskDailyTarget,
} from './dailyTarget';
import type { GoalCredit } from './goalLedger';
import type { Goal } from './goals';

const DAY = 86_400_000;

function at(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function goal(id: number, patch: Partial<Goal> = {}): Goal {
  return {
    id,
    title: `Goal ${id}`,
    due: '2026-08-10',
    target: 20,
    done: 2,
    unit: 'chapters',
    createdAt: at(2026, 7, 1),
    ...patch,
  };
}

function goalTarget(
  id: string,
  goalId: number,
  dayKey: string,
  plannedAmount = 3,
  createdAt = at(2026, 7, 1),
): GoalDailyTarget {
  return {
    id,
    dayKey,
    goalId,
    plannedAmount,
    snapshot: Object.freeze({ title: `Goal ${goalId}`, unit: 'parts' }),
    createdAt,
  };
}

function taskTarget(
  id: string,
  taskId: number,
  dayKey: string,
  plannedAmount = 2,
  createdAt = at(2026, 7, 1),
): TaskDailyTarget {
  return {
    id,
    dayKey,
    taskId,
    plannedAmount,
    snapshot: Object.freeze({ title: `Task ${taskId}`, unit: 'sessions' }),
    createdAt,
  };
}

function credit(
  id: string,
  goalId: number,
  dayKey: string,
  delta: number,
): GoalCredit {
  return {
    id,
    goalId,
    dayKey,
    delta,
    source: 'manual',
    at: at(2026, 7, 1),
  };
}

describe('the reconciled 9.6 + 10.3 day-plan shape', () => {
  it('keeps invalid target entry in the form instead of silently coercing it', () => {
    expect(parseDailyTargetAmount('')).toBeNull();
    expect(parseDailyTargetAmount('1.5')).toBeNull();
    expect(parseDailyTargetAmount('0')).toBeNull();
    expect(parseDailyTargetAmount('4', 3)).toBeNull();
    expect(parseDailyTargetAmount('3', 3)).toBe(3);
  });

  it('keeps one task target alongside three goal-linked targets on the same day', () => {
    const now = at(2026, 7, 26);
    let state = addTaskDailyTarget(EMPTY_DAY_PLAN, {
      task: { id: 9, t: 'Draft the outline', unit: 'sessions' },
      plannedAmount: 1,
      targetAt: now,
      now,
    });
    for (let id = 1; id <= DAY_PLAN_CAP + 1; id++) {
      state = addGoalDailyTarget(state, {
        goal: goal(id),
        plannedAmount: id,
        targetAt: now,
        now,
      });
    }

    expect(state.targets.filter(isGoalDailyTarget)).toHaveLength(DAY_PLAN_CAP);
    expect(state.targets.filter((target) => !isGoalDailyTarget(target))).toHaveLength(1);
    expect(state.targets).toHaveLength(DAY_PLAN_CAP + 1);
  });

  it('allows only one task-linked target per study day', () => {
    const now = at(2026, 7, 26);
    const first = addTaskDailyTarget(EMPTY_DAY_PLAN, {
      task: { id: 1, t: 'First task' },
      plannedAmount: 2,
      targetAt: now,
      now,
    });
    const second = addTaskDailyTarget(first, {
      task: { id: 2, t: 'Second task' },
      plannedAmount: 2,
      targetAt: now,
      now,
    });
    expect(second).toBe(first);
  });

  it('refuses goal targets before today or beyond the goal due day', () => {
    const now = at(2026, 7, 26);
    const source = goal(1, { due: '2026-07-28' });
    expect(
      addGoalDailyTarget(EMPTY_DAY_PLAN, {
        goal: source,
        plannedAmount: 2,
        targetAt: at(2026, 7, 25),
        now,
      }),
    ).toBe(EMPTY_DAY_PLAN);
    expect(
      addGoalDailyTarget(EMPTY_DAY_PLAN, {
        goal: source,
        plannedAmount: 2,
        targetAt: at(2026, 7, 29),
        now,
      }),
    ).toBe(EMPTY_DAY_PLAN);
  });
});

describe('rollover triage planning', () => {
  it('offers only yesterday and uses the derived remainder', () => {
    const yesterday = goalTarget('yesterday', 1, '2026-07-25', 4);
    const older = goalTarget('older', 2, '2026-07-24', 5);
    const complete = goalTarget('complete', 3, '2026-07-25', 2);
    const goals = [goal(1), goal(2), goal(3)];
    const offers = rolloverOffers(
      { targets: [older, yesterday, complete], archive: [] },
      {
        todayKey: '2026-07-26',
        ledger: [
          credit('partial', 1, '2026-07-25', 1),
          credit('finished', 3, '2026-07-25', 2),
        ],
        goals,
      },
    );

    expect(offers).toEqual([{ target: yesterday, actual: 1, remainder: 3 }]);
  });

  it('respects a 03:00-resolved day key and excludes a goal past its date', () => {
    const priorStudyDay = goalTarget('prior', 1, '2026-07-25', 3);
    const expired = goalTarget('expired', 2, '2026-07-25', 3);
    const offers = rolloverOffers(
      { targets: [priorStudyDay, expired], archive: [] },
      {
        // At 02:59 on Jul 27 with a 03:00 boundary, the store resolves today
        // to Jul 26. The selector consumes that one authoritative key.
        todayKey: '2026-07-26',
        ledger: [],
        goals: [goal(1), goal(2, { due: '2026-07-25' })],
      },
    );

    expect(offers.map((offer) => offer.target.id)).toEqual(['prior']);
  });

  it('carries a clamped remainder with the original frozen snapshot', () => {
    const source = goalTarget('source', 1, '2026-07-25', 6);
    const state = { targets: [source], archive: [] };
    const [offer] = rolloverOffers(state, {
      todayKey: '2026-07-26',
      ledger: [credit('one', 1, '2026-07-25', 1)],
      goals: [goal(1, { target: 10, done: 7 })],
    });

    const carried = carryRolloverTarget(state, {
      offer,
      todayKey: '2026-07-26',
      goals: [goal(1, { target: 10, done: 7 })],
      now: at(2026, 7, 26),
    });
    const today = carried.targets[1];

    expect(today).toMatchObject({
      dayKey: '2026-07-26',
      goalId: 1,
      plannedAmount: 3,
      carriedFromDayKey: '2026-07-25',
      snapshot: source.snapshot,
    });
    expect(Object.isFrozen(today.snapshot)).toBe(true);
    expect(state.targets).toEqual([source]);
  });

  it('spreads into a confirmable pace draft and rest preserves history by identity', () => {
    const source = goalTarget('source', 1, '2026-07-25', 5);
    const state = { targets: [source], archive: [] };
    const offer = { target: source, actual: 1, remainder: 4 };
    const sourceGoal = goal(1, {
      due: '2026-07-30',
      target: 10,
      done: 4,
      createdAt: at(2026, 7, 1),
    });

    expect(
      spreadRolloverTarget(offer, sourceGoal, '2026-07-26', at(2026, 7, 26)),
    ).toEqual({ goalId: 1, dayKey: '2026-07-26', plannedAmount: 2 });
    expect(letRolloverRest(state)).toBe(state);
  });
});

describe('frozen target snapshots and load validation', () => {
  it('freezes a bounded snapshot that survives later goal edits or deletion', () => {
    const now = at(2026, 7, 26);
    const source = goal(1, {
      title: `  ${'A'.repeat(DAILY_TARGET_TITLE_MAX + 20)}  `,
      unit: 'u'.repeat(DAILY_TARGET_UNIT_MAX + 5),
    });
    const state = addGoalDailyTarget(EMPTY_DAY_PLAN, {
      goal: source,
      plannedAmount: 999,
      targetAt: now,
      now,
    });
    const target = state.targets[0];
    const snapshot = target.snapshot;
    source.title = 'Renamed later';
    source.unit = 'pages';

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.title).toBe('A'.repeat(DAILY_TARGET_TITLE_MAX));
    expect(snapshot.unit).toBe('u'.repeat(DAILY_TARGET_UNIT_MAX));
    expect(target.plannedAmount).toBe(source.target - source.done);
    expect(state.targets[0].snapshot).toBe(snapshot);
  });

  it('drops invalid days/links and enforces both per-day caps on untrusted blobs', () => {
    const dayKey = '2026-07-26';
    const valid = [
      taskTarget('t-1', 1, dayKey, 1, 1),
      taskTarget('t-2', 2, dayKey, 1, 2),
      goalTarget('g-1', 1, dayKey, 1, 1),
      goalTarget('g-2', 2, dayKey, 1, 2),
      goalTarget('g-3', 3, dayKey, 1, 3),
      goalTarget('g-4', 4, dayKey, 1, 4),
    ];
    const invalid = [
      { ...goalTarget('bad-day', 8, dayKey), dayKey: '26/07/2026' },
      { ...goalTarget('both', 9, dayKey), taskId: 9 },
      { ...goalTarget('bad-carry', 10, dayKey), carriedFromDayKey: 'yesterday' },
    ];

    const sanitized = sanitizeDailyTargets([...valid, ...invalid]);
    expect(sanitized.filter(isGoalDailyTarget)).toHaveLength(DAY_PLAN_CAP);
    expect(sanitized.filter((target) => !isGoalDailyTarget(target))).toHaveLength(1);
    expect(sanitized.map((target) => target.id)).toEqual(['g-1', 't-1', 'g-2', 'g-3']);
    expect(sanitized.every((target) => Object.isFrozen(target.snapshot))).toBe(true);
    expect(sanitizeDayPlan('truncated')).toEqual(EMPTY_DAY_PLAN);
  });

  it('lifts the 9.6 single target into an array without changing its meaning', () => {
    const legacy = taskTarget('legacy', 7, '2026-07-26', 2);
    expect(liftLegacyDailyTarget(legacy)).toEqual([legacy]);
    expect(liftLegacyDailyTarget([legacy])).toEqual([legacy]);
    expect(liftLegacyDailyTarget(null)).toEqual([]);
  });
});

describe('derived actuals and soft editing', () => {
  it('derives a goal target actual from same-goal, same-study-day ledger deltas', () => {
    const target = goalTarget('g-1', 1, '2026-07-26', 3);
    const ledger = [
      credit('a', 1, '2026-07-26', 2),
      credit('b', 1, '2026-07-26', 5),
      credit('c', 1, '2026-07-25', 20),
      credit('d', 2, '2026-07-26', 20),
    ];
    expect(targetActual(target, ledger)).toBe(3);
    expect(targetActual(target, [credit('negative', 1, '2026-07-26', -5)])).toBe(0);
  });

  it('accepts a derived task actual without storing it on the target', () => {
    const target = taskTarget('t-1', 7, '2026-07-26', 2);
    expect(targetActual(target, [], () => 7)).toBe(2);
    expect(target).not.toHaveProperty('actualAmount');
  });

  it('edits only today and soft-clamps a lowered plan to the derived actual', () => {
    const now = at(2026, 7, 26);
    const target = goalTarget('g-1', 1, '2026-07-26', 5);
    const state: DayPlanState = { targets: [target], archive: [] };
    const ledger = [credit('a', 1, '2026-07-26', 3)];

    const edited = editDailyTarget(state, {
      id: target.id,
      plannedAmount: 1,
      ledger,
      now,
    });
    expect(edited.targets[0].plannedAmount).toBe(3);

    const past = { ...target, id: 'past', dayKey: '2026-07-25' };
    const pastState = { targets: [past], archive: [] };
    expect(
      editDailyTarget(pastState, {
        id: past.id,
        plannedAmount: 4,
        ledger: [],
        now,
      }),
    ).toBe(pastState);
  });
});

describe('study-day keys and 84-day weekly compaction', () => {
  it('aligns a boundary-minus-one target with ledger credit on the prior study day', () => {
    const instant = at(2026, 7, 26, 2, 59);
    const state = addGoalDailyTarget(EMPTY_DAY_PLAN, {
      goal: goal(1),
      plannedAmount: 3,
      targetAt: instant,
      now: instant,
      dayStartHour: 3,
    });
    const target = state.targets[0] as GoalDailyTarget;
    const ledger = [credit('boundary', 1, '2026-07-25', 2)];

    expect(target.dayKey).toBe('2026-07-25');
    expect(targetActual(target, ledger)).toBe(2);
  });

  it('compacts targets older than 84 days into weekly pairs without changing either sum', () => {
    const todayKey = '2026-07-26';
    const oldGoal = goalTarget('old-g', 1, '2026-04-01', 4);
    const oldTask = taskTarget('old-t', 7, '2026-04-02', 2);
    const recent = goalTarget(
      'recent',
      1,
      '2026-05-05',
      3,
      at(2026, 5, 5),
    );
    const state: DayPlanState = {
      targets: [oldGoal, oldTask, recent],
      archive: [{ weekKey: '2026-03-30', plannedSum: 1, actualSum: 1 }],
    };
    const ledger = [
      credit('old-credit', 1, '2026-04-01', 3),
      credit('recent-credit', 1, '2026-05-05', 2),
    ];
    const taskActual = (target: TaskDailyTarget) => (target.id === 'old-t' ? 1 : 0);
    const totals = (plan: DayPlanState) => ({
      planned:
        plan.archive.reduce((sum, pair) => sum + pair.plannedSum, 0) +
        plan.targets.reduce((sum, target) => sum + target.plannedAmount, 0),
      actual:
        plan.archive.reduce((sum, pair) => sum + pair.actualSum, 0) +
        plan.targets.reduce(
          (sum, target) => sum + targetActual(target, ledger, taskActual),
          0,
        ),
    });

    const compacted = compactDailyTargets(state, ledger, todayKey, taskActual);

    expect(compacted.targets).toEqual([recent]);
    expect(compacted.archive).toEqual([
      { weekKey: '2026-03-30', plannedSum: 7, actualSum: 5 },
    ]);
    expect(totals(compacted)).toEqual(totals(state));
  });

  it('retains exactly the current 84-day detail window', () => {
    const today = at(2026, 7, 26);
    const retainedDay = new Date(today - (DAILY_TARGET_DETAIL_DAYS - 1) * DAY);
    const compactedDay = new Date(today - DAILY_TARGET_DETAIL_DAYS * DAY);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
    const retained = goalTarget('retained', 1, key(retainedDay));
    const old = goalTarget('old', 2, key(compactedDay));
    const state = { targets: [retained, old], archive: [] };

    expect(compactDailyTargets(state, [], '2026-07-26').targets).toEqual([retained]);
  });
});
