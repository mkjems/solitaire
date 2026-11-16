/**
 * Card sounds. Everything is synthesised at start-up (no files to download),
 * with several variants of each sound plus small random changes in pitch and
 * volume, so no two moves sound identical. Sounds are panned by where the card
 * is on the table and pass through a short, soft room reverb.
 *
 * The synthesis can later be swapped for recorded samples: `play` only needs
 * an AudioBuffer per variant.
 */

export type SoundName =
  | 'place'
  | 'slide'
  | 'flip'
  | 'pickup'
  | 'deny'
  | 'chime'
  | 'riffle'
  | 'shuffle';

export interface PlayOptions {
  /** 0–1, multiplied with the sound's own level. */
  volume?: number;
  /** -1 (left) to 1 (right). */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
  /** Pitch shift in semitones. */
  semitones?: number;
}

/** The audio context's sample rate; every buffer must be rendered at it. Set before synthesis. */
let RATE = 44_100;

// ---------------------------------------------------------------------------
// Synthesis helpers
// ---------------------------------------------------------------------------

function seededNoise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A two-pole band-pass filter (RBJ biquad), processing one sample at a time. */
class BandPass {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;

  constructor(freq: number, q: number) {
    this.tune(freq, q);
  }

  tune(freq: number, q: number): void {
    const w = (2 * Math.PI * freq) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Fills `seconds` of mono audio from a per-sample function of time. */
function render(seconds: number, sample: (t: number, i: number) => number): Float32Array {
  const data = new Float32Array(Math.ceil(seconds * RATE));
  for (let i = 0; i < data.length; i++) data[i] = sample(i / RATE, i);
  // Fade the last few milliseconds to avoid a click.
  const fade = Math.min(data.length, Math.round(0.004 * RATE));
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] = (data[data.length - 1 - i] as number) * (i / fade);
  return normalise(data);
}

function normalise(data: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] = ((data[i] as number) / max) * peak;
  return data;
}

const decay = (t: number, tau: number): number => Math.exp(-t / tau);
const attack = (t: number, time: number): number => Math.min(1, t / time);

/** A card landing on felt: a soft low thump with a short papery snap. */
function place(v: number): Float32Array {
  const noise = seededNoise(100 + v);
  const body = new BandPass(1500 + v * 260, 0.9);
  const snap = new BandPass(4200 + v * 400, 1.4);
  const thump = 105 + v * 14;
  return render(0.09, (t) => {
    const n = noise();
    return (
      0.55 * Math.sin(2 * Math.PI * thump * t) * decay(t, 0.011) * attack(t, 0.0012) +
      1.0 * body.run(n) * decay(t, 0.0075) * attack(t, 0.0008) +
      0.45 * snap.run(n) * decay(t, 0.0025)
    );
  });
}

/**
 * A card sliding across the cloth: a soft, smooth swish. The noise is first
 * smoothed, then shaped by two gentle filters that sweep down, so it has no
 * hiss or grain, and it swells and fades without any flutter.
 */
function slide(v: number): Float32Array {
  const noise = seededNoise(200 + v);
  const first = new BandPass(1500, 0.6);
  const second = new BandPass(1650, 0.6);
  const smoothing = 1 - Math.exp((-2 * Math.PI * 2400) / RATE);
  let smooth = 0;
  const length = 0.17 + v * 0.015;
  return render(length, (t, i) => {
    const p = Math.min(1, t / length);
    if (i % 32 === 0) {
      const f = 1500 - 650 * p;
      first.tune(f, 0.6);
      second.tune(f * 1.1, 0.6);
    }
    smooth += smoothing * (noise() - smooth);
    const envelope = Math.sin(Math.PI * p) ** 2;
    return second.run(first.run(smooth)) * envelope;
  });
}

/** A card turning over: a crisp double snap with a little air. */
function flip(v: number): Float32Array {
  const noise = seededNoise(300 + v);
  const crisp = new BandPass(3400 + v * 300, 1.1);
  const air = new BandPass(1800, 0.7);
  const gap = 0.028 + v * 0.004;
  return render(0.085, (t) => {
    const n = noise();
    const snaps = decay(t, 0.003) + 0.6 * (t > gap ? decay(t - gap, 0.004) : 0);
    const swish = Math.sin(Math.PI * Math.min(1, t / 0.07)) * 0.35;
    return crisp.run(n) * snaps + air.run(n) * swish;
  });
}

/** Picking a card up: a short, light lift. */
function pickup(v: number): Float32Array {
  const noise = seededNoise(400 + v);
  const filter = new BandPass(3000 + v * 250, 1.0);
  return render(0.05, (t) => filter.run(noise()) * attack(t, 0.006) * decay(t, 0.012));
}

/** "Not there": two muted taps. */
function deny(): Float32Array {
  const noise = seededNoise(500);
  const body = new BandPass(900, 1.2);
  return render(0.16, (t) => {
    const tap = (start: number) => (t >= start ? decay(t - start, 0.012) : 0);
    const env = tap(0) + 0.75 * tap(0.075);
    return body.run(noise()) * env + 0.5 * Math.sin(2 * Math.PI * 85 * t) * env;
  });
}

/** A soft bell, used for foundations and the win. Pitched up with `semitones`. */
function chime(): Float32Array {
  const f = 659.25; // E5
  const partials = [
    [1, 1, 0.9],
    [2.0, 0.32, 0.5],
    [3.01, 0.14, 0.32],
    [4.17, 0.07, 0.18],
  ] as const;
  return render(1.4, (t) => {
    let s = 0;
    for (const [ratio, level, tau] of partials) s += level * Math.sin(2 * Math.PI * f * ratio * t) * decay(t, tau);
    return s * attack(t, 0.003);
  });
}

