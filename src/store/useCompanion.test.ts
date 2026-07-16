import { describe, expect, it } from 'vitest';

import { formatCompanionSummary, tracksCompanionTabReturn } from './useCompanion';

describe('companion return tracking policy', () => {
  it('covers Focus and Tiny countdown work, but leaves Flow out', () => {
    expect(tracksCompanionTabReturn('focus')).toBe(true);
    expect(tracksCompanionTabReturn('tiny')).toBe(true);
    expect(tracksCompanionTabReturn('flow')).toBe(false);
    expect(tracksCompanionTabReturn('short')).toBe(false);
  });
});

describe('companion session summary', () => {
  it('states both outcomes without praising an absence of drift', () => {
    expect(formatCompanionSummary(2, 0)).toBe('2 focused check-ins, noted ♡');
    expect(formatCompanionSummary(2, 1)).toBe('2 focused · 1 drift, noted ♡');
    expect(formatCompanionSummary(0, 0)).toBeNull();
  });
});
