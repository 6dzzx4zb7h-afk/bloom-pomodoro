import { describe, expect, it } from 'vitest';

import { WHY_EVIDENCE_ANCHORS, EVIDENCE_EXPLAINERS } from '../insights/why';
import {
  computeAttentionPlan,
  RECIPE_MIN_SIGNALS,
  type CompanionEvent,
  type DriftKind,
  type RecipeItem,
} from './companion';

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

const plan = (events: CompanionEvent[], focusLen = 25) =>
  computeAttentionPlan(events, focusLen, NOW);

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
  out.push(...plan([...focusedAt(9, 4), ...driftsOf('urge', 3, 10, 23)]));
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

  it('the golden-hours line cites the bucket’s own tallies', () => {
    const items = plan([...focusedAt(9, 4), ...driftsOf('urge', 3, 10, 23)]);
    const golden = items.find((i) => i.emoji === '🌤️');
    const foggy = items.find((i) => i.emoji === '🌙');
    expect(golden!.because).toContain('4 of your 4 mornings');
    expect(golden!.evidenceKey).toBe('golden-hours');
    expect(foggy!.because).toContain('0 of your 3 nights');
  });

  it('recipe copy avoids the never-ship lexicon (docs/voice.md)', () => {
    const banned =
      /\b(fail|failure|failed|broke|broken|lazy|wasted|discipline|willpower|guilty|shame|excuses|optimal|proven|detox|lost|lose)\b|you should|back to zero|break the chain|protect your streak|we missed you/i;
    for (const item of oneOfEach()) {
      expect(item.text).not.toMatch(banned);
      expect(item.because).not.toMatch(banned);
    }
  });
});
