import { describe, expect, it } from 'vitest';
import { daysLeft, dueLabel, type Goal } from './goals';

function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function goal(due: string): Goal {
  return { id: 1, title: 'Read', due, target: 4, done: 1, createdAt: at(2026, 1, 1) };
}

describe('calendar-safe goal labels', () => {
  it('rolls today to overdue at the local boundary', () => {
    const item = goal('2026-07-19');
    expect(dueLabel(item, at(2026, 7, 19, 23, 59))).toBe('due today');
    expect(dueLabel(item, at(2026, 7, 20, 0, 0))).toBe('overdue');
  });

  it('uses the configured study-day boundary when supplied', () => {
    const item = goal('2026-07-19');
    expect(dueLabel(item, at(2026, 7, 20, 3, 59), 4)).toBe('due today');
    expect(dueLabel(item, at(2026, 7, 20, 4, 0), 4)).toBe('overdue');
  });

  it('counts calendar dates rather than fixed 24-hour chunks', () => {
    expect(daysLeft('2026-11-02', at(2026, 11, 1, 0, 1))).toBe(2);
    expect(daysLeft('2026-03-09', at(2026, 3, 8, 0, 1))).toBe(2);
  });
});
