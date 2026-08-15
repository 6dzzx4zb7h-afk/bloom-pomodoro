import { Capacitor, registerPlugin } from '@capacitor/core';
import { appIconNameForFriend } from '../data/friends';

/**
 * PLAN 13.9 — the iOS home-screen icon follows the friend on duty.
 *
 * Bloom ships one app icon per friend. Mochi's art is the primary icon, so
 * putting Mochi back on duty means clearing the alternate rather than setting
 * one. All the art is bundled; changing the icon makes no request.
 */
export interface NativeAppIconResult {
  /** False on devices or systems that do not allow alternate icons. */
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
  return Capacitor.getPlatform() === 'ios';
}

/**
 * Put the named friend on the home screen. Resolves rather than rejects when
 * the platform has no alternate icons, or when iOS refuses the change (it does
 * while the app is backgrounded) — the icon is decoration, and a failed change
 * must never interrupt a focus session. The next reconcile tries again.
 */
export async function selectNativeAppIcon(
  friendName: string,
): Promise<NativeAppIconResult> {
  if (!isNativeAppIconPlatform()) return UNSUPPORTED;
  try {
    return await bloomAppIcon.select({ name: appIconNameForFriend(friendName) });
  } catch {
    return UNSUPPORTED;
  }
}
