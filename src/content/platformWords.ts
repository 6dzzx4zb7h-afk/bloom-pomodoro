import { Capacitor } from '@capacitor/core';

/**
 * PLAN 13.15 — the same behaviour, named for the device it is happening on.
 *
 * Bloom's Companion notices when you leave and come back. In a browser that is
 * a tab switch; on an iPhone or iPad there are no tabs, and the same event is
 * leaving the app. The mechanism is identical either way — `visibilitychange`
 * fires in both, and time away is measured against the wall clock on return —
 * so this is about saying what actually happened, not about a capability gap.
 *
 * The suggestion copy matters more than the labels: "try fullscreen or a
 * separate desktop" is advice a phone cannot follow, and `docs/voice.md` asks
 * for a suggestion the reader can actually act on. The behavioural mechanism
 * (make leaving a real trip rather than one flick) is unchanged, so the
 * `docs/science.md` evidence key stays the same.
 */
export type Surface = 'browser' | 'app';

export interface PlatformWords {
  /** Settings switch that turns leave/return noticing on. */
  awayToggleTitle: string;
  /** Flow mode's home: a tab in a browser, a mode in the rail on a phone. */
  flowSubtitle: string;
  /** What a recorded leave-and-return is called in prose. */
  awayCount: (count: number) => string;
  /** Named in the clear-history scope so the user knows what leaves. */
  awayMomentsScope: string;
  /** Emoji + text for the "you leave a lot" suggestion. */
  awaySuggestionEmoji: string;
  awaySuggestionText: string;
}

const BROWSER: PlatformWords = {
  awayToggleTitle: 'Notice tab switches',
  flowSubtitle:
    'a count-up stopwatch tab — ride the focus as long as it flows, no ticking deadline',
  awayCount: (count) => `${count} quiet tab-away${count === 1 ? '' : 's'}`,
  awayMomentsScope: 'tab-away moments',
  awaySuggestionEmoji: '🖥️',
  awaySuggestionText:
    'the tab pulls you away a lot — try fullscreen or a separate desktop for sessions so elsewhere is a real trip, not one flick.',
};

const APP: PlatformWords = {
  awayToggleTitle: 'Notice when you leave',
  flowSubtitle:
    'a count-up stopwatch mode — ride the focus as long as it flows, no ticking deadline',
  awayCount: (count) => `${count} quiet moment${count === 1 ? '' : 's'} away`,
  awayMomentsScope: 'moments away',
  awaySuggestionEmoji: '📱',
  awaySuggestionText:
    'other apps pull you away a lot — try setting the phone down out of reach, or turning on a Focus while you work, so elsewhere is a real trip and not one tap.',
};

export function wordsFor(surface: Surface): PlatformWords {
  return surface === 'app' ? APP : BROWSER;
}

/** A Capacitor wrapper is the app surface; everything else has tabs. */
export function currentSurface(): Surface {
  return Capacitor.getPlatform() === 'web' ? 'browser' : 'app';
}

export function platformWords(): PlatformWords {
  return wordsFor(currentSurface());
}

/**
 * Which native shell is running, for copy that names a system surface the
 * reader has to go and find. `docs/voice.md` asks for advice a reader can act
 * on, and "adjust it in iOS Settings" is not actionable on a Pixel.
 *
 * This is only about naming. Capability differences belong in the native
 * modules, which report their own status.
 */
export type NativeOS = 'ios' | 'android' | 'none';

export function currentNativeOS(): NativeOS {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'none';
}

/** What to call the OS itself: "iOS can ring…", "Android can ring…". */
export function osName(): string {
  const os = currentNativeOS();
  return os === 'ios' ? 'iOS' : os === 'android' ? 'Android' : 'your device';
}

/** Where a person changes a system-owned permission for Bloom. */
export function systemSettingsName(): string {
  const os = currentNativeOS();
  return os === 'ios'
    ? 'iOS Settings'
    : os === 'android'
      ? 'Android Settings'
      : 'your device settings';
}
