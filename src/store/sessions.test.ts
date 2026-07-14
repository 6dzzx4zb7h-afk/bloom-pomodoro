import { describe, expect, it } from 'vitest';
import {
  captureTimerSnapshot,
  finalizeSession,
  markTimerReturn,
  newOpenSession,
  resolveTimerReturn,
  sanitizeOpenSession,
  setSessionTargetOutcome,
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

describe('session target lifecycle', () => {
  const now = new Date(2026, 6, 13, 10, 0, 0).getTime();

  it('carries a target from the open session into its finalized record', () => {
    const open = {
      ...newOpenSession('focus', 25, 4, undefined, now),
      targetText: 'outline the intro section',
    };

    const record = finalizeSession(open, 'completed', 25, now + 25 * 60_000);
    expect(record).toMatchObject({
      targetText: 'outline the intro section',
    });
    expect(record.targetOutcome).toBeUndefined();
    expect(sanitizeOpenSession(open)?.targetText).toBe('outline the intro section');
  });

  it('stores a debrief answer only on the matching targeted record', () => {
    const targeted = finalizeSession(
      { ...newOpenSession('focus', 25, 4, undefined, now), targetText: 'draft two paragraphs' },
      'completed',
      25,
    );
    const untargeted = finalizeSession(
      newOpenSession('flow', null, 5, undefined, now + 1),
      'completed',
      12,
    );

    const updated = setSessionTargetOutcome([targeted, untargeted], targeted.id, 'partly');

    expect(updated[0].targetOutcome).toBe('partly');
    expect(updated[1]).toBe(untargeted);
  });
});

describe('honest tab-return snapshots', () => {
  const now = new Date(2026, 6, 14, 11, 0, 0).getTime();

  it('ignores short blips without leaving a pending question', () => {
    const open = captureTimerSnapshot(
      { ...newOpenSession('focus', 25, 2, undefined, now), endsAt: now + 20 * 60_000 },
      20 * 60,
      2,
      now,
    );

    const returned = markTimerReturn(open, now + 44_000, 45);

    expect(returned.shouldPrompt).toBe(false);
    expect(returned.open.returnSnapshot).toBeUndefined();
  });

  it('restores the exact captured countdown when paused back', () => {
    const captured = captureTimerSnapshot(
      { ...newOpenSession('focus', 25, 2, undefined, now), endsAt: now + 1_234_000 },
      1234,
      3,
      now,
    );
    const pending = markTimerReturn(captured, now + 60_000, 45).open;
    const restored = resolveTimerReturn(pending, 'pauseBack');

    expect(restored).toMatchObject({
      running: false,
      endsAt: null,
      remainingSec: 1234,
    });
    expect(restored.returnSnapshot).toBeUndefined();
  });

  it('handles multiple leaves in one session without duplicating a pending leave', () => {
    const base = {
      ...newOpenSession('focus', 25, 2, undefined, now),
      endsAt: now + 20 * 60_000,
    };
    const first = captureTimerSnapshot(base, 1200, 1, now);
    const duplicateLeave = captureTimerSnapshot(first, 1195, 1, now + 5_000);
    expect(duplicateLeave.returnSnapshot?.capturedAt).toBe(now);

    const firstPending = markTimerReturn(first, now + 60_000, 45).open;
    const firstResolved = resolveTimerReturn(firstPending, 'focused');
    const second = captureTimerSnapshot(firstResolved, 1100, 1, now + 120_000);
    const secondPending = markTimerReturn(second, now + 180_000, 45);

    expect(secondPending.shouldPrompt).toBe(true);
    expect(secondPending.open.returnSnapshot).toMatchObject({
      capturedAt: now + 120_000,
      returnedAt: now + 180_000,
      remainingSec: 1100,
      sessionId: base.id,
    });
  });

  it('carries the cue and snapshot into an interrupted record', () => {
    const open = markTimerReturn(
      captureTimerSnapshot(
        {
          ...newOpenSession('focus', 25, 2, undefined, now),
          nextActionText: 'open the notes',
        },
        900,
        4,
        now,
      ),
      now + 60_000,
      45,
    ).open;

    const record = finalizeSession(open, 'interrupted', 10, now + 60_000);

    expect(record).toMatchObject({
      nextActionText: 'open the notes',
      resumeCuePending: true,
      returnSnapshot: { remainingSec: 900, round: 4 },
    });
  });
});
