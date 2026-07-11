import { describe, expect, it } from 'vitest';

import type { SessionRecord } from './sessions';
import type { CompanionEvent } from './companion';
import { RECIPE_MIN_SIGNALS } from './companion';
import {
  STATS_MIN_SIGNAL,
  abandonStreakInfo,
  completionRateByPlannedLength,
  completionRateByStartHour,
  driftPhaseDistribution,
  hasEnoughSignal,
  medianMinutesToFirstDrift,
} from './sessionStats';

/* ------------------------------------------------------------------ *
 * Synthetic fixtures
 * ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000; // arbitrary fixed epoch so tests never read the clock

let seq = 0;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  seq++;
  return {
    id: `s-${seq}`,
    startedAt: T0 + seq * 3_600_000,
    endedAt: T0 + seq * 3_600_000 + 25 * 60_000,
    mode: 'focus',
    plannedMin: 25,
    actualMin: 25,
    outcome: 'completed',
    startHour: 9,
    driftEventIds: [],
    ...overrides,
  };
}

function drift(
  sessionId: string | undefined,
  min: number,
  overrides: Partial<CompanionEvent> = {},
): CompanionEvent {
  seq++;
  return {
    id: `e-${seq}`,
    sessionId,
    ts: T0 + seq * 60_000,
    min,
    len: 25,
    kind: 'wander',
    src: 'checkin',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * hasEnoughSignal
 * ------------------------------------------------------------------ */

