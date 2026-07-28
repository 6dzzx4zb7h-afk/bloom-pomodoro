import { describe, expect, it } from 'vitest';
import {
  daysLeft,
  dueLabel,
  goalDeadlineOutcome,
  goalDeadlineOutcomeLine,
  goalProgressText,
  normalizeGoalUnit,
  type Goal,
} from './goals';

function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function goal(due: string): Goal {
  return { id: 1, title: 'Read', due, target: 4, done: 1, createdAt: at(2026, 1, 1) };
}

describe('calendar-safe goal labels', () => {
  it('rolls today to a neutral past-date label at the local boundary', () => {
    const item = goal('2026-07-19');
    expect(dueLabel(item, at(2026, 7, 19, 23, 59))).toBe('due today');
    expect(dueLabel(item, at(2026, 7, 20, 0, 0))).toBe('past its date');
  });

  it('uses the configured study-day boundary when supplied', () => {
    const item = goal('2026-07-19');
    expect(dueLabel(item, at(2026, 7, 20, 3, 59), 4)).toBe('due today');
    expect(dueLabel(item, at(2026, 7, 20, 4, 0), 4)).toBe('past its date');
  });

  it('counts calendar dates rather than fixed 24-hour chunks', () => {
    expect(daysLeft('2026-11-02', at(2026, 11, 1, 0, 1))).toBe(2);
    expect(daysLeft('2026-03-09', at(2026, 3, 8, 0, 1))).toBe(2);
  });
});

describe('goal units', () => {
  it('uses parts when no custom unit is present', () => {
    expect(goalProgressText(goal('2026-08-01'))).toBe('1 of 4 parts');
  });

  it('trims and bounds a custom counting word', () => {
    expect(normalizeGoalUnit('  lectures  ')).toBe('lectures');
    expect(normalizeGoalUnit('abcdefghijklmnopq')).toBe('abcdefghijklmnop');
    expect(normalizeGoalUnit('   ')).toBeUndefined();
    expect(goalProgressText({ ...goal('2026-08-01'), unit: 'lectures' })).toBe(
      '1 of 4 lectures',
    );
  });
});

describe('truthful goal deadline outcomes', () => {
  it('distinguishes a known finish before, on, and after the due study day', () => {
    const finished = {
      ...goal('2026-07-19'),
      done: 4,
    };

    expect(
      goalDeadlineOutcome({ ...finished, completedAt: at(2026, 7, 18, 12) }, 4),
    ).toBe('before');
    expect(
      goalDeadlineOutcome({ ...finished, completedAt: at(2026, 7, 20, 3, 59) }, 4),
    ).toBe('on');
    expect(
      goalDeadlineOutcome({ ...finished, completedAt: at(2026, 7, 20, 4, 0) }, 4),
    ).toBe('after');
  });

  it('keeps legacy or malformed completion timing neutral', () => {
    const finished = { ...goal('2026-07-19'), done: 4 };

    expect(goalDeadlineOutcome(finished, 4)).toBe('unknown');
    expect(goalDeadlineOutcome({ ...finished, completedAt: Number.NaN }, 4)).toBe('unknown');
    expect(goalDeadlineOutcomeLine(finished, 4)).toBe(
      'Finished — the completion date wasn’t recorded',
    );
  });

  it('does not render a deadline outcome for unfinished work', () => {
    const active = goal('2026-07-19');
    expect(goalDeadlineOutcome(active, 4)).toBeNull();
    expect(goalDeadlineOutcomeLine(active, 4)).toBeNull();
  });

  it('returns warm outcome copy only when the recorded timestamp supports it', () => {
    const finished = { ...goal('2026-07-19'), done: 4 };

    expect(
      goalDeadlineOutcomeLine({ ...finished, completedAt: at(2026, 7, 18, 12) }, 4),
    ).toBe('Finished before the due date ♡');
    expect(
      goalDeadlineOutcomeLine({ ...finished, completedAt: at(2026, 7, 20, 3, 59) }, 4),
    ).toBe('Finished on the due date ♡');
    expect(
      goalDeadlineOutcomeLine({ ...finished, completedAt: at(2026, 7, 20, 4, 0) }, 4),
    ).toBe('Finished after the due date — the work still counts');
  });
});
