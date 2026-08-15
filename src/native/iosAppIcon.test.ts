import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIENDS, appIconNameForFriend } from '../data/friends';
import { SPRITES } from '../engine/spriteData';

interface SelectOptions {
  name: string | null;
}

const getPlatform = vi.fn(() => 'web');
const select = vi.fn(async (options: SelectOptions) => {
  void options;
  return {
    supported: true,
    changed: true,
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({ select }),
}));

// Imported after the mock so the module registers against the fake plugin.
const { isNativeAppIconPlatform, selectNativeAppIcon } = await import('./iosAppIcon');

describe('friend app icon identity', () => {
  it('gives exactly one friend the primary icon', () => {
    const primary = FRIENDS.filter((friend) => friend.appIcon.icon === null);
    expect(primary.map((friend) => friend.name)).toEqual(['Mochi']);
    expect(primary[0].sprite).toBe('bunny');
  });

  it('gives every other friend a distinct alternate icon name', () => {
    const alternates = FRIENDS.map((friend) => friend.appIcon.icon).filter(
      (name): name is string => name !== null,
    );
    expect(alternates).toHaveLength(FRIENDS.length - 1);
    expect(new Set(alternates).size).toBe(alternates.length);
    for (const name of alternates) expect(name).toMatch(/^AppIcon-[A-Za-z]+$/);
  });

  it('draws every icon from a sprite the app actually ships', () => {
    for (const friend of FRIENDS) {
      expect(SPRITES[friend.sprite]).toBeTruthy();
      expect(friend.appIcon.from).toMatch(/^#[0-9a-f]{6}$/);
      expect(friend.appIcon.to).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('maps an unknown friend back to the primary icon instead of a missing asset', () => {
    expect(appIconNameForFriend('Mochi')).toBeNull();
    expect(appIconNameForFriend('Luna')).toBe('AppIcon-Luna');
    expect(appIconNameForFriend('Nobody')).toBeNull();
  });
});

describe('native iOS app icon bridge', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    select.mockClear();
    select.mockResolvedValue({ supported: true, changed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is inert off iOS and never reaches the native bridge', async () => {
    getPlatform.mockReturnValue('web');
    expect(isNativeAppIconPlatform()).toBe(false);
    await expect(selectNativeAppIcon('Luna')).resolves.toEqual({
      supported: false,
      changed: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('asks iOS for the on-duty friend’s icon', async () => {
    await selectNativeAppIcon('Snappy');
    expect(select).toHaveBeenCalledWith({ name: 'AppIcon-Snappy' });
  });

  it('clears the alternate icon when the primary friend comes back on duty', async () => {
    await selectNativeAppIcon('Mochi');
    expect(select).toHaveBeenCalledWith({ name: null });
  });

  it('swallows a refused icon change so it cannot interrupt a session', async () => {
    select.mockRejectedValue(new Error('app is not active'));
    await expect(selectNativeAppIcon('Coral')).resolves.toEqual({
      supported: false,
      changed: false,
    });
  });
});
