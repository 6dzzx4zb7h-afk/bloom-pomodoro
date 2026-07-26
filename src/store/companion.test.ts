import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WHY_EVIDENCE_ANCHORS, EVIDENCE_EXPLAINERS } from '../insights/why';
import {
  appendDriftEvent,
  companionEventsForAnalytics,
  computeAttentionPlan,
  computeInsights,
  isClassifiedDriftEvent,
  isDriftEvent,
  loadEvents,
  RECIPE_MIN_SIGNALS,
  updateEvent,
  type AttentionPlanContext,
  type CompanionEvent,
  type DriftKind,
  type RecipeItem,
  type StartHourCompletion,
} from './companion';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ *
 * Synthetic fixtures — a fixed clock, events placed at chosen local
 * hours so the time-of-day buckets are deterministic.
 * ------------------------------------------------------------------ */

const NOW = new Date(2023, 5, 15, 12, 0, 0).getTime();

let seq = 0;

function ev(
  kind: CompanionEvent['kind'],
  { min = 10, len = 25, hour = 9, daysAgo = 1 }: Partial<{ min: number; len: number; hour: number; daysAgo: number }> = {},
): CompanionEvent {
  seq++;
  const d = new Date(2023, 5, 15 - daysAgo, hour, 0, 0);
  return {
    id: `e-${seq}`,
    ts: d.getTime() + seq, // unique, order-stable
    min,
    len,
    kind,
    src: kind === 'away' ? 'return' : 'checkin',
  };
}

const focusedAt = (hour: number, n: number) =>
  Array.from({ length: n }, () => ev('focused', { hour }));

const driftsOf = (kind: DriftKind, n: number, min: number, hour = 9) =>
  Array.from({ length: n }, () => ev(kind, { min, hour }));

const completionAt = (hour: number, completed: number, total: number): StartHourCompletion => ({
  hour,
  completed,
  total,
  rate: completed / total,
});

const plan = (
  events: CompanionEvent[],
  focusLen = 25,
  context?: AttentionPlanContext,
) => computeAttentionPlan(events, focusLen, NOW, 28, context);

describe('companion drift persistence', () => {
  it('persists the answer before triage and classifies that same event', () => {
    const stored = appendDriftEvent({
      ts: NOW,
      shownAt: NOW - 500,
      min: 8,
      len: 25,
      src: 'checkin',
      sessionId: 'session-1',
    });

    expect(loadEvents()).toEqual([
      expect.objectContaining({
        id: stored.id,
        kind: 'drift',
        sessionId: 'session-1',
      }),
    ]);

    updateEvent(stored.id, { kind: 'rabbit' });

    expect(loadEvents()).toEqual([
      expect.objectContaining({
        id: stored.id,
        kind: 'rabbit',
        sessionId: 'session-1',
      }),
    ]);
    expect(JSON.parse(localStorage.getItem('bloom-companion-v1')!).version).toBe(2);
  });

  it('keeps an unclassified answer as a real drift if triage never happens', () => {
    const drift = appendDriftEvent({
      ts: NOW,
      min: 6,
      len: 25,
      src: 'return',
      sessionId: 'session-2',
    });
    const [loaded] = loadEvents();

    expect(loaded).toEqual(drift);
    expect(isDriftEvent(loaded)).toBe(true);
    expect(isClassifiedDriftEvent(loaded)).toBe(false);
  });

  it('continues to read version-1 event blobs', () => {
    const old = ev('wander');
    localStorage.setItem(
      'bloom-companion-v1',
      JSON.stringify({ version: 1, events: [old] }),
    );

    expect(loadEvents()).toEqual([old]);
  });
});

