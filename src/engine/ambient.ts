import { audioUnlocked, ensureAudioContext, resumeAudioContext } from './audioContext';

/**
 * Optional ambient sound for the length of a work session.
 *
 * Every scene is synthesized from filtered noise at runtime — no audio files,
 * no CDN, nothing to download. A loop long enough not to sound repetitive would
 * be megabytes as a bundled recording; as three filter settings over a noise
 * buffer it is a few hundred bytes of code and never has to be fetched, which
 * is the only shape that fits Bloom's local-first constraint.
 *
 * Ambient audio was removed in PLAN 12.1 and is deliberately back as an
 * opt-out-by-default choice: `docs/science.md#do-not-build` rules out forced
 * audio, so the setting ships as 'off' and only ever starts from the user's
 * own Start press.
 */
export type AmbientScene = 'rain' | 'waves' | 'hush';

/** 'off' is a real, and the default, choice — not an absent value. */
export type AmbientChoice = AmbientScene | 'off';

export const AMBIENT_CHOICES: {
  id: AmbientChoice;
  label: string;
  blurb: string;
}[] = [
  { id: 'off', label: 'off', blurb: 'quiet' },
  { id: 'rain', label: 'rain', blurb: 'soft rain on a window' },
  { id: 'waves', label: 'waves', blurb: 'slow water, in and out' },
  { id: 'hush', label: 'hush', blurb: 'a steady warm hush' },
];

export function isAmbientChoice(value: unknown): value is AmbientChoice {
  return (
    value === 'off' || value === 'rain' || value === 'waves' || value === 'hush'
  );
}

/** Per-scene shaping. Gentle by design: this sits under thinking, not over it. */
const SCENES: Record<
  AmbientScene,
  {
    /** Brown noise is darker and less hissy; white suits rain. */
    brown: boolean;
    highpassHz: number;
    lowpassHz: number;
    gain: number;
    /** Slow amplitude movement, so a loop never sounds like a loop. */
    swell: { hz: number; depth: number } | null;
  }
> = {
  rain: { brown: false, highpassHz: 420, lowpassHz: 6200, gain: 0.1, swell: { hz: 0.7, depth: 0.25 } },
  waves: { brown: true, highpassHz: 40, lowpassHz: 700, gain: 0.24, swell: { hz: 0.09, depth: 0.6 } },
  hush: { brown: true, highpassHz: 40, lowpassHz: 1250, gain: 0.18, swell: null },
};

const LOOP_SECONDS = 6;
/** Long enough to hide the seam, short enough to stay inaudible as a fade. */
const SEAM_SECONDS = 0.35;
const FADE_SECONDS = 1.2;

function fillNoise(data: Float32Array, brown: boolean): void {
  if (!brown) {
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } else {
    // Integrated white noise, leaked so it cannot wander off to a DC offset.
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
}

/**
 * Crossfade the tail back over the head so the loop point is not a click. A
 * looping buffer with an untreated seam ticks once every pass, which is far
 * more distracting than the sound it interrupts.
 */
function healSeam(data: Float32Array, seamFrames: number): void {
  const start = data.length - seamFrames;
  if (start <= 0) return;
  for (let i = 0; i < seamFrames; i += 1) {
    const t = i / seamFrames;
    data[start + i] = data[start + i] * (1 - t) + data[i] * t;
  }
  // The head just contributed to the tail, so trim the buffer to the point
  // where the two now agree.
  data.copyWithin(0, 0, start + seamFrames);
}

class AmbientAudio {
  private scene: AmbientScene | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private buffers = new Map<'brown' | 'white', AudioBuffer>();
  /** An AudioBuffer belongs to the context that made it, so the cache does too. */
  private bufferContext: AudioContext | null = null;

  /** Which scene is sounding right now, or null. Used by tests and the UI. */
  current(): AmbientScene | null {
    return this.scene;
  }

  private buffer(ctx: AudioContext, brown: boolean): AudioBuffer {
    if (this.bufferContext !== ctx) {
      this.buffers.clear();
      this.bufferContext = ctx;
    }
    const key = brown ? 'brown' : 'white';
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const frames = Math.floor(ctx.sampleRate * LOOP_SECONDS);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    fillNoise(data, brown);
    healSeam(data, Math.floor(ctx.sampleRate * SEAM_SECONDS));
    this.buffers.set(key, buffer);
    return buffer;
  }

  /**
   * Start, switch, or stop the scene. Idempotent: asking for the scene that is
   * already sounding does nothing, so a re-render never restarts the loop.
   */
  set(scene: AmbientScene | null): void {
    if (scene === this.scene) {
      if (scene) resumeAudioContext();
      return;
    }
    // Nothing sounds before the user has pressed something. The chime obeys the
    // same rule, and WebView autoplay policy enforces it anyway.
    if (scene && !audioUnlocked()) return;
    this.stop();
    if (!scene) return;

    const ctx = ensureAudioContext();
    if (!ctx) return;
    resumeAudioContext();

    const spec = SCENES[scene];
    try {
      const source = ctx.createBufferSource();
      source.buffer = this.buffer(ctx, spec.brown);
      source.loop = true;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = spec.highpassHz;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = spec.lowpassHz;

      const gain = ctx.createGain();
      // Fade in rather than cut in: an ambient bed that arrives abruptly is
      // itself an interruption, which is the opposite of the point.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(spec.gain, ctx.currentTime + FADE_SECONDS);

      source.connect(highpass).connect(lowpass).connect(gain);
      gain.connect(ctx.destination);

      if (spec.swell) {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = spec.swell.hz;
        const depth = ctx.createGain();
        depth.gain.value = spec.gain * spec.swell.depth;
        lfo.connect(depth).connect(gain.gain);
        lfo.start();
        this.lfo = lfo;
      }

      source.start();
      this.source = source;
      this.gain = gain;
      this.scene = scene;
    } catch {
      // A WebView that refuses to build the graph leaves the timer untouched;
      // ambient sound is never load-bearing.
      this.stop();
    }
  }

  /** Fade out and release the graph. Safe to call when nothing is playing. */
  stop(): void {
    const { source, gain, lfo } = this;
    this.source = null;
    this.gain = null;
    this.lfo = null;
    this.scene = null;
    if (!source) return;

    const ctx = ensureAudioContext();
    const release = () => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
        gain?.disconnect();
        lfo?.stop();
        lfo?.disconnect();
      } catch {
        /* already released */
      }
    };

    if (ctx && gain) {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        // This graph owns its release. Another stop or scene change must not
        // cancel cleanup after these nodes have left the active scene refs.
        setTimeout(release, 700);
        return;
      } catch {
        /* fall through to an immediate release */
      }
    }
    release();
  }
}

export const ambientEngine = new AmbientAudio();

/**
 * A short taste of a scene, so choosing one in Settings is not a guess about
 * what it will sound like an hour from now. PLAN 12.1 removed the old previews
 * along with ambient sound itself; a picker with no way to hear its options is
 * the reason to bring this one back, and it still only ever plays from the tap
 * that asked for it.
 */
export const AMBIENT_PREVIEW_MS = 3200;

export function previewAmbient(scene: AmbientChoice): void {
  if (scene === 'off') {
    ambientEngine.stop();
    return;
  }
  ambientEngine.set(scene);
}
