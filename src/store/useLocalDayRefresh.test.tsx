/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalDayRefresh } from './useLocalDayRefresh';

describe('useLocalDayRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it('refreshes at midnight without remounting', () => {
    const before = new Date(2026, 6, 19, 23, 59, 59, 900);
    vi.setSystemTime(before);
    const hook = renderHook(() => useLocalDayRefresh());

    act(() => vi.advanceTimersByTime(101));

    expect(hook.result.current).toBe(before.getTime() + 101);
    expect(new Date(hook.result.current).getDate()).toBe(20);
  });

  it('honors a configured study-day boundary', () => {
    const before = new Date(2026, 6, 19, 3, 59, 59, 900);
    vi.setSystemTime(before);
    const hook = renderHook(() => useLocalDayRefresh(4));

    act(() => vi.advanceTimersByTime(101));

    expect(hook.result.current).toBe(before.getTime() + 101);
    expect(new Date(hook.result.current).getHours()).toBe(4);
  });

  it('catches up on foreground and only on visible visibility changes', () => {
    vi.setSystemTime(new Date(2026, 6, 19, 9, 0, 0));
    const hook = renderHook(() => useLocalDayRefresh());
    const initial = hook.result.current;

    vi.setSystemTime(new Date(2026, 6, 19, 10, 0, 0));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(hook.result.current).toBe(initial);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(hook.result.current).toBe(Date.now());

    vi.setSystemTime(new Date(2026, 6, 19, 11, 0, 0));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(hook.result.current).toBe(Date.now());
  });
});