describe('unclassified drift analytics', () => {
  it('counts unclassified answers in drift rates without inventing a cause', () => {
    const events = [
      ...focusedAt(9, 2),
      ev('rabbit'),
      ev('rabbit'),
      ev('drift'),
      ev('drift'),
      ev('drift'),
    ];
    const insights = computeInsights(events, NOW);

    expect(insights.answers).toBe(7);
    expect(insights.drifts).toBe(5);
    expect(insights.dominant).toBeNull();
  });

  it('uses only classified answers for a kind-specific recommendation', () => {
    const events = [
      ...driftsOf('rabbit', 3, 12),
      ev('drift', { min: 12 }),
      ev('drift', { min: 12 }),
    ];
    const strategy = plan(events).find((item) => item.evidenceKey === 'parking-lot');

    expect(strategy?.because).toContain('100% of your classified drifts');
  });

  it('includes unclassified answers when deciding whether a stretch experiment fits', () => {
    const items = plan([...focusedAt(9, 8), ev('drift'), ev('drift')]);

    expect(items.some((item) => item.emoji === '📈')).toBe(false);
  });
});

describe('analytics timestamp integrity', () => {
  it('uses prompt time for the window/hour and quarantines future answers', () => {
    const shownAt = new Date(2023, 5, 15, 9, 0, 0).getTime();
    const answeredAt = new Date(2023, 5, 15, 11, 0, 0).getTime();
    const delayed = Array.from({ length: 3 }, (_, index): CompanionEvent => ({
      id: `delayed-${index}`,
      ts: answeredAt + index,
      shownAt: shownAt + index,
      min: 5,
      len: 25,
      kind: 'focused',
      src: 'checkin',
    }));
    const future: CompanionEvent = {
      id: 'future',
      ts: NOW + 60_000,
      shownAt: NOW - 60_000,
      min: 10,
      len: 25,
      kind: 'wander',
      src: 'checkin',
    };

    expect(computeInsights([...delayed, future], NOW)).toMatchObject({
      answers: 3,
      drifts: 0,
      bestTime: 'mornings',
    });
  });

  it('clamps imported onset estimates to the session and last focused answer', () => {
    const events: CompanionEvent[] = [
      {
        id: 'focused',
        sessionId: 's-clamp',
        ts: NOW - 2_000,
        min: 8,
        len: 25,
        kind: 'focused',
        src: 'checkin',
      },
      {
        id: 'drift',
        sessionId: 's-clamp',
        ts: NOW - 1_000,
        min: 40,
        estOnsetMin: -12,
        len: 25,
        kind: 'wander',
        src: 'checkin',
      },
    ];

    expect(companionEventsForAnalytics(events, NOW)[1]).toMatchObject({
      min: 25,
      estOnsetMin: 8,
    });
  });
});

/* ------------------------------------------------------------------ *
 * PLAN 2.4 — every recommendation is explainable
 * ------------------------------------------------------------------ */

/** One fixture per rule, so every recipe line gets exercised. */
function oneOfEach(): RecipeItem[] {
  const out: RecipeItem[] = [];
  // late-fade + dominant-strategy (rabbit)
  out.push(...plan([...driftsOf('rabbit', 4, 20), ...focusedAt(9, 2)]));
  // early-cluster
  out.push(...plan([...driftsOf('wander', 4, 2), ...focusedAt(9, 2)]));
  // stretch (8 focused, no drifts)
  out.push(...plan(focusedAt(9, 8)));
  // golden + foggy hours
  out.push(
    ...plan([...focusedAt(9, 4), ...driftsOf('urge', 3, 10, 23)], 25, {
      chronotype: 'betterEarlier',
      completionByStartHour: [completionAt(9, 4, 4), completionAt(23, 0, 3)],
    }),
  );
  // quiet tab-aways
  out.push(...plan([...focusedAt(9, 4), ev('away'), ev('away'), ev('away')]));
  return out;
}

