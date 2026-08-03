import { describe, expect, it } from 'vitest';
import {
  isNativeCollectionSection,
  isNativeTabScreen,
  isNativeTimerMode,
} from './iosTabs';

describe('native iOS tab bridge', () => {
  it('accepts every React screen owned by the native tab bar', () => {
    for (const screen of ['focus', 'tasks', 'history', 'goals', 'collection']) {
      expect(isNativeTabScreen(screen)).toBe(true);
    }
  });

  it('rejects unknown native messages before they reach app navigation', () => {
    expect(isNativeTabScreen('settings')).toBe(false);
    expect(isNativeTabScreen('')).toBe(false);
  });

  it('accepts only reducer-owned timer modes', () => {
    for (const mode of ['focus', 'flow', 'tiny', 'short', 'long']) {
      expect(isNativeTimerMode(mode)).toBe(true);
    }
    expect(isNativeTimerMode('break')).toBe(false);
  });

  it('accepts only collection section identifiers', () => {
    expect(isNativeCollectionSection('friends')).toBe(true);
    expect(isNativeCollectionSection('guide')).toBe(true);
    expect(isNativeCollectionSection('tasks')).toBe(false);
  });
});
