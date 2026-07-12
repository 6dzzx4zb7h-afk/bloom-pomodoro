import { describe, expect, it } from 'vitest';
import {
  finalizeSession,
  newOpenSession,
  sanitizeOpenSession,
  sweepStaleOpenSession,
} from './sessions';
import { isTinyFirstRung, tinyResetMinutes, tinyXpFor } from './useBloom';

describe('tiny session lifecycle', () => {
  const now = new Date(2026, 6, 13, 9, 0, 0).getTime();

  it('creates and finalizes a completed tiny record without changing its mode', () => {
    const open = newOpenSession('tiny', 2, 7, undefined, now);
    const record = finalizeSession(open, 'completed', 2, now + 2 * 60_000);

    expect(record).toMatchObject({
      id: open.id,
      mode: 'tiny',
      plannedMin: 2,
      actualMin: 2,
      outcome: 'completed',
      taskId: 7,
    });
    expect(isTinyFirstRung(record)).toBe(true);
  });

  it('preserves a valid tiny open session for the reload sweep', () => {
    const raw = {
      ...newOpenSession('tiny', 5, 3, undefined, now),
      endsAt: now + 5 * 60_000,
    };

    expect(sanitizeOpenSession(raw)).toMatchObject({ mode: 'tiny', plannedMin: 5 });
    expect(sweepStaleOpenSession(raw, now + 2 * 60_000)).toMatchObject({
      mode: 'tiny',
      outcome: 'interrupted',
      actualMin: 2,
    });
  });

  it('offers the next rung only after the 2- or 5-minute first rung', () => {
    const first = finalizeSession(newOpenSession('tiny', 5, undefined, undefined, now), 'completed', 5);
    const extension = finalizeSession(
      newOpenSession('tiny', 10, undefined, undefined, now),
      'completed',
      10,
    );
    const abandoned = { ...first, outcome: 'abandoned' as const };

    expect(isTinyFirstRung(first)).toBe(true);
    expect(isTinyFirstRung(extension)).toBe(false);
    expect(isTinyFirstRung(abandoned)).toBe(false);
  });
});

describe('tiny XP', () => {
  it('is proportional to the configured focus length', () => {
    expect(tinyXpFor(2, 25)).toBe(0.08);
    expect(tinyXpFor(5, 25)).toBe(0.2);
    expect(tinyXpFor(10, 25)).toBe(0.4);
  });

  it('is always positive and never exceeds one full focus XP', () => {
    expect(tinyXpFor(2, 90)).toBeGreaterThan(0);
    expect(tinyXpFor(10, 5)).toBe(1);
  });
});

describe('tiny reset length', () => {
  it('keeps a selected first rung but leaves a reset extension at the first rung', () => {
    expect(tinyResetMinutes(undefined, 5 * 60)).toBe(5);
    expect(tinyResetMinutes(5, 4 * 60)).toBe(5);
    expect(tinyResetMinutes(10, 9 * 60)).toBe(2);
  });
});
