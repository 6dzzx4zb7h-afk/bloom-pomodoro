import { describe, expect, it } from 'vitest';
import type { Goal } from '../store/goals';
import { dayKeyFor } from '../store/dayKey';
import { medianSessionCredit, type GoalCredit } from '../store/goalLedger';
import {
  observedLanding,
  observedLandingLine,
  sessionEffortLine,
  weeklyPlanCalibration,
  weeklyPlanCalibrationLine,
} from './paceActual';
import type { DayPlanState, GoalDailyTarget } from '../store/dailyTarget';
import type { SessionRecord } from '../store/sessions';

const DAY = 86_400_000;
const NOW = new Date(2026, 6, 30, 12).getTime();
const goal: Goal = {
  id: 1,
  title: 'Lectures',
  due: '2026-08-15',
  target: 20,
  done: 8,
  createdAt: NOW - 20 * DAY,
  unit: 'lectures',
};

function row(
  id: string,
  daysAgo: number,
  delta: number,
  patch: Partial<GoalCredit> = {},
): GoalCredit {
  const at = NOW - daysAgo * DAY;
  const date = new Date(at);
  return {
    id,
    goalId: 1,
    delta,
    source: 'session',
    dayKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`,
    at,
    ...patch,
  };
}

describe('observedLanding', () => {
  it('stays silent below three recorded active days', () => {
    expect(observedLanding([row('a', 1, 2), row('b', 2, 3)], goal, NOW)).toBeNull();
  });

  it('projects from mean positive credit across distinct active days', () => {
    const result = observedLanding(
      [row('a', 1, 2), row('b', 2, 4), row('c', 3, 3), row('d', 3, 1)],
      goal,
      NOW,
    );
    expect(result).toMatchObject({ activeDays: 3, amountPerActiveDay: 10 / 3 });
    expect(result?.projectedDayKey).toBe('2026-08-03');
  });

  it('excludes carryover, corrections, other goals, future, and old rows', () => {
    const rows = [
      row('a', 1, 2),
      row('b', 2, 2),
      row('carry', 3, 50, { source: 'carryover' }),
      row('negative', 3, -1),
      row('other', 3, 2, { goalId: 2 }),
      row('old', 30, 2),
      row('future', -1, 2),
    ];
    expect(observedLanding(rows, goal, NOW)).toBeNull();
  });

  it('uses calendar addition across a month boundary', () => {
    const result = observedLanding(
      [row('a', 1, 4), row('b', 2, 4), row('c', 3, 4)],
      goal,
      NOW,
    );
    expect(result?.projectedDayKey).toBe('2026-08-02');
  });

  it('resolves the projected study day at the configured boundary', () => {
    const beforeBoundary = new Date(2026, 6, 30, 2, 30).getTime();
    const rows = [1, 2, 3].map((daysAgo) => {
      const at = beforeBoundary - daysAgo * DAY;
      return row(`boundary-${daysAgo}`, 0, 4, {
        at,
        dayKey: dayKeyFor(at, 3),
      });
    });
    const result = observedLanding(rows, goal, beforeBoundary, 3);
    expect(result?.projectedDayKey).toBe('2026-08-01');
  });

  it('writes one basis-stated line and only adds a resize invitation after the date', () => {
    const result = observedLanding(
      [row('a', 1, 2), row('b', 2, 2), row('c', 3, 2)],
      goal,
      NOW,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    const onTime = observedLandingLine(result, { ...goal, due: '2026-12-31' });
    expect(onTime).toBe(
      'At the pace you’ve recorded (about 2 lectures a day), this lands around Aug 5.',
    );
    const afterDate = observedLandingLine(result, { ...goal, due: '2026-08-01' });
    expect(afterDate).toContain(
      'Based on your pace so far, this might land after its date. Shrink it, or move the date?',
    );
    expect(`${onTime} ${afterDate}`).not.toMatch(/%|behind|late|off track|should/i);
  });
});

describe('medianSessionCredit', () => {
  it('requires three in-window session rows for the same goal', () => {
    expect(medianSessionCredit([row('a', 1, 1), row('b', 2, 3)], 1, NOW)).toBeNull();
    expect(
      medianSessionCredit(
        [row('a', 1, 1), row('b', 2, 3), row('c', 3, 2), row('other', 1, 99, { goalId: 2 })],
        1,
        NOW,
      ),
    ).toBe(2);
  });

  it('groups multiple rows from the same session before taking the median', () => {
    const rows = [
      row('a1', 1, 1, { sessionId: 's-a' }),
      row('a2', 1, 2, { sessionId: 's-a' }),
      row('b', 2, 2, { sessionId: 's-b' }),
      row('c', 3, 4, { sessionId: 's-c' }),
      row('old', 29, 99, { sessionId: 's-old' }),
    ];
    expect(medianSessionCredit(rows, 1, NOW)).toBe(3);
  });
});

describe('sessionEffortLine', () => {
  it('stays silent without a guarded median and translates a known goal amount', () => {
    expect(sessionEffortLine(3, 'lectures', null)).toBeNull();
    expect(sessionEffortLine(3, 'lectures', 1.5)).toBe(
      'From your recorded goal credits, 3 lectures is about 2 of your usual sessions.',
    );
  });
});

function target(
  id: string,
  dayKey: string,
  carriedFromDayKey?: string,
): GoalDailyTarget {
  return {
    id,
    goalId: 1,
    dayKey,
    plannedAmount: 4,
    snapshot: Object.freeze({ title: 'Lectures', unit: 'lectures' }),
    createdAt: NOW,
    ...(carriedFromDayKey ? { carriedFromDayKey } : {}),
  };
}

function session(id: string, day: number): SessionRecord {
  const endedAt = new Date(2026, 6, day, 12).getTime();
  return {
    id,
    startedAt: endedAt - 25 * 60_000,
    endedAt,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: 11,
    driftEventIds: [],
  };
}

describe('weeklyPlanCalibration', () => {
  const plan: DayPlanState = {
    targets: [
      target('monday', '2026-07-20'),
      target('tuesday', '2026-07-21', '2026-07-20'),
      target('wednesday', '2026-07-22'),
    ],
    archive: [],
  };
  const ledger = [
    row('monday-credit', 10, 3, { dayKey: '2026-07-20' }),
    row('tuesday-credit', 9, 3, { dayKey: '2026-07-21' }),
    row('wednesday-credit', 8, 3, { dayKey: '2026-07-22' }),
  ];
  const sessions = [session('monday', 20), session('tuesday', 21), session('wednesday', 22)];

  it('requires both three target days and three completed sessions', () => {
    expect(
      weeklyPlanCalibration(
        { ...plan, targets: plan.targets.slice(0, 2) },
        ledger,
        sessions,
        '2026-07-30',
      ),
    ).toBeNull();
    expect(
      weeklyPlanCalibration(plan, ledger, sessions.slice(0, 2), '2026-07-30'),
    ).toBeNull();
  });

  it('reports deterministic sums and distinguishes carried plans', () => {
    const calibration = weeklyPlanCalibration(
      plan,
      ledger,
      sessions,
      '2026-07-30',
    );
    expect(calibration).toEqual({
      activeDays: 3,
      sessionCount: 3,
      planned: 12,
      actual: 9,
      carriedPlanned: 4,
    });
    expect(weeklyPlanCalibrationLine(calibration!)).toBe(
      'You planned 12 and recorded 9 across 3 days — planning 9 might feel better. 4 of the planned parts were carried in.',
    );
  });
});
