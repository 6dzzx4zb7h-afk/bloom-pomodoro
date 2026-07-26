import { beforeEach, describe, expect, it } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import type { CompanionEvent } from '../store/companion';
import {
  WEEKLY_MIN_SESSIONS,
  computeWeeklyReview,
  weekKey,
} from './weekly';

/* ------------------------------------------------------------------ *
 * Synthetic fixtures (same style as why.test.ts / sessionStats.test.ts)
 * ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000; // fixed epoch — tests never read the clock
const DAY = 86_400_000;
/** "Now" for every review call: a day after the last fixture session. */
const NOW = T0 + 3 * DAY;

let seq = 0;

beforeEach(() => {
  seq = 0;
});

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

/** Copy guard: none of the never-ship lexicon may appear in review strings. */
const BANNED = /fail|broke|lazy|wasted|discipline|willpower|guilt|shame|excuse|optimal|proven|detox|you should|missed you/i;

function allText(r: ReturnType<typeof computeWeeklyReview>): string {
  return r.kind === 'ready' ? `${r.start} ${r.recover} ${r.experiment}` : r.text;
}

/* ------------------------------------------------------------------ *
 * weekKey
 * ------------------------------------------------------------------ */

describe('weekKey', () => {
  // Local-time dates, constructed explicitly so the test is TZ-independent.
  const wed = new Date(2026, 6, 8, 15, 30).getTime(); // Wed 2026-07-08
  const sun = new Date(2026, 6, 12, 23, 59).getTime(); // Sun 2026-07-12
  const nextMon = new Date(2026, 6, 13, 0, 1).getTime(); // Mon 2026-07-13

  it('is stable across one Monday-based week', () => {
    expect(weekKey(wed)).toBe('2026-07-06');
    expect(weekKey(sun)).toBe('2026-07-06');
  });

  it('rolls over on Monday', () => {
    expect(weekKey(nextMon)).toBe('2026-07-13');
    expect(weekKey(nextMon)).not.toBe(weekKey(sun));
  });

  it('keeps early Monday inside Sunday’s study week when the boundary is later', () => {
    const mondayAt0030 = new Date(2026, 6, 13, 0, 30).getTime();
    expect(weekKey(mondayAt0030, 4)).toBe('2026-07-06');
    expect(weekKey(new Date(2026, 6, 13, 4, 0).getTime(), 4)).toBe('2026-07-13');
  });
});

/* ------------------------------------------------------------------ *
 * computeWeeklyReview
 * ------------------------------------------------------------------ */