describe('hasEnoughSignal', () => {
  it('mirrors the recipe threshold from computeAttentionPlan', () => {
    expect(STATS_MIN_SIGNAL).toBe(RECIPE_MIN_SIGNALS);
    expect(hasEnoughSignal(RECIPE_MIN_SIGNALS - 1)).toBe(false);
    expect(hasEnoughSignal(RECIPE_MIN_SIGNALS)).toBe(true);
  });

  it('accepts a custom threshold', () => {
    expect(hasEnoughSignal(2, 3)).toBe(false);
    expect(hasEnoughSignal(3, 3)).toBe(true);
  });

  it('treats zero as not enough', () => {
    expect(hasEnoughSignal(0)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * completionRateByPlannedLength
 * ------------------------------------------------------------------ */

describe('completionRateByPlannedLength', () => {
  it('returns [] for an empty log', () => {
    expect(completionRateByPlannedLength([])).toEqual([]);
  });

  it('groups by planned length, sorted ascending', () => {
    const records = [
      record({ plannedMin: 50, outcome: 'completed' }),
      record({ plannedMin: 25, outcome: 'completed' }),
      record({ plannedMin: 25, outcome: 'abandoned' }),
      record({ plannedMin: 25, outcome: 'completed' }),
      record({ plannedMin: 50, outcome: 'abandoned' }),
    ];
    const out = completionRateByPlannedLength(records);
    expect(out).toEqual([
      { plannedMin: 25, total: 3, completed: 2, rate: 2 / 3 },
      { plannedMin: 50, total: 2, completed: 1, rate: 1 / 2 },
    ]);
  });

  it('excludes flow sessions (plannedMin null)', () => {
    const records = [
      record({ mode: 'flow', plannedMin: null }),
      record({ plannedMin: 25 }),
    ];
    const out = completionRateByPlannedLength(records);
    expect(out).toHaveLength(1);
    expect(out[0].plannedMin).toBe(25);
  });

  it('counts interrupted sessions as not completed', () => {
    const out = completionRateByPlannedLength([
      record({ plannedMin: 25, outcome: 'interrupted' }),
    ]);
    expect(out).toEqual([{ plannedMin: 25, total: 1, completed: 0, rate: 0 }]);
  });
});

/* ------------------------------------------------------------------ *
 * completionRateByStartHour
 * ------------------------------------------------------------------ */

describe('completionRateByStartHour', () => {
  it('returns [] for an empty log', () => {
    expect(completionRateByStartHour([])).toEqual([]);
  });

  it('buckets by hour, sorted, only hours with data', () => {
    const records = [
      record({ startHour: 21, outcome: 'abandoned' }),
      record({ startHour: 9, outcome: 'completed' }),
      record({ startHour: 9, outcome: 'completed' }),
      record({ startHour: 21, outcome: 'completed' }),
    ];
    expect(completionRateByStartHour(records)).toEqual([
      { hour: 9, total: 2, completed: 2, rate: 1 },
      { hour: 21, total: 2, completed: 1, rate: 1 / 2 },
    ]);
  });

  it('includes flow sessions — finishing counts in every mode', () => {
    const out = completionRateByStartHour([
      record({ mode: 'flow', plannedMin: null, startHour: 7, outcome: 'completed' }),
    ]);
    expect(out).toEqual([{ hour: 7, total: 1, completed: 1, rate: 1 }]);
  });
});

/* ------------------------------------------------------------------ *
 * driftPhaseDistribution
 * ------------------------------------------------------------------ */

describe('driftPhaseDistribution', () => {
  it('returns all zeros with no data', () => {
    expect(driftPhaseDistribution([], [])).toEqual({ early: 0, mid: 0, late: 0 });
  });

  it('classifies linked drifts into early/mid/late via phaseOf', () => {
    const r = record();
    const events = [
      drift(r.id, 2), //  2.5/25 = 0.10 → early
      drift(r.id, 12), // 12.5/25 = 0.50 → mid
      drift(r.id, 22), // 22.5/25 = 0.90 → late
      drift(r.id, 23), //             → late
    ];
    expect(driftPhaseDistribution([r], events)).toEqual({ early: 1, mid: 1, late: 2 });
  });

  it('matches by driftEventIds when the event has no sessionId', () => {
    const orphan = drift(undefined, 3);
    const r = record({ driftEventIds: [orphan.id!] });
    expect(driftPhaseDistribution([r], [orphan])).toEqual({ early: 1, mid: 0, late: 0 });
  });

  it('ignores non-drift events and drifts from other sessions', () => {
    const r = record();
    const events = [
      drift(r.id, 10, { kind: 'focused' }), // answered "focused" — not a drift
      drift(r.id, 10, { kind: 'away' }),
      drift('someone-else', 10),
      drift(undefined, 10), // pre-1.3 unlinked event
    ];
    expect(driftPhaseDistribution([r], events)).toEqual({ early: 0, mid: 0, late: 0 });
  });

  it('prefers the user-estimated onset over the detection minute (PLAN 1.5)', () => {
    const r = record();
    // Detected late (min 22) but the user says it started around min 3.
    const events = [drift(r.id, 22, { estOnsetMin: 3 })];
    expect(driftPhaseDistribution([r], events)).toEqual({ early: 1, mid: 0, late: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * medianMinutesToFirstDrift
 * ------------------------------------------------------------------ */

describe('medianMinutesToFirstDrift', () => {
  it('returns null with no data', () => {
    expect(medianMinutesToFirstDrift([], [])).toBeNull();
  });

  it('returns null when sessions exist but none has a drift', () => {
    expect(medianMinutesToFirstDrift([record(), record()], [])).toBeNull();
  });

  it('uses only the first drift per session (odd count)', () => {
    const a = record();
    const b = record();
    const c = record();
    const events = [
      drift(a.id, 18),
      drift(a.id, 4), // first for a → 4
      drift(b.id, 10), // first for b → 10
      drift(c.id, 20), // first for c → 20
    ];
    expect(medianMinutesToFirstDrift([a, b, c], events)).toBe(10);
  });

  it('averages the middle pair (even count)', () => {
    const a = record();
    const b = record();
    const events = [drift(a.id, 8), drift(b.id, 16)];
    expect(medianMinutesToFirstDrift([a, b], events)).toBe(12);
  });

  it('sessions without drifts do not drag the median down', () => {
    const a = record();
    const quiet = record();
    const events = [drift(a.id, 15)];
    expect(medianMinutesToFirstDrift([a, quiet], events)).toBe(15);
  });

  it('attributes id-linked events to the right session', () => {
    const orphanEarly = drift(undefined, 5);
    const orphanLate = drift(undefined, 19);
    const r = record({ driftEventIds: [orphanEarly.id!, orphanLate.id!] });
    expect(medianMinutesToFirstDrift([r], [orphanEarly, orphanLate])).toBe(5);
  });

  it('prefers the user-estimated onset over the detection minute (PLAN 1.5)', () => {
    const a = record();
    const events = [
      drift(a.id, 20, { estOnsetMin: 6 }), // detected at 20, began ~6
      drift(a.id, 12), // no estimate → falls back to min
    ];
    // First drift for the session is the estimated one at 6, not 12 or 20.
    expect(medianMinutesToFirstDrift([a], events)).toBe(6);
  });
});

/* ------------------------------------------------------------------ *
 * abandonStreakInfo
 * ------------------------------------------------------------------ */

describe('abandonStreakInfo', () => {
  it('is zero on an empty log', () => {
    expect(abandonStreakInfo([])).toEqual({ streak: 0, lastAbandonedAt: null });
  });

  it('is zero when the latest session completed', () => {
    const records = [record({ outcome: 'abandoned' }), record({ outcome: 'completed' })];
    expect(abandonStreakInfo(records).streak).toBe(0);
  });

  it('counts only the trailing run of abandons', () => {
    const records = [
      record({ outcome: 'abandoned' }),
      record({ outcome: 'completed' }),
      record({ outcome: 'abandoned' }),
      record({ outcome: 'abandoned', endedAt: T0 + 999 }),
    ];
    expect(abandonStreakInfo(records)).toEqual({ streak: 2, lastAbandonedAt: T0 + 999 });
  });

  it('an interrupted session breaks the run (no guilt off ambiguous data)', () => {
    const records = [
      record({ outcome: 'abandoned' }),
      record({ outcome: 'abandoned' }),
      record({ outcome: 'interrupted' }),
    ];
    expect(abandonStreakInfo(records).streak).toBe(0);
  });

  it('reaches the WOOP threshold with three straight abandons', () => {
    const records = [
      record({ outcome: 'abandoned' }),
      record({ outcome: 'abandoned' }),
      record({ outcome: 'abandoned' }),
    ];
    expect(abandonStreakInfo(records).streak).toBe(3);
  });
});
