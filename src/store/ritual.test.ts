import { describe, expect, it } from 'vitest';
import { DEFAULT_RITUAL, sanitizeRitual, updateRitualItem } from './ritual';

describe('ritual settings', () => {
  it('keeps internal spaces in a committed ritual item', () => {
    const items = updateRitualItem(DEFAULT_RITUAL.items, 'task', '  name the next action  ');

    expect(items.find((item) => item.id === 'task')?.text).toBe('name the next action');
  });

  it('does not replace an item with a blank committed value', () => {
    expect(updateRitualItem(DEFAULT_RITUAL.items, 'task', '   ')).toBe(DEFAULT_RITUAL.items);
  });

  it('preserves valid user-edited items while sanitizing stored data', () => {
    const ritual = sanitizeRitual({
      enabled: true,
      suggestionSeen: true,
      items: [{ id: 'desk', text: '  clear a little desk space  ' }],
    });

    expect(ritual).toEqual({
      enabled: true,
      suggestionSeen: true,
      items: [{ id: 'desk', text: 'clear a little desk space' }],
    });
  });
});
