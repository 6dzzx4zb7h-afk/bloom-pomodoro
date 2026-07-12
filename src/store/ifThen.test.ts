import { describe, expect, it } from 'vitest';

import {
  CUE_TYPES,
  IF_THEN_PLAN_CAP,
  IF_THEN_TEMPLATES,
  addIfThenPlan,
  markIfThenPlanUsed,
  removeIfThenPlan,
  sanitizeIfThenPlans,
  updateIfThenPlan,
  type IfThenPlan,
} from './ifThen';

const T0 = 1_700_000_000_000; // arbitrary fixed epoch so tests never read the clock

let seq = 0;

function plan(overrides: Partial<IfThenPlan> = {}): IfThenPlan {
  seq++;
  return {
    id: `p-${seq}`,
    cueType: 'time',
    cueText: "it's 9:00",
    actionText: 'open the doc and write one ugly sentence',
    usageCount: 0,
    lastUsedAt: null,
    createdAt: T0 + seq * 1000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

describe('IF_THEN_TEMPLATES', () => {
  it('ships one fill-in template per cue type', () => {
    expect(IF_THEN_TEMPLATES).toHaveLength(CUE_TYPES.length);
    expect(new Set(IF_THEN_TEMPLATES.map((t) => t.cueType))).toEqual(new Set(CUE_TYPES));
  });

  it('every template has non-empty hints', () => {
    for (const t of IF_THEN_TEMPLATES) {
      expect(t.cueHint.trim().length).toBeGreaterThan(0);
      expect(t.actionHint.trim().length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * addIfThenPlan
 * ------------------------------------------------------------------ */

describe('addIfThenPlan', () => {
  it('appends a plan with trimmed text and fresh counters', () => {
    const out = addIfThenPlan(
      [],
      { cueType: 'place', cueText: '  I sit at my desk  ', actionText: ' phone away, tiny start ' },
      T0,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      cueType: 'place',
      cueText: 'I sit at my desk',
      actionText: 'phone away, tiny start',
      usageCount: 0,
      lastUsedAt: null,
      createdAt: T0,
    });
    expect(out[0].id).toBeTruthy();
  });

  it('stores the optional taskId', () => {
    const out = addIfThenPlan(
      [],
      { cueType: 'time', cueText: 'a', actionText: 'b', taskId: 7 },
      T0,
    );
    expect(out[0].taskId).toBe(7);
  });

  it('refuses blank halves', () => {
    expect(addIfThenPlan([], { cueType: 'time', cueText: '   ', actionText: 'b' }, T0)).toEqual([]);
    expect(addIfThenPlan([], { cueType: 'time', cueText: 'a', actionText: '' }, T0)).toEqual([]);
  });

  it('refuses a bogus cue type', () => {
    const out = addIfThenPlan(
      [],
      { cueType: 'vibes' as never, cueText: 'a', actionText: 'b' },
      T0,
    );
    expect(out).toEqual([]);
  });

  it('caps the list and truncates very long text', () => {
    const full = Array.from({ length: IF_THEN_PLAN_CAP }, () => plan());
    expect(addIfThenPlan(full, { cueType: 'time', cueText: 'a', actionText: 'b' }, T0)).toBe(full);

    const long = 'x'.repeat(500);
    const out = addIfThenPlan([], { cueType: 'time', cueText: long, actionText: long }, T0);
    expect(out[0].cueText.length).toBeLessThanOrEqual(120);
    expect(out[0].actionText.length).toBeLessThanOrEqual(120);
  });

  it('does not mutate the input list', () => {
    const before: IfThenPlan[] = [plan()];
    const snapshot = [...before];
    addIfThenPlan(before, { cueType: 'time', cueText: 'a', actionText: 'b' }, T0);
    expect(before).toEqual(snapshot);
  });
});

/* ------------------------------------------------------------------ *
 * updateIfThenPlan
 * ------------------------------------------------------------------ */

describe('updateIfThenPlan', () => {
  it('edits text, cue type, and task on the matching plan only', () => {
    const a = plan();
    const b = plan();
    const out = updateIfThenPlan([a, b], b.id, {
      cueType: 'obstacle',
      cueText: ' new cue ',
      actionText: 'new action',
      taskId: 3,
    });
    expect(out[0]).toEqual(a);
    expect(out[1]).toMatchObject({
      cueType: 'obstacle',
      cueText: 'new cue',
      actionText: 'new action',
      taskId: 3,
    });
    // Usage history survives edits.
    expect(out[1].usageCount).toBe(b.usageCount);
    expect(out[1].createdAt).toBe(b.createdAt);
  });

  it('keeps the old value when an edit blanks a half or picks a bogus cue', () => {
    const p = plan();
    const out = updateIfThenPlan([p], p.id, {
      cueText: '   ',
      actionText: '',
      cueType: 'nope' as never,
    });
    expect(out[0].cueText).toBe(p.cueText);
    expect(out[0].actionText).toBe(p.actionText);
    expect(out[0].cueType).toBe(p.cueType);
  });

  it('is a no-op for unknown ids', () => {
    const p = plan();
    expect(updateIfThenPlan([p], 'nope', { cueText: 'x' })[0]).toEqual(p);
  });
});

/* ------------------------------------------------------------------ *
 * removeIfThenPlan / markIfThenPlanUsed
 * ------------------------------------------------------------------ */

describe('removeIfThenPlan', () => {
  it('removes only the matching plan', () => {
    const a = plan();
    const b = plan();
    expect(removeIfThenPlan([a, b], a.id)).toEqual([b]);
    expect(removeIfThenPlan([a, b], 'nope')).toEqual([a, b]);
  });
});

describe('markIfThenPlanUsed', () => {
  it('bumps usage and stamps lastUsedAt on the matching plan only', () => {
    const a = plan({ usageCount: 2 });
    const b = plan();
    const out = markIfThenPlanUsed([a, b], a.id, T0 + 5000);
    expect(out[0].usageCount).toBe(3);
    expect(out[0].lastUsedAt).toBe(T0 + 5000);
    expect(out[1]).toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * sanitizeIfThenPlans
 * ------------------------------------------------------------------ */

describe('sanitizeIfThenPlans', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeIfThenPlans(undefined)).toEqual([]);
    expect(sanitizeIfThenPlans(null)).toEqual([]);
    expect(sanitizeIfThenPlans('plans')).toEqual([]);
    expect(sanitizeIfThenPlans({})).toEqual([]);
  });

  it('keeps valid plans and drops malformed entries individually', () => {
    const good = plan();
    const raw = [
      good,
      null,
      42,
      { ...plan(), cueType: 'vibes' },
      { ...plan(), cueText: '   ' },
      { ...plan(), usageCount: -1 },
      { ...plan(), lastUsedAt: 'yesterday' },
      { ...plan(), createdAt: Infinity },
    ];
    expect(sanitizeIfThenPlans(raw)).toEqual([good]);
  });

  it('accepts a used plan with a numeric lastUsedAt and optional taskId', () => {
    const used = plan({ usageCount: 4, lastUsedAt: T0, taskId: 2 });
    expect(sanitizeIfThenPlans([used])).toEqual([used]);
  });

  it('caps an oversized list', () => {
    const raw = Array.from({ length: IF_THEN_PLAN_CAP + 10 }, () => plan());
    expect(sanitizeIfThenPlans(raw)).toHaveLength(IF_THEN_PLAN_CAP);
  });
});
