export const APPEARANCE_MODES = ['day', 'night', 'system'] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode);
}

export function resolveNight(mode: AppearanceMode, systemNight: boolean): boolean {
  if (mode === 'night') return true;
  if (mode === 'day') return false;
  return systemNight;
}

type MatchMedia = (query: string) => MediaQueryList;

function browserMatchMedia(): MatchMedia | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia.bind(window);
}

export function readSystemNight(matchMedia: MatchMedia | null = browserMatchMedia()): boolean {
  return matchMedia?.(SYSTEM_DARK_QUERY).matches ?? false;
}

/**
 * Follow the browser/device preference without polling. The immediate callback
 * also catches preference changes made while a manual Bloom theme was active.
 */
export function watchSystemNight(
  onChange: (night: boolean) => void,
  matchMedia: MatchMedia | null = browserMatchMedia(),
): () => void {
  if (!matchMedia) {
    onChange(false);
    return () => undefined;
  }

  const query = matchMedia(SYSTEM_DARK_QUERY);
  const handleChange = (event: MediaQueryListEvent) => onChange(event.matches);
  onChange(query.matches);

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }

  // Safari before 14 supports the legacy MediaQueryList listener methods.
  query.addListener(handleChange);
  return () => query.removeListener(handleChange);
}
