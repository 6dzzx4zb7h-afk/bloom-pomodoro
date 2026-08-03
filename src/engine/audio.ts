import completionCue from './completionCue.json';

/**
 * Bloom's one remaining audio path (PLAN 12.1): the optional completion chime.
 *
 * The AudioContext is created lazily from a user gesture so the timer never
 * violates browser/WebView autoplay rules. The foreground cue is synthesized
 * locally; iOS's bundled notification rendering is generated from the same
 * data, and neither path needs a network request.
 */

class CompletionAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private userUnlocked = false;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      try {
        this.ctx = new AudioContextClass();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Unlock the completion cue. Must be called from a user gesture. */
  resume() {
    this.userUnlocked = true;
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  }

  private bell(frequency: number, peak: number, duration: number, delay = 0) {
    const ctx = this.ctx!;
    const startsAt = ctx.currentTime + delay;
    completionCue.partials.forEach(
      ({ multiplier, amplitude }) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency * multiplier;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startsAt);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0002, peak * amplitude),
          startsAt + completionCue.attackSeconds,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
        oscillator.connect(gain).connect(this.master!);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + duration + 0.05);
      },
    );
  }

  /** A warm rising two-phrase chime played when a timer ends. */
  playRing() {
    if (!this.userUnlocked) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const phrase = completionCue.frequencies; // E5 · G5 · B5
    const play = (base = 0) =>
      phrase.forEach((frequency, index) =>
        this.bell(
          frequency,
          completionCue.peak,
          completionCue.bellSeconds,
          base + index * completionCue.noteSpacingSeconds,
        ),
      );
    play();
    play(completionCue.secondPhraseDelaySeconds);
  }
}

export const audioEngine = new CompletionAudio();

/** Ask for Notification permission. Must be called from a user gesture. */
export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

export function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* notifications unavailable */
  }
}