describe('computeAttentionPlan — explainability (PLAN 2.4)', () => {
  it('stays silent below the signal threshold', () => {
    expect(plan(focusedAt(9, RECIPE_MIN_SIGNALS - 1))).toEqual([]);
  });

  it('no recommendation appears without a because citing real numbers', () => {
    const items = oneOfEach();
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(item.because.length).toBeGreaterThan(0);
      expect(item.because).toMatch(/\d/); // the user's own numbers
    }
  });

  it('every evidence key resolves to an anchor and an explainer', () => {
    for (const item of oneOfEach()) {
      expect(WHY_EVIDENCE_ANCHORS[item.evidenceKey]).toMatch(/^docs\/science\.md#/);
      expect(EVIDENCE_EXPLAINERS[item.evidenceKey].title.length).toBeGreaterThan(0);
      expect(EVIDENCE_EXPLAINERS[item.evidenceKey].text.length).toBeGreaterThan(0);
    }
  });

  it('the late-fade line counts this user’s late drifts', () => {
    const items = plan([...driftsOf('wander', 3, 20), ev('wander', { min: 4 }), ...focusedAt(9, 2)]);
    const late = items.find((i) => i.evidenceKey === 'attention-fades');
    expect(late).toBeDefined();
    expect(late!.because).toContain('3 of your 4 drifts');
  });

  it('the dominant-strategy line carries the drift share and its phase', () => {
    const items = plan([...driftsOf('rabbit', 3, 12), ev('external', { min: 12 }), ...focusedAt(9, 2)]);
    const strat = items.find((i) => i.evidenceKey === 'parking-lot');
    expect(strat).toBeDefined();
    expect(strat!.because).toContain('75%');
    expect(strat!.because).toContain('rabbit holes');
    expect(strat!.because).toContain('mid-session');
  });

  it('the time-of-day line cites the bucket’s own tallies', () => {
    const items = plan([...focusedAt(9, 4), ...driftsOf('urge', 3, 10, 23)], 25, {
      chronotype: 'betterEarlier',
      completionByStartHour: [completionAt(9, 4, 4), completionAt(23, 0, 3)],
    });
    const golden = items.find((i) => i.emoji === '🌤️');
    const foggy = items.find((i) => i.emoji === '🌙');
    expect(golden!.because).toContain('you chose “better earlier”');
    expect(golden!.because).toContain('4 of your 4 sessions started in the morning');
    expect(golden!.evidenceKey).toBe('golden-hours');
    expect(foggy!.because).toContain('you chose “better earlier”');
    expect(foggy!.because).toContain('0 of your 3 sessions started in the night');
  });

  it('uses the self-tag as a light prior when observed completion rates tie', () => {
    const events = focusedAt(9, RECIPE_MIN_SIGNALS);
    const observed = [completionAt(9, 2, 3), completionAt(19, 2, 3)];
    const earlier = plan(events, 25, {
      chronotype: 'betterEarlier',
      completionByStartHour: observed,
    }).find((i) => i.emoji === '🌤️');
    const later = plan(events, 25, {
      chronotype: 'betterLater',
      completionByStartHour: observed,
    }).find((i) => i.emoji === '🌤️');

    expect(earlier?.text).toContain('mornings');
    expect(later?.text).toContain('evenings');
  });

  it('lets strong observed history outweigh the self-tag', () => {
    const golden = plan(focusedAt(9, RECIPE_MIN_SIGNALS), 25, {
      chronotype: 'betterLater',
      completionByStartHour: [completionAt(9, 8, 10), completionAt(19, 1, 3)],
    }).find((i) => i.emoji === '🌤️');

    expect(golden?.text).toContain('mornings');
    expect(golden?.because).toContain('you chose “better later”');
    expect(golden?.because).toContain('8 of your 10 sessions started in the morning');
  });

  it('recipe copy avoids the never-ship lexicon (docs/voice.md)', () => {
    const banned =
      /\b(fail|failure|failed|broke|broken|lazy|wasted|discipline|willpower|guilty|shame|excuses|optimal|proven|detox|lost|lose|weakness|wiggles)\b|you should|back to zero|break the chain|protect your streak|we missed you|all focused|hold focus really well|nice recovery|main pull/i;
    for (const item of oneOfEach()) {
      expect(item.text).not.toMatch(banned);
      expect(item.because).not.toMatch(banned);
    }
  });
});
