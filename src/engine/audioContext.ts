/**
 * One AudioContext for the whole app.
 *
 * Both audio paths — the completion chime and the ambient scene — are
 * synthesized locally and need a context that was opened from a user gesture,
 * or WebView autoplay rules silence them. Sharing one context rather than
 * opening two matters on iOS, where the per-tab limit is small and an
 * abandoned context is not always reclaimed.
 *
 * Nothing here fetches anything. Every sound Bloom makes is generated from
 * numbers in the repository.
 */

let context: AudioContext | null = null;
/** Set by the first user gesture. Until then nothing is allowed to sound. */
let unlocked = false;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const AudioContextClass: typeof AudioContext | undefined =
    window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  return context;
}

/** Must be called from a user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  unlocked = true;
  const ctx = ensureAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

export function audioUnlocked(): boolean {
  return unlocked;
}

/**
 * Nudge a context the system suspended — a WebView that went to the background
 * and came back leaves it suspended even though nothing changed in Bloom.
 */
export function resumeAudioContext(): void {
  const ctx = context;
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

export function resetAudioForTests(): void {
  context = null;
  unlocked = false;
}
