import { describe, expect, it } from 'vitest';

import { proposeSessionRepair, sessionRepairBounds } from './sessionRepair';
import type { SessionRecord } from './sessions';

const minute = 60_000;

function record(
  id: string,
  startedAt: number,
  endedAt: number,
  patch: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    startedAt,
    endedAt,
    mode: 'focus',
    plannedMin: 25,
    actualMin: (endedAt - startedAt) / minute,
    outcome: 'interrupted',
    startHour: 9,
    driftEventIds: [],
    ...patch,
  };
}

describe('session repair proposals', () => {
  it('returns a repaired record without mutating the source', () => {
    const source = record('target', 0, 10 * minute);
    const result = proposeSessionRepair({
      record: source,
      records: [source],
      wallClockEndAt: 30 * minute,
      endedAt: 20 * minute,
      outcome: 'completed',
    });

    expect(result).toMatchObject({
      ok: true,
      proposal: {
        record: { id: 'target', endedAt: 20 * minute, actualMin: 20, outcome: 'completed' },
        adjustments: [],
      },
    });
    expect(source).toMatchObject({ endedAt: 10 * minute, outcome: 'interrupted' });
  });

  it('clamps to the next session before the wall-clock cap', () => {
    const source = record('target', 0, 10 * minute);
    const next = record('next', 18 * minute, 30 * minute);
    expect(sessionRepairBounds(source, [source, next], 40 * minute)).toEqual({
      earliestEndAt: 0,
      latestEndAt: 18 * minute,
      nextSessionId: 'next',
    });
    const result = proposeSessionRepair({
      record: source,
      records: [source, next],
      wallClockEndAt: 40 * minute,
      endedAt: 35 * minute,
      outcome: 'completed',
    });
    expect(result).toMatchObject({
      ok: true,
      proposal: {
        record: { endedAt: 18 * minute, actualMin: 18 },
        adjustments: ['next-session'],
      },
    });
  });

  it('rejects an existing overlap and an out-of-session drift estimate', () => {
    const source = record('target', 10 * minute, 20 * minute);
    const prior = record('prior', 0, 12 * minute);
    expect(
      proposeSessionRepair({
        record: source,
        records: [prior, source],
        wallClockEndAt: 30 * minute,
        endedAt: 25 * minute,
        outcome: 'completed',
      }),
    ).toEqual({ ok: false, error: 'existing-overlap' });
    expect(
      proposeSessionRepair({
        record: source,
        records: [source],
        wallClockEndAt: 30 * minute,
        endedAt: 25 * minute,
        outcome: 'completed',
        retroactiveDrift: { onsetAt: 24 * minute, durationMin: 3 },
      }),
    ).toEqual({ ok: false, error: 'invalid-drift' });
  });

  it('has no reward, XP, celebration, or streak output path', () => {
    const source = record('target', 0, 10 * minute);
    const result = proposeSessionRepair({
      record: source,
      records: [source],
      wallClockEndAt: 30 * minute,
      endedAt: 25 * minute,
      outcome: 'completed',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.proposal).sort()).toEqual(['adjustments', 'record']);
    expect('xp' in result.proposal).toBe(false);
    expect('streak' in result.proposal).toBe(false);
    expect('celebrate' in result.proposal).toBe(false);
  });
});
