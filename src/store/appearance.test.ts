import { describe, expect, it, vi } from 'vitest';

import {
  SYSTEM_DARK_QUERY,
  isAppearanceMode,
  readSystemNight,
  resolveNight,
  watchSystemNight,
} from './appearance';

function mediaQuery(initial: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const query = {
    matches: initial,
    media: SYSTEM_DARK_QUERY,
    onchange: null,
    addEventListener: vi.fn((_name: string, next: (event: MediaQueryListEvent) => void) => {
      listener = next;
    }),
    removeEventListener: vi.fn((_name: string, next: (event: MediaQueryListEvent) => void) => {
      if (listener === next) listener = null;
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  return {
    query,
    change(matches: boolean) {
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('appearance preference', () => {
  it('accepts only the three shipped modes and resolves fixed modes independently', () => {
    expect(['day', 'night', 'system'].every(isAppearanceMode)).toBe(true);
    expect(isAppearanceMode('sunrise')).toBe(false);
    expect(resolveNight('day', true)).toBe(false);
    expect(resolveNight('night', false)).toBe(true);
    expect(resolveNight('system', true)).toBe(true);
  });

  it('reads, follows, and unsubscribes from the system preference', () => {
    const media = mediaQuery(false);
    const matchMedia = vi.fn(() => media.query);
    const onChange = vi.fn();

    expect(readSystemNight(matchMedia)).toBe(false);
    const stop = watchSystemNight(onChange, matchMedia);
    expect(matchMedia).toHaveBeenCalledWith(SYSTEM_DARK_QUERY);
    expect(onChange).toHaveBeenCalledWith(false);

    media.change(true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    stop();
    media.change(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('uses the day sky when the environment has no system preference API', () => {
    const onChange = vi.fn();
    expect(readSystemNight(null)).toBe(false);
    expect(watchSystemNight(onChange, null)).toBeTypeOf('function');
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
