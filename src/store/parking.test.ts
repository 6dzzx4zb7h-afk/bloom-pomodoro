import { describe, expect, it } from 'vitest';
import {
  addParkedThought,
  limitParkingDraft,
  normalizeParkingText,
  removeParkedThought,
  revealAllParkedThoughts,
  revealParkedThoughts,
  sanitizeParkedThoughts,
} from './parking';

describe('parking lot helpers', () => {
  it('stores a compact five-word thought hidden under its session', () => {
    const items = addParkedThought([], '  look up the shiny reference later please  ', 's-1', 100);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      text: 'look up the shiny reference',
      sessionId: 's-1',
      parkedAt: 100,
      revealedAt: null,
    });
    expect(normalizeParkingText('   ')).toBe('');
    expect(limitParkingDraft('one two three four five six')).toBe('one two three four five');
  });

  it('reveals only the thoughts from the session that ended', () => {
    const first = addParkedThought([], 'first little thought', 's-1', 100);
    const both = addParkedThought(first, 'second little thought', 's-2', 200);
    const revealed = revealParkedThoughts(both, 's-1', 300);

    expect(revealed[0].revealedAt).toBe(300);
    expect(revealed[1].revealedAt).toBeNull();
    expect(revealAllParkedThoughts(revealed, 400).map((item) => item.revealedAt)).toEqual([
      300,
      400,
    ]);
  });

  it('sanitizes persisted entries and removes a resolved thought', () => {
    const valid = {
      id: 'p-1',
      text: 'a thought for later',
      parkedAt: 100,
      sessionId: 's-1',
      revealedAt: 200,
    };
    const sanitized = sanitizeParkedThoughts([valid, { nope: true }]);
    expect(sanitized).toEqual([valid]);
    expect(removeParkedThought(sanitized, 'p-1')).toEqual([]);
  });
});
