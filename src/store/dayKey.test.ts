import { describe, expect, it } from 'vitest';

import { dayKeyFor, nextDayBoundaryAt, normalizeDayStartHour } from './dayKey';

/** Local-time instant, so the tests hold in any timezone the suite runs in. */
function at(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe('dayKeyFor', () => {
  it('renders a local day with zero-padded month and day', () => {
    expect(dayKeyFor(at(2026, 7, 4, 12, 30))).toBe('2026-07-04');
  });

  it('keeps the whole default day together, midnight through 23:59', () => {
    expect(dayKeyFor(at(2026, 7, 4, 0, 0))).toBe('2026-07-04');
    expect(dayKeyFor(at(2026, 7, 4, 23, 59))).toBe('2026-07-04');
    expect(dayKeyFor(at(2026, 7, 3, 23, 59))).toBe('2026-07-03');
  });

  it('folds small hours into the previous day when a boundary is set', () => {
    expect(dayKeyFor(at(2026, 7, 4, 3, 59), 4)).toBe('2026-07-03');
    // The boundary hour itself starts the new day.
    expect(dayKeyFor(at(2026, 7, 4, 4, 0), 4)).toBe('2026-07-04');
  });

  it('walks a boundary fold back across month and year edges', () => {
    expect(dayKeyFor(at(2026, 5, 1, 2, 0), 4)).toBe('2026-04-30');
    expect(dayKeyFor(at(2026, 1, 1, 1, 0), 4)).toBe('2025-12-31');
  });

  it('agrees with the local calendar around DST shift dates', () => {
    // Whatever the host timezone does in March/November, the key must match
    // what a local Date says the calendar day is at that instant.
    for (const ts of [at(2026, 3, 8, 2, 30), at(2026, 11, 1, 1, 30)]) {
      const d = new Date(ts);
      expect(dayKeyFor(ts)).toBe(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`,
      );
    }
  });

  it('normalizes an untrusted boundary before doing calendar math', () => {
    expect(normalizeDayStartHour(3.6)).toBe(4);
    expect(normalizeDayStartHour(-5)).toBe(0);
    expect(normalizeDayStartHour(99)).toBe(23);
    expect(normalizeDayStartHour('4')).toBe(0);
    expect(dayKeyFor(at(2026, 7, 4, 3, 59), 99)).toBe('2026-07-03');
  });
});

describe('nextDayBoundaryAt', () => {
  it('returns the next midnight at the default boundary', () => {
    const next = new Date(nextDayBoundaryAt(at(2026, 7, 4, 23, 59)));
    expect([
      next.getFullYear(),
      next.getMonth() + 1,
      next.getDate(),
      next.getHours(),
      next.getMinutes(),
    ]).toEqual([2026, 7, 5, 0, 0]);
  });

  it('uses a configured boundary on the same or next local date', () => {
    expect(nextDayBoundaryAt(at(2026, 7, 4, 3, 0), 4)).toBe(at(2026, 7, 4, 4, 0));
    expect(nextDayBoundaryAt(at(2026, 7, 4, 4, 0), 4)).toBe(at(2026, 7, 5, 4, 0));
  });

  it('follows local calendar setters across common DST-edge dates', () => {
    for (const [month, day] of [[3, 8], [11, 1]] as const) {
      const start = at(2026, month, day, 12, 0);
      const next = new Date(nextDayBoundaryAt(start));
      const expected = new Date(start);
      expected.setHours(0, 0, 0, 0);
      expected.setDate(expected.getDate() + 1);
      expect(next.getTime()).toBe(expected.getTime());
      expect(dayKeyFor(next.getTime())).not.toBe(dayKeyFor(start));
    }
  });

  it('keeps a configured boundary at the same wall-clock hour across real DST changes', () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const beforeSpringShift = new Date(2026, 2, 7, 5, 0).getTime();
      const springBoundary = new Date(nextDayBoundaryAt(beforeSpringShift, 4));
      expect(springBoundary.getHours()).toBe(4);
      expect(springBoundary.getDate()).toBe(8);
      expect(springBoundary.getTimezoneOffset()).not.toBe(
        new Date(beforeSpringShift).getTimezoneOffset(),
      );
      expect(dayKeyFor(springBoundary.getTime() - 1, 4)).toBe('2026-03-07');
      expect(dayKeyFor(springBoundary.getTime(), 4)).toBe('2026-03-08');

      const beforeFallShift = new Date(2026, 9, 31, 5, 0).getTime();
      const fallBoundary = new Date(nextDayBoundaryAt(beforeFallShift, 4));
      expect(fallBoundary.getHours()).toBe(4);
      expect(fallBoundary.getDate()).toBe(1);
      expect(fallBoundary.getTimezoneOffset()).not.toBe(
        new Date(beforeFallShift).getTimezoneOffset(),
      );
      expect(dayKeyFor(fallBoundary.getTime() - 1, 4)).toBe('2026-10-31');
      expect(dayKeyFor(fallBoundary.getTime(), 4)).toBe('2026-11-01');
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });
});
