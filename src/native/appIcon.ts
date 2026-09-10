import { Capacitor, registerPlugin } from '@capacitor/core';
import { appIconAliasForFriend, appIconNameForFriend } from '../data/friends';

/**
 * PLAN 13.9 (iOS), PLAN 13.18 (Android) — the home-screen icon follows the
 * friend on duty.
 *
 * Bloom ships one app icon per friend on both platforms, and all of the art is
 * bundled, so changing the icon makes no request.
 *
 * The two systems name the target differently, which is why `select` takes an
 * opaque `name` each platform reads in its own namespace:
 *
 *   iOS      — the asset-catalog name of an alternate icon, or `null` for the
 *              primary icon, which is Mochi's art.
 *   Android  — the `<activity-alias>` short class name to leave enabled. There
 *              is no primary alias, so Mochi names one too.
 */
export interface NativeAppIconResult {
  /** False on devices or systems that do not allow the icon to change. */
  supported: boolean;
  /** False when the requested icon was already the one on the home screen. */
  changed: boolean;
}

interface BloomAppIconPlugin {
  select(options: { name: string | null }): Promise<NativeAppIconResult>;
}

const bloomAppIcon = registerPlugin<BloomAppIconPlugin>('BloomAppIcon');

const UNSUPPORTED: NativeAppIconResult = { supported: false, changed: false };

export function isNativeAppIconPlatform(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android';
}

/**
 * What to hand the native side for `friendName` on the current platform, or
 * `undefined` off the native platforms. Exported for the tests that prove the
 * two namespaces do not get crossed.
 */
export function nativeAppIconTarget(friendName: string): string | null | undefined {
  switch (Capacitor.getPlatform()) {
    case 'ios':
      return appIconNameForFriend(friendName);
    case 'android':
      return appIconAliasForFriend(friendName);
    default:
      return undefined;
  }
}

/**
 * Put the named friend on the home screen. Resolves rather than rejects when
 * the platform cannot change its icon, or when the system refuses (iOS does
 * while the app is backgrounded) — the icon is decoration, and a failed change
 * must never interrupt a focus session. The next reconcile tries again.
 */
export async function selectNativeAppIcon(
  friendName: string,
): Promise<NativeAppIconResult> {
  const name = nativeAppIconTarget(friendName);
  if (name === undefined) return UNSUPPORTED;
  try {
    return await bloomAppIcon.select({ name });
  } catch {
    return UNSUPPORTED;
  }
}