describe('computeWeeklyReview', () => {
  it('shows the learning state below the session threshold', () => {
    const records = Array.from({ length: WEEKLY_MIN_SESSIONS - 1 }, () => record());
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('learning');
    expect(r.sessionCount).toBe(WEEKLY_MIN_SESSIONS - 1);
    if (r.kind === 'learning') expect(r.text).toContain('learning');
  });

  it('shows a distinct learning line for a week with zero sessions', () => {
    const r = computeWeeklyReview([], [], NOW);
    expect(r.kind).toBe('learning');
    if (r.kind === 'learning') expect(r.text).toContain('quiet week');
  });

  it('ignores sessions outside the 7-day window', () => {
    const old = Array.from({ length: 10 }, () =>
      record({ endedAt: NOW - 20 * DAY, startedAt: NOW - 20 * DAY - 25 * 60_000 }),
    );
    const r = computeWeeklyReview(old, [], NOW);
    expect(r.kind).toBe('learning');
    expect(r.sessionCount).toBe(0);
  });

  it('quarantines future and reversed session timestamps', () => {
    const valid = Array.from({ length: 4 }, () => record());
    const future = record({
      startedAt: NOW + DAY,
      endedAt: NOW + DAY + 25 * 60_000,
    });
    const reversed = record({
      startedAt: NOW - 60_000,
      endedAt: NOW - 120_000,
    });
    const r = computeWeeklyReview([...valid, future, reversed], [], NOW);

    expect(r.kind).toBe('learning');
    expect(r.sessionCount).toBe(4);
  });

  it('answers both questions plus one experiment with enough sessions', () => {
    const records = Array.from({ length: 6 }, () => record());
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') {
      expect(r.start.length).toBeGreaterThan(0);
      expect(r.recover.length).toBeGreaterThan(0);
      expect(r.experiment.length).toBeGreaterThan(0);
    }
  });

  it('credits a strong start hour in the start answer', () => {
    const records = Array.from({ length: 6 }, () => record({ startHour: 9 }));
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.start).toContain('9 am');
  });

  it('credits small blocks when no hour qualifies and short sessions finish', () => {
    // Hours spread so no bucket reaches 3 samples; three short completions.
    const records = [
      record({ plannedMin: 10, startHour: 8 }),
      record({ plannedMin: 10, startHour: 10 }),
      record({ mode: 'tiny', plannedMin: 5, startHour: 13 }),
      record({ plannedMin: 40, outcome: 'abandoned', actualMin: 12, startHour: 15 }),
      record({ plannedMin: 40, outcome: 'abandoned', actualMin: 8, startHour: 17 }),
    ];
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.start).toContain('small blocks');
  });

  it('counts drifted-but-completed sessions as recoveries', () => {
    const records = [
      ...Array.from({ length: 4 }, () => record({ startHour: 9 })),
      record({ id: 's-drifted', startHour: 14 }),
    ];
    const events = [drift('s-drifted', 12)];
    const r = computeWeeklyReview(records, events, NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.recover).toContain('1 session drifted and still finished');
  });

  it('states plainly when no drifts were logged', () => {
    const records = Array.from({ length: 5 }, () => record());
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.recover).toContain('no drifts logged');
  });

  it('keeps restart framing when drifted sessions all ended early', () => {
    const records = [
      ...Array.from({ length: 4 }, () => record({ startHour: 9 })),
      record({ id: 's-cut', outcome: 'abandoned', actualMin: 10, startHour: 14 }),
    ];
    const events = [drift('s-cut', 8)];
    const r = computeWeeklyReview(records, events, NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') {
      expect(r.recover).toContain('that happened');
      expect(r.recover).not.toMatch(BANNED);
    }
  });

  it('suggests a shorter block when drifts cluster late', () => {
    const ids = ['s-a', 's-b', 's-c'];
    const records = [
      ...ids.map((id) => record({ id })),
      ...Array.from({ length: 2 }, () => record()),
    ];
    const events = ids.map((id) => drift(id, 22)); // late in a 25-min block
    const r = computeWeeklyReview(records, events, NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.experiment).toContain('shorter');
  });

  it('suggests a warm-up when drifts cluster early', () => {
    const ids = ['s-a', 's-b', 's-c'];
    const records = [
      ...ids.map((id) => record({ id })),
      ...Array.from({ length: 2 }, () => record()),
    ];
    const events = ids.map((id) => drift(id, 2)); // right after start
    const r = computeWeeklyReview(records, events, NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.experiment).toContain('warm-up');
  });

  it('falls back to the tiny-session experiment with no pattern', () => {
    // Hours spread thin, no drifts: no golden hour, no drift pattern.
    const records = Array.from({ length: 5 }, (_, i) => record({ startHour: 8 + i * 2 }));
    const r = computeWeeklyReview(records, [], NOW);
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') expect(r.experiment).toContain('2-minute');
  });

  it('never ships banned lexicon in any state', () => {
    const cases = [
      computeWeeklyReview([], [], NOW),
      computeWeeklyReview(Array.from({ length: 3 }, () => record()), [], NOW),
      computeWeeklyReview(Array.from({ length: 8 }, () => record()), [], NOW),
      computeWeeklyReview(
        [
          ...Array.from({ length: 5 }, () => record({ outcome: 'abandoned', actualMin: 5 })),
        ],
        [],
        NOW,
      ),
    ];
    for (const c of cases) expect(allText(c)).not.toMatch(BANNED);
  });
});
