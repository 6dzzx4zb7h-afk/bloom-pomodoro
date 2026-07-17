import { describe, expect, it } from 'vitest';

import { dayKeyFor } from './dayKey';

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
});
