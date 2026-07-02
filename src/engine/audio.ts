// Synthesized audio for Bloom — all sound is generated live with the Web Audio
// API so nothing needs to be hosted and everything works fully offline (which
// matters for the bundled Android APK). Two responsibilities:
//   1. Background ambience while a session runs: calm music / coffee shop / white noise.
//   2. A gentle "ring" that plays when a session ends.
//
// A single shared AudioContext is created lazily on the first user gesture
// (see `resume()`), to satisfy browser/WebView autoplay policies.

export type BgSound = 'off' | 'calm' | 'coffee' | 'white';

export const BG_SOUNDS: { key: BgSound; label: string; hint: string }[] = [
  { key: 'off', label: 'No sound', hint: 'silence in the background' },
  { key: 'calm', label: 'Calm music', hint: 'soft, drifting pads' },
  { key: 'coffee', label: 'Coffee shop', hint: 'warm room hum & clinks' },
  { key: 'white', label: 'White noise', hint: 'steady, even hush' },
];

interface Stoppable {
  stop(when?: number): void;
}
interface Ambience {
  stop(): void;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: Ambience | null = null;
  private playing: BgSound = 'off';
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Resume/unlock the audio context. Must be called from a user gesture. */
  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Current requested ambience (what should be playing). */
  get current(): BgSound {
    return this.playing;
  }

  // ---- buffers -----------------------------------------------------------

  private noiseBuffer(seconds: number, type: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buf;
  }

  // ---- envelope helpers --------------------------------------------------

  private fadeIn(g: GainNode, to: number, time = 1.4) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
    g.gain.linearRampToValueAtTime(to, now + time);
  }

  private fadeOutStop(g: GainNode, nodes: Stoppable[]) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
    g.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    nodes.forEach((n) => {
      try {
        n.stop(now + 0.7);
      } catch {
        /* already stopped */
      }
    });
  }

  /** A soft glockenspiel-like bell: fundamental + a couple of harmonics. */
  private bell(freq: number, peak: number, dur: number, delay = 0) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    ([[1, 1], [2, 0.5], [3, 0.22]] as [number, number][]).forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * amp), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    });
  }

  // ---- ambience generators ----------------------------------------------

  private startWhite(): Ambience {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2, 'white');
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    this.fadeIn(g, 0.16);
    return { stop: () => this.fadeOutStop(g, [src]) };
  }

  private startCoffee(): Ambience {
    const ctx = this.ctx!;
    // Low room rumble (brown noise, lowpassed).
    const brown = ctx.createBufferSource();
    brown.buffer = this.noiseBuffer(3, 'brown');
    brown.loop = true;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 480;
    const rg = ctx.createGain();
    rg.gain.value = 0.0001;
    brown.connect(rlp).connect(rg).connect(this.master!);
    brown.start();

    // "Murmur": white noise through a slowly sweeping bandpass.
    const mur = ctx.createBufferSource();
    mur.buffer = this.noiseBuffer(3, 'white');
    mur.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const mg = ctx.createGain();
    mg.gain.value = 0.0001;
    mur.connect(bp).connect(mg).connect(this.master!);
    mur.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 300;
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start();

    this.fadeIn(rg, 0.22);
    this.fadeIn(mg, 0.05);

    // Occasional distant cup/spoon clinks.
    const clink = setInterval(() => {
      if (this.ctx && Math.random() < 0.45) this.bell(1100 + Math.random() * 900, 0.02, 0.5);
    }, 2600);

    return {
      stop: () => {
        clearInterval(clink);
        this.fadeOutStop(rg, [brown]);
        this.fadeOutStop(mg, [mur, lfo]);
      },
    };
  }

  private startCalm(): Ambience {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(this.master!);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.connect(out);

    // Warm sustained pad: A major (A3 / C#4 / E4), each voice lightly detuned.
    const chord = [220, 277.18, 329.63];
    const oscs: OscillatorNode[] = [];
    chord.forEach((f) => {
      [0, -5, 5].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        o.connect(g).connect(lp);
        o.start();
        oscs.push(o);
      });
    });

    // Slow breathing tremolo.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(out.gain);
    lfo.start();

    this.fadeIn(out, 0.16);

    // Gentle drifting bells over the pad.
    const scale = [440, 554.37, 659.25, 880, 659.25];
    let step = 0;
    const arp = setInterval(() => {
      if (!this.ctx) return;
      this.bell(scale[step % scale.length], 0.035, 2.4);
      step++;
    }, 2600);

    return {
      stop: () => {
        clearInterval(arp);
        this.fadeOutStop(out, [...oscs, lfo]);
      },
    };
  }

  // ---- public ambience API ----------------------------------------------

  setAmbience(kind: BgSound) {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (kind === this.playing && (kind === 'off' || this.ambience)) return;
    this.stopInternal();
    this.playing = kind;
    if (kind === 'off') return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (kind === 'white') this.ambience = this.startWhite();
    else if (kind === 'coffee') this.ambience = this.startCoffee();
    else if (kind === 'calm') this.ambience = this.startCalm();
  }

  private stopInternal() {
    if (this.ambience) {
      this.ambience.stop();
      this.ambience = null;
    }
  }

  stopAmbience() {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.stopInternal();
    this.playing = 'off';
  }

  /** Play a short taste of an ambience, then stop — for the settings picker. */
  previewAmbience(kind: BgSound) {
    this.resume();
    this.setAmbience(kind);
    if (kind !== 'off') {
      this.previewTimer = setTimeout(() => this.stopAmbience(), 5000);
    }
  }

  // ---- ring --------------------------------------------------------------

  /** A warm rising two-phrase chime played when a session ends. */
  playRing() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const phrase = [659.25, 783.99, 987.77]; // E5 · G5 · B5
    const play = (base = 0) => phrase.forEach((f, i) => this.bell(f, 0.16, 1.3, base + i * 0.18));
    play(0);
    play(1.3);
  }
}

export const audioEngine = new AudioEngine();

/** Ask for Notification permission (used so the ring can also notify when backgrounded). */
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