/** Many cards riffling: a quick run of small snaps. */
function riffle(count: number, length: number, seed: number): Float32Array {
  const noise = seededNoise(seed);
  const filter = new BandPass(3000, 0.9);
  const times: number[] = [];
  for (let k = 0; k < count; k++) {
    const p = k / count;
    times.push(length * 0.85 * (p - 0.25 * p * p) + noise() * 0.003);
  }
  return render(length, (t) => {
    let env = 0;
    for (const start of times) if (t >= start) env += decay(t - start, 0.0035);
    const swell = Math.sin(Math.PI * Math.min(1, t / length)) ** 0.5;
    return filter.run(noise()) * env * swell;
  });
}

/** A small room: under a second of decaying stereo noise. */
function impulse(ctx: AudioContext): AudioBuffer {
  const length = Math.round(0.9 * RATE);
  const buffer = ctx.createBuffer(2, length, RATE);
  for (let c = 0; c < 2; c++) {
    const noise = seededNoise(900 + c);
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = noise() * decay(i / RATE, 0.16) * (i < 200 ? i / 200 : 1);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

/** Overall output level; kept low so the sounds stay a subtle effect. */
const OUTPUT_LEVEL = 0.7;

/** Base level of each sound before the caller's volume. */
const LEVELS: Record<SoundName, number> = {
  place: 0.62,
  slide: 0.26,
  flip: 0.26,
  pickup: 0.2,
  deny: 0.38,
  chime: 0.12,
  riffle: 0.32,
  shuffle: 0.36,
};

/** The shortest gap between two plays of one sound; closer plays are merged. */
const MIN_GAP = 0.018;

export class SoundBoard {
  private ctx: AudioContext | null = null;
  /** When a resume was last requested. Sounds asked for just after it are queued rather than dropped. */
  private resumeRequestedAt = -Infinity;
  private master: GainNode | null = null;
  private input: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer[]>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private enabledValue: boolean;

  constructor(enabled: boolean) {
    this.enabledValue = enabled;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  set enabled(on: boolean) {
    this.enabledValue = on;
    if (on) this.unlock();
  }

  /** Creates the audio context. Browsers allow this only during a tap, click or key press. */
  unlock(): void {
    try {
      this.start();
    } catch (error) {
      // Sound is never worth breaking the game for: carry on silently.
      console.warn('Sound is unavailable', error);
      this.enabledValue = false;
    }
  }

  private start(): void {
    if (!this.enabledValue) return;
    if (this.ctx) {
      this.resume(this.ctx);
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;

    const ctx = new Context({ latencyHint: 'interactive' });
    this.ctx = ctx;
    RATE = ctx.sampleRate;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    // Overall loudness, after the compressor so the whole mix drops evenly.
    const output = ctx.createGain();
    output.gain.value = OUTPUT_LEVEL;
    this.master.connect(compressor).connect(output).connect(ctx.destination);

    // Dry signal plus a little room.
    this.input = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    this.input.connect(this.master);
    this.input.connect(reverb).connect(wet).connect(this.master);

    const make = (data: Float32Array): AudioBuffer => {
      const buffer = ctx.createBuffer(1, data.length, RATE);
      buffer.getChannelData(0).set(data);
      return buffer;
    };
    const variants = (fn: (v: number) => Float32Array, n: number) => Array.from({ length: n }, (_, v) => make(fn(v)));

    this.buffers.set('place', variants(place, 5));
    this.buffers.set('slide', variants(slide, 4));
    this.buffers.set('flip', variants(flip, 4));
    this.buffers.set('pickup', variants(pickup, 3));
    this.buffers.set('deny', [make(deny())]);
    this.buffers.set('chime', [make(chime())]);
    this.buffers.set('riffle', [make(riffle(24, 0.42, 600)), make(riffle(24, 0.4, 601))]);
    this.buffers.set('shuffle', [make(riffle(52, 0.75, 700)), make(riffle(52, 0.7, 701))]);

    this.resume(ctx);
  }

  /**
   * Phones start the context suspended, and suspend or interrupt it again after
   * calls, the lock screen or switching apps. A resume only succeeds during a tap.
   */
  private resume(ctx: AudioContext): void {
    if (ctx.state === 'running' || ctx.state === 'closed') return;
    this.resumeRequestedAt = performance.now();
    ctx.resume().catch(() => undefined);
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    const input = this.input;
    if (!this.enabledValue || !ctx || !input) return;
    // A suspended context that is about to resume will play queued sounds; one that
    // is not would release them all at once later, so those are dropped.
    if (ctx.state !== 'running' && performance.now() - this.resumeRequestedAt > 400) return;
    const variants = this.buffers.get(name);
    if (!variants || variants.length === 0) return;

    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const last = this.lastPlayed.get(name) ?? -1;
    // Many cards landing together should sound like one confident landing, not a crackle.
    if (name !== 'chime' && Math.abs(when - last) < MIN_GAP) return;
    this.lastPlayed.set(name, when);

    const source = ctx.createBufferSource();
    source.buffer = variants[Math.floor(Math.random() * variants.length)] as AudioBuffer;
    const cents = (options.semitones ?? 0) * 100 + (name === 'chime' ? 0 : (Math.random() - 0.5) * 140);
    source.playbackRate.value = 2 ** (cents / 1200);

    const gain = ctx.createGain();
    gain.gain.value = LEVELS[name] * (options.volume ?? 1) * (0.86 + Math.random() * 0.14);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));

    source.connect(gain).connect(panner).connect(input);
    try {
      source.start(when);
    } catch {
      // A sound that cannot start is simply skipped.
    }
  }
}
