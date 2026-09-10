import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIENDS, appIconAliasForFriend, appIconNameForFriend } from '../data/friends';
import { SPRITES } from '../engine/spriteData';

interface SelectOptions {
  name: string | null;
}

const getPlatform = vi.fn(() => 'web');
const select = vi.fn(async (_options: SelectOptions) => ({
  supported: true,
  changed: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({ select }),
}));

// Imported after the mock so the module registers against the fake plugin.
const { isNativeAppIconPlatform, nativeAppIconTarget, selectNativeAppIcon } = await import(
  './appIcon'
);

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

  it('gives every friend a distinct Android alias and launcher resource', () => {
    // Android has no primary/alternate split: every friend needs an alias,
    // Mochi included, because exactly one alias is enabled at a time.
    const aliases = FRIENDS.map((friend) => friend.appIcon.alias);
    const resources = FRIENDS.map((friend) => friend.appIcon.res);
    expect(new Set(aliases).size).toBe(FRIENDS.length);
    expect(new Set(resources).size).toBe(FRIENDS.length);
    for (const alias of aliases) expect(alias).toMatch(/^Bloom[A-Za-z]+$/);
    // Android resource names allow lowercase, digits, and underscores only.
    for (const res of resources) expect(res).toMatch(/^ic_launcher_[a-z0-9_]+$/);
  });

  it('draws every icon from a sprite the app actually ships', () => {
    for (const friend of FRIENDS) {
      expect(SPRITES[friend.sprite]).toBeTruthy();
      expect(friend.appIcon.from).toMatch(/^#[0-9a-f]{6}$/);
      expect(friend.appIcon.to).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('maps an unknown friend back to the first friend instead of a missing asset', () => {
    expect(appIconNameForFriend('Mochi')).toBeNull();
    expect(appIconNameForFriend('Luna')).toBe('AppIcon-Luna');
    expect(appIconNameForFriend('Nobody')).toBeNull();

    expect(appIconAliasForFriend('Mochi')).toBe('BloomMochi');
    expect(appIconAliasForFriend('Luna')).toBe('BloomLuna');
    expect(appIconAliasForFriend('Nobody')).toBe('BloomMochi');
  });
});

describe('native app icon bridge', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    select.mockClear();
    select.mockResolvedValue({ supported: true, changed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is inert on the web and never reaches the native bridge', async () => {
    getPlatform.mockReturnValue('web');
    expect(isNativeAppIconPlatform()).toBe(false);
    await expect(selectNativeAppIcon('Luna')).resolves.toEqual({
      supported: false,
      changed: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('asks iOS for the on-duty friend’s alternate icon', async () => {
    await selectNativeAppIcon('Snappy');
    expect(select).toHaveBeenCalledWith({ name: 'AppIcon-Snappy' });
  });

  it('clears the alternate icon when the primary friend comes back on duty', async () => {
    await selectNativeAppIcon('Mochi');
    expect(select).toHaveBeenCalledWith({ name: null });
  });

  it('asks Android for the on-duty friend’s launcher alias', async () => {
    getPlatform.mockReturnValue('android');
    expect(isNativeAppIconPlatform()).toBe(true);
    await selectNativeAppIcon('Snappy');
    expect(select).toHaveBeenCalledWith({ name: 'BloomSnappy' });
  });

  it('names an alias for Mochi on Android rather than clearing one', async () => {
    // Sending iOS's `null` to Android would leave whichever friend was showing
    // on the home screen, because there is no alias to fall back to.
    getPlatform.mockReturnValue('android');
    await selectNativeAppIcon('Mochi');
    expect(select).toHaveBeenCalledWith({ name: 'BloomMochi' });
  });

  it('never crosses the two platforms’ naming namespaces', () => {
    getPlatform.mockReturnValue('ios');
    expect(nativeAppIconTarget('Luna')).toBe('AppIcon-Luna');
    getPlatform.mockReturnValue('android');
    expect(nativeAppIconTarget('Luna')).toBe('BloomLuna');
    getPlatform.mockReturnValue('web');
    expect(nativeAppIconTarget('Luna')).toBeUndefined();
  });

  it('swallows a refused icon change so it cannot interrupt a session', async () => {
    select.mockRejectedValue(new Error('app is not active'));
    await expect(selectNativeAppIcon('Coral')).resolves.toEqual({
      supported: false,
      changed: false,
    });
  });
});
