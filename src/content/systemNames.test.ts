import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'web');

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
}));

const { currentNativeOS, osName, systemSettingsName } = await import('./platformWords');

/**
 * Bloom now schedules the same finish alert and the same live countdown on
 * both phones, so the notes that describe them have to name the right system.
 * `docs/voice.md` asks for advice the reader can act on, and telling someone
 * holding a Pixel to open iOS Settings is advice they cannot follow.
 */
describe('naming the system a note points at', () => {
  beforeEach(() => getPlatform.mockReturnValue('web'));

  it('names each native shell it actually runs in', () => {
    getPlatform.mockReturnValue('ios');
    expect(currentNativeOS()).toBe('ios');
    expect(osName()).toBe('iOS');
    expect(systemSettingsName()).toBe('iOS Settings');

    getPlatform.mockReturnValue('android');
    expect(currentNativeOS()).toBe('android');
    expect(osName()).toBe('Android');
    expect(systemSettingsName()).toBe('Android Settings');
  });

  it('never sends a browser reader to a phone settings app', () => {
    expect(currentNativeOS()).toBe('none');
    expect(systemSettingsName()).not.toContain('iOS');
    expect(systemSettingsName()).not.toContain('Android');
    expect(systemSettingsName()).toBe('your device settings');
  });
});
