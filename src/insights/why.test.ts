import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '../store/sessions';
import type { CompanionEvent } from '../store/companion';
import { STATS_MIN_SIGNAL } from '../store/sessionStats';
import {
  EVIDENCE_EXPLAINERS,
  WHY_EVIDENCE_ANCHORS,
  driftsForRecord,
  whyFor,
  type WhyEvidenceKey,
  type WhyInsight,
} from './why';

/* ------------------------------------------------------------------ *
 * Synthetic fixtures (same style as sessionStats.test.ts)
 * ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000; // fixed epoch — tests never read the clock

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

/** Enough drift-free history to clear the low-signal guard. */
function history(n: number = STATS_MIN_SIGNAL, startHour = 9): SessionRecord[] {
  return Array.from({ length: n }, () => record({ startHour }));
}

/* ------------------------------------------------------------------ *
 * driftsForRecord
 * ------------------------------------------------------------------ */

describe('driftsForRecord', () => {
  it('matches by event sessionId and by record driftEventIds', () => {
    const r = record({ driftEventIds: ['e-linked'] });
    const bySession = drift(r.id, 5);
    const byLink = drift(undefined, 8, { id: 'e-linked' });
    const other = drift('someone-else', 3);
    const focused = drift(r.id, 10, { kind: 'focused' });
    expect(driftsForRecord(r, [bySession, byLink, other, focused])).toEqual([
      bySession,
      byLink,
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * The rules, one by one
 * ------------------------------------------------------------------ */

describe('whyFor — abandon-kindness', () => {
  it('an abandoned session always gets the kind restart', () => {
    const r = record({ outcome: 'abandoned', actualMin: 7 });
    const why = whyFor(r, [...history(), r], []);
    expect(why.evidenceKey).toBe('kind-restart');
  });

  it('takes precedence over every pattern rule', () => {
    const r = record({ outcome: 'abandoned' });
    // Late drifts that would otherwise fire the attention-fades rule.
    const events = [drift(r.id, 18), drift(r.id, 21)];
    expect(whyFor(r, [...history(), r], events).evidenceKey).toBe('kind-restart');
  });
});

describe('whyFor — late-drift pattern', () => {
  it('fires when most of the session’s drifts are late', () => {
    const r = record();
    const events = [drift(r.id, 18), drift(r.id, 21), drift(r.id, 4)];
    const why = whyFor(r, [r], events);
    expect(why.evidenceKey).toBe('attention-fades');
  });

  it('needs at least two drifts — one late drift is not a pattern', () => {
    const r = record();
    const why = whyFor(r, [r], [drift(r.id, 21)]);
    expect(why.evidenceKey).not.toBe('attention-fades');
  });

  it('does not fire when drifts cluster early', () => {
    const r = record();
    const events = [drift(r.id, 2), drift(r.id, 4)];
    expect(whyFor(r, [r], events).evidenceKey).not.toBe('attention-fades');
  });
});

describe('whyFor — first-drift timing', () => {
  it('fires when this session’s first drift lands near the personal median', () => {
    const past = history(5);
    const events = past.map((p) => drift(p.id, 10));
    const r = record();
    const all = [...events, drift(r.id, 8)];
    const why = whyFor(r, [...past, r], all);
    expect(why.evidenceKey).toBe('breaks-are-fuel');
    expect(why.text).toContain('minute 8');
  });

  it('stays quiet below the signal threshold', () => {
    const p = record();
    const r = record();
    const events = [drift(p.id, 10), drift(r.id, 8)];
    expect(whyFor(r, [p, r], events).evidenceKey).not.toBe('breaks-are-fuel');
  });

  it('never claims "your usual" off this session’s own drift alone', () => {
    // Enough sessions for signal, but no prior session ever drifted — the
    // only drift on record belongs to the session being explained.
    const past = history(5);
    const r = record();
    const events = [drift(r.id, 12)];
    expect(whyFor(r, [...past, r], events).evidenceKey).not.toBe('breaks-are-fuel');
  });

  it('never calls one prior drift a personal usual', () => {
    const past = history(5);
    const r = record();
    const events = [drift(past[0].id, 10), drift(r.id, 11)];
    expect(whyFor(r, [...past, r], events).evidenceKey).not.toBe('breaks-are-fuel');
  });

  it('stays quiet when the first drift is far from the median', () => {
    const past = history(5);
    const events = past.map((p) => drift(p.id, 20));
    const r = record();
    const all = [...events, drift(r.id, 3)];
    expect(whyFor(r, [...past, r], all).evidenceKey).not.toBe('breaks-are-fuel');
  });

  it('prefers the user’s own onset estimate over the detection minute', () => {
    const past = history(5);
    const events = past.map((p) => drift(p.id, 10));
    const r = record();
    // Detected at 22 (far), but the user says it began around 9 (near).
    const all = [...events, drift(r.id, 22, { estOnsetMin: 9 })];
    const why = whyFor(r, [...past, r], all);
    expect(why.evidenceKey).toBe('breaks-are-fuel');
    expect(why.text).toContain('minute 9');
  });
});

describe('whyFor — golden-hour match', () => {
  it('fires when a completed session started in a reliably strong hour', () => {
    const past = history(5, 9); // five 9 am completions
    const r = record({ startHour: 9 });
    const why = whyFor(r, [...past, r], []);
    expect(why.evidenceKey).toBe('golden-hours');
    expect(why.text).toContain('9 am');
  });

  it('does not let the current session create its own strong-hour sample', () => {
    const sameHour = [
      record({ startHour: 9, outcome: 'completed' }),
      record({ startHour: 9, outcome: 'completed' }),
    ];
    const otherHours = history(5, 14);
    const r = record({ startHour: 9, outcome: 'completed' });
    expect(whyFor(r, [...sameHour, ...otherHours, r], []).evidenceKey).not.toBe('golden-hours');
  });

  it('needs enough samples in that hour bucket', () => {
    // Enough records overall, but only this one at 21h.
    const past = history(5, 9);
    const r = record({ startHour: 21 });
    expect(whyFor(r, [...past, r], []).evidenceKey).not.toBe('golden-hours');
  });

  it('does not fire when the hour completes poorly', () => {
    const past = [
      record({ startHour: 9, outcome: 'abandoned' }),
      record({ startHour: 9, outcome: 'abandoned' }),
      record({ startHour: 9, outcome: 'interrupted' }),
      record({ startHour: 9 }),
      record({ startHour: 9 }),
    ];
    const r = record({ startHour: 9 });
    // Abandoned records don't reach this rule for *this* session, so make the
    // session itself completed; the bucket rate (3/6) is below threshold.
    expect(whyFor(r, [...past, r], []).evidenceKey).not.toBe('golden-hours');
  });
});

describe('whyFor — short-session success', () => {
  it('celebrates a completed tiny-mode session', () => {
    const r = record({ mode: 'tiny', plannedMin: 5, actualMin: 5 });
    expect(whyFor(r, [r], []).evidenceKey).toBe('tiny-start');
  });

  it('celebrates a completed short focus block', () => {
    const r = record({ plannedMin: 15, actualMin: 15 });
    expect(whyFor(r, [r], []).evidenceKey).toBe('tiny-start');
  });

  it('does not fire for a normal-length session', () => {
    const r = record({ plannedMin: 25 });
    expect(whyFor(r, [r], []).evidenceKey).not.toBe('tiny-start');
  });
});

describe('whyFor — low-signal fallback', () => {
  it('a fresh user with one plain session gets the learning line', () => {
    const r = record();
    const why = whyFor(r, [r], []);
    expect(why.evidenceKey).toBe('still-learning');
  });

  it('a flow session with no drifts and thin history also falls back', () => {
    const r = record({ mode: 'flow', plannedMin: null, actualMin: 31 });
    expect(whyFor(r, [r], []).evidenceKey).toBe('still-learning');
  });
});

/* ------------------------------------------------------------------ *
 * Cross-cutting guarantees
 * ------------------------------------------------------------------ */

/** One representative fixture per rule, so every copy string gets exercised. */
function oneOfEach(): WhyInsight[] {
  const out: WhyInsight[] = [];
  const abandoned = record({ outcome: 'abandoned' });
  out.push(whyFor(abandoned, [abandoned], []));
  const late = record();
  out.push(whyFor(late, [late], [drift(late.id, 18), drift(late.id, 21)]));
  const past = history(5);
  const timing = record();
  out.push(
    whyFor(
      timing,
      [...past, timing],
      [...past.map((p) => drift(p.id, 10)), drift(timing.id, 8)],
    ),
  );
  const golden = record({ startHour: 9 });
  out.push(whyFor(golden, [...history(5, 9), golden], []));
  const tiny = record({ mode: 'tiny', plannedMin: 5, actualMin: 5 });
  out.push(whyFor(tiny, [tiny], []));
  const fresh = record();
  out.push(whyFor(fresh, [fresh], []));
  return out;
}

describe('whyFor — guarantees', () => {
  it('covers all six rules across the representative fixtures', () => {
    const keys = new Set(oneOfEach().map((w) => w.evidenceKey));
    const expected: WhyEvidenceKey[] = [
      'kind-restart',
      'attention-fades',
      'breaks-are-fuel',
      'golden-hours',
      'tiny-start',
      'still-learning',
    ];
    for (const k of expected) expect(keys).toContain(k);
  });

  it('every evidence key resolves to a science.md anchor', () => {
    for (const w of oneOfEach()) {
      expect(WHY_EVIDENCE_ANCHORS[w.evidenceKey]).toMatch(/^docs\/science\.md#/);
    }
  });

  it('no rule copy uses the never-ship lexicon (docs/voice.md)', () => {
    const banned =
      /\b(fail|failure|failed|broke|broken|lazy|wasted|discipline|willpower|guilty|shame|excuses|optimal|proven|detox|lost|lose)\b|you should|back to zero|break the chain|protect your streak|we missed you/i;
    for (const w of oneOfEach()) expect(w.text).not.toMatch(banned);
    for (const explainer of Object.values(EVIDENCE_EXPLAINERS)) {
      expect(`${explainer.title} ${explainer.text}`).not.toMatch(banned);
    }
  });
});
