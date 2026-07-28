import { describe, expect, it } from 'vitest';
import type { Goal } from './goals';
import {
  appendGoalCredit,
  compactGoalLedger,
  deriveGoalsFromLedger,
  GOAL_LEDGER_CAP,
  goalCreditTotal,
  medianSessionCredit,
  type GoalCredit,
  sanitizeGoalLedger,
} from './goalLedger';

const DAY = 86_400_000;
const NOW = new Date(2026, 6, 26, 12).getTime();

function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    title: 'Read chapters',
    due: '2026-08-10',
    target: 10,
    done: 0,
    createdAt: NOW - 10 * DAY,
    ...patch,
  };
}

function credit(patch: Partial<GoalCredit> = {}): GoalCredit {
  return {
    id: `c-${Math.random()}`,
    goalId: 1,
    delta: 1,
    source: 'manual',
    dayKey: '2026-07-26',
    at: NOW,
    ...patch,
  };
}

describe('goal ledger', () => {
  it('records the applied delta and clamps progress at both bounds', () => {
    const up = appendGoalCredit([], [goal()], {
      goalId: 1,
      requestedDelta: 99,
      source: 'manual',
      at: NOW,
    });
    expect(up.appliedDelta).toBe(10);
    expect(up.credit?.delta).toBe(10);
    expect(up.goals[0].done).toBe(10);

    const down = appendGoalCredit(up.ledger, up.goals, {
      goalId: 1,
      requestedDelta: -99,
      source: 'manual',
      at: NOW + 1,
    });
    expect(down.appliedDelta).toBe(-10);
    expect(down.credit?.delta).toBe(-10);
    expect(down.goals[0].done).toBe(0);
  });

  it('sanitizes malformed/orphaned rows and re-derives denormalized progress', () => {
    const valid = credit({ delta: 3 });
    const result = sanitizeGoalLedger(
      [
        valid,
        credit({ id: 'bad-day', dayKey: '26/07/2026' }),
        credit({ id: 'orphan', goalId: 99 }),
        credit({ id: 'zero', delta: 0 }),
      ],
      [goal({ done: 9 })],
    );
    expect(result.ledger).toEqual([valid]);
    expect(result.goals[0].done).toBe(3);
  });

  it('keeps session identity and writes the configured study-day key', () => {
    const at = new Date(2026, 6, 26, 1, 30).getTime();
    const result = appendGoalCredit([], [goal()], {
      goalId: 1,
      requestedDelta: 2,
      source: 'session',
      sessionId: 's-1',
      dayStartHour: 4,
      at,
    });
    expect(result.credit).toMatchObject({
      delta: 2,
      source: 'session',
      sessionId: 's-1',
      dayKey: '2026-07-25',
    });
  });

  it('compacts old rows without changing totals or recent daily actuals', () => {
    const oldAt = NOW - 100 * DAY;
    const oldRows = Array.from({ length: GOAL_LEDGER_CAP }, (_, index) =>
      credit({
        id: `old-${index}`,
        delta: index % 2 === 0 ? 2 : -1,
        dayKey: '2026-04-17',
        at: oldAt + index,
      }),
    );
    const recent = [
      credit({ id: 'recent-a', delta: 2, dayKey: '2026-07-25', at: NOW - DAY }),
      credit({ id: 'recent-b', delta: 3, dayKey: '2026-07-26', at: NOW }),
    ];
    const before = [...oldRows, ...recent];
    const compacted = compactGoalLedger(before, NOW);
    expect(compacted.length).toBe(3);
    expect(goalCreditTotal(compacted, 1)).toBe(goalCreditTotal(before, 1));
    for (const dayKey of ['2026-07-25', '2026-07-26']) {
      const sum = (rows: GoalCredit[]) =>
        rows
          .filter((row) => row.dayKey === dayKey)
          .reduce((total, row) => total + row.delta, 0);
      expect(sum(compacted)).toBe(sum(before));
    }
  });

  it('lets the cap yield when every row is inside the detail window', () => {
    const rows = Array.from({ length: GOAL_LEDGER_CAP + 2 }, (_, index) =>
      credit({ id: `recent-${index}`, at: NOW + index }),
    );
    expect(compactGoalLedger(rows, NOW)).toHaveLength(GOAL_LEDGER_CAP + 2);
  });

  it('derives each goal independently', () => {
    const goals = [goal(), goal({ id: 2, title: 'Problems', target: 4 })];
    const ledger = [credit({ delta: 3 }), credit({ id: 'g2', goalId: 2, delta: 2 })];
    expect(deriveGoalsFromLedger(goals, ledger).map((item) => item.done)).toEqual([3, 2]);
  });

  it('computes an even-sized median from session credit only', () => {
    const rows = [
      credit({ id: 'a', source: 'session', delta: 1 }),
      credit({ id: 'b', source: 'session', delta: 2 }),
      credit({ id: 'c', source: 'session', delta: 3 }),
      credit({ id: 'd', source: 'session', delta: 8 }),
      credit({ id: 'manual', source: 'manual', delta: 99 }),
    ];
    expect(medianSessionCredit(rows, 1, NOW)).toBe(2.5);
  });
});
