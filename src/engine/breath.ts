/**
 * One gentle Web Audio swell for the optional kind-restart flow (PLAN 5.3).
 * It is created only from the reset's explicit start button, never on mount,
 * and uses no fetched or bundled audio assets so it stays fully offline.
 */

export const BREATH_CYCLE_MS = 10_000;

export interface BreathPlayback {
  stop: () => void;
}

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    context ??= new AC();
    return context;
  } catch {
    return null;
  }
}

/** Start exactly one quiet inhale/exhale-shaped tone from a user gesture. */
export function playBreathSwell(): BreathPlayback {
  const ctx = audioContext();
  if (!ctx) return { stop: () => {} };
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const end = now + BREATH_CYCLE_MS / 1000;
  const turn = now + (BREATH_CYCLE_MS / 1000) * 0.46;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const low = ctx.createOscillator();
  const glow = ctx.createOscillator();

  low.type = 'sine';
  low.frequency.setValueAtTime(196, now);
  low.frequency.linearRampToValueAtTime(220, turn);
  low.frequency.linearRampToValueAtTime(196, end);
  glow.type = 'sine';
  glow.frequency.setValueAtTime(293.66, now);
  glow.frequency.linearRampToValueAtTime(329.63, turn);
  glow.frequency.linearRampToValueAtTime(293.66, end);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(520, now);
  filter.frequency.linearRampToValueAtTime(900, turn);
  filter.frequency.linearRampToValueAtTime(520, end);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, turn);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  const lowGain = ctx.createGain();
  const glowGain = ctx.createGain();
  lowGain.gain.value = 0.72;
  glowGain.gain.value = 0.28;
  low.connect(lowGain).connect(filter);
  glow.connect(glowGain).connect(filter);
  filter.connect(gain).connect(ctx.destination);
  low.start(now);
  glow.start(now);
  low.stop(end + 0.05);
  glow.stop(end + 0.05);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const at = ctx.currentTime;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      for (const oscillator of [low, glow]) {
        try {
          oscillator.stop(at + 0.1);
        } catch {
          // The single cycle already ended.
        }
      }
    },
  };
}
