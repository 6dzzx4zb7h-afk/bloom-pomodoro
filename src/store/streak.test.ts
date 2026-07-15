import { describe, expect, it } from 'vitest';
import {
  bumpStreakGentle,
  daysBetween,
  restDayAvailable,
  streakAlive,
  type StreakData,
} from './streak';

const data = (
  streak: number,
  lastFocusDay: string | null,
  restDayUsedOn: string | null = null,
): StreakData => ({ streak, lastFocusDay, restDayUsedOn });

describe('daysBetween', () => {
  it('counts whole days between day keys', () => {
    expect(daysBetween('2026-07-10', '2026-07-15')).toBe(5);
    expect(daysBetween('2026-07-15', '2026-07-15')).toBe(0);
    expect(daysBetween('2026-07-15', '2026-07-14')).toBe(-1);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-06-30', '2026-07-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('restDayAvailable', () => {
  it('is available when never used', () => {
    expect(restDayAvailable(null, '2026-07-14')).toBe(true);
  });

  it('needs seven days between rest days', () => {
    expect(restDayAvailable('2026-07-10', '2026-07-14')).toBe(false);
    expect(restDayAvailable('2026-07-07', '2026-07-14')).toBe(true);
  });
});

describe('bumpStreakGentle', () => {
  it('starts a first-ever streak at one', () => {
    expect(bumpStreakGentle(data(0, null), '2026-07-15')).toEqual({
      streak: 1,
      lastFocusDay: '2026-07-15',
      restDayUsedOn: null,
    });
  });

  it('grows on consecutive days and counts each day once', () => {
    const grown = bumpStreakGentle(data(3, '2026-07-14'), '2026-07-15');
    expect(grown.streak).toBe(4);
    expect(bumpStreakGentle(grown, '2026-07-15').streak).toBe(4);
  });

  it('bridges a single missed day with the weekly free rest day', () => {
    const bumped = bumpStreakGentle(data(5, '2026-07-13'), '2026-07-15');
    expect(bumped).toEqual({
      streak: 6,
      lastFocusDay: '2026-07-15',
      restDayUsedOn: '2026-07-14',
    });
  });

  it('does not bridge a second missed day within the same week', () => {
    const bumped = bumpStreakGentle(data(6, '2026-07-13', '2026-07-11'), '2026-07-15');
    expect(bumped.streak).toBe(1);
    expect(bumped.lastFocusDay).toBe('2026-07-15');
  });

  it('offers the rest day again once a week has passed', () => {
    const bumped = bumpStreakGentle(data(9, '2026-07-13', '2026-07-06'), '2026-07-15');
    expect(bumped.streak).toBe(10);
    expect(bumped.restDayUsedOn).toBe('2026-07-14');
  });

  it('starts fresh after a longer pause — a count, never a punishment', () => {
    const bumped = bumpStreakGentle(data(40, '2026-07-01'), '2026-07-15');
    expect(bumped.streak).toBe(1);
    expect(bumped.lastFocusDay).toBe('2026-07-15');
  });

  it('stays calm if the clock moved backwards', () => {
    const bumped = bumpStreakGentle(data(4, '2026-07-16'), '2026-07-15');
    expect(bumped.streak).toBe(4);
    expect(bumped.lastFocusDay).toBe('2026-07-15');
  });
});

describe('streakAlive', () => {
  it('is alive same-day and next-day', () => {
    expect(streakAlive(data(3, '2026-07-15'), '2026-07-15')).toBe(true);
    expect(streakAlive(data(3, '2026-07-14'), '2026-07-15')).toBe(true);
  });

  it('survives one missed day while the rest day is free', () => {
    expect(streakAlive(data(3, '2026-07-13'), '2026-07-15')).toBe(true);
    expect(streakAlive(data(3, '2026-07-13', '2026-07-12'), '2026-07-15')).toBe(false);
    expect(streakAlive(data(3, '2026-07-13', '2026-07-07'), '2026-07-15')).toBe(true);
  });

  it('is paused after two or more missed days', () => {
    expect(streakAlive(data(3, '2026-07-12'), '2026-07-15')).toBe(false);
    expect(streakAlive(data(0, null), '2026-07-15')).toBe(false);
  });
});
