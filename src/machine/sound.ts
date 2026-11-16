/**
 * Every sound the machine makes. All of it is synthesised with Web Audio: there are no
 * audio files, so sound costs nothing to download and nothing at all when it is switched
 * off, which is the default.
 *
 * A patch is a function that schedules oscillators on any audio context and returns how
 * long it lasts. Taking the context as an argument is what lets the self-test render the
 * same patches offline and measure that they are not silent.
 */

export type Patch = (c: BaseAudioContext, out: AudioNode, t: number) => number;

interface Tone {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the note. */
  to?: number;
}

function tone(c: BaseAudioContext, out: AudioNode, t: number, { freq, dur, type = 'square', gain = 0.16, to }: Tone) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(
  c: BaseAudioContext, out: AudioNode, t: number,
  { dur, gain, freq, type = 'bandpass', q = 1 }: { dur: number; gain: number; freq: number; type?: BiquadFilterType; q?: number },
) {
  let buffer = noiseBuffers.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, buffer);
  }
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(amp).connect(out);
  source.start(t, Math.random() * 0.5);
  source.stop(t + dur + 0.02);
}

const arp = (notes: number[], each: number, type: OscillatorType = 'square', gain = 0.12): Patch => (c, out, t) => {
  notes.forEach((freq, i) => tone(c, out, t + i * each, { freq, dur: each * 1.6, type, gain }));
  return notes.length * each + each;
};

/** The pairs of tones a phone keypad makes, for the digits being dialled. */
const DTMF: [number, number][] = [[697, 1336], [770, 1209], [852, 1477], [697, 1209], [941, 1336], [770, 1477], [852, 1336]];

export const PATCHES = {
  /** The VT100's keyclick. */
  click: (c, out, t) => {
    noise(c, out, t, { dur: 0.018, gain: 0.22, freq: 2400, type: 'highpass' });
    tone(c, out, t, { freq: 1900, dur: 0.008, gain: 0.05 });
    return 0.02;
  },
  /** BEL, character 7. */
  bell: (c, out, t) => {
    tone(c, out, t, { freq: 880, dur: 0.18, gain: 0.16 });
    tone(c, out, t, { freq: 1760, dur: 0.1, gain: 0.05 });
    return 0.2;
  },
  select: (c, out, t) => (tone(c, out, t, { freq: 620, dur: 0.04, type: 'triangle', gain: 0.14 }), 0.05),
  blip: (c, out, t) => (tone(c, out, t, { freq: 880, dur: 0.06, type: 'triangle', gain: 0.12 }), 0.07),
  launch: arp([440, 660, 880], 0.07),
  success: arp([523, 659, 784, 1047], 0.09),
  error: (c, out, t) => (tone(c, out, t, { freq: 150, to: 90, dur: 0.22, type: 'sawtooth', gain: 0.16 }), 0.24),
  eat: (c, out, t) => (tone(c, out, t, { freq: 660, to: 1320, dur: 0.07, gain: 0.12 }), 0.08),
  hit: (c, out, t) => (tone(c, out, t, { freq: 1200, dur: 0.025, type: 'triangle', gain: 0.08 }), 0.03),
  word: arp([784, 1175], 0.06),
  miss: (c, out, t) => (tone(c, out, t, { freq: 110, dur: 0.25, gain: 0.18 }), 0.27),
  level: arp([392, 523, 659, 784, 1047], 0.07),
  crash: (c, out, t) => {
    noise(c, out, t, { dur: 0.45, gain: 0.4, freq: 700, type: 'lowpass' });
    tone(c, out, t, { freq: 220, to: 40, dur: 0.45, type: 'sawtooth', gain: 0.18 });
    return 0.5;
  },
  /** A modem getting through: dial tone, seven digits, the answer, the handshake. */
  modem: (c, out, t) => {
    tone(c, out, t, { freq: 350, dur: 0.3, type: 'sine', gain: 0.09 });
    tone(c, out, t, { freq: 440, dur: 0.3, type: 'sine', gain: 0.09 });
    DTMF.forEach(([low, high], i) => {
      const at = t + 0.36 + i * 0.1;
      tone(c, out, at, { freq: low, dur: 0.07, type: 'sine', gain: 0.1 });
      tone(c, out, at, { freq: high, dur: 0.07, type: 'sine', gain: 0.1 });
    });
    tone(c, out, t + 1.12, { freq: 2100, dur: 0.42, type: 'sine', gain: 0.12 });
    // The two ends agreeing a speed: a warble between two tones, then a burst of hiss.
    for (let i = 0; i < 10; i++) tone(c, out, t + 1.58 + i * 0.03, { freq: i % 2 ? 1270 : 1070, dur: 0.03, gain: 0.06 });
    noise(c, out, t + 1.9, { dur: 0.5, gain: 0.2, freq: 1700, q: 0.8 });
    tone(c, out, t + 1.9, { freq: 1650, dur: 0.5, type: 'sine', gain: 0.04 });
    return 2.45;
  },
} satisfies Record<string, Patch>;

export type PatchName = keyof typeof PATCHES;

/* ─── The demo's tune ───
 * Sixteen steps to a bar, four bars to a section. Two sections take turns after an intro,
 * so two minutes of demo is not four bars heard sixteen times. Notes are MIDI numbers. */

const BPM = 132;
const STEP = 60 / BPM / 4;
const ARP = [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const X = null;

interface Section {
  chords: number[][];
  melody: (number | null)[];
}

/** A minor, F, C, G. */
const A: Section = {
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  melody: [
    76, X, X, 74, X, X, 72, X, 69, X, 72, X, 74, X, 72, X,
    77, X, X, 76, X, X, 72, X, 69, X, X, X, 65, X, 69, X,
    76, X, X, 79, X, X, 76, X, 72, X, X, X, 67, X, 72, X,
    74, X, X, 71, X, X, 67, X, 71, X, 74, X, 79, X, 77, X,
  ],
};

/** D minor, A minor, F, E: the same key, leaning on the way home. */
const B: Section = {
  chords: [[50, 53, 57], [45, 48, 52], [53, 57, 60], [52, 56, 59]],
  melody: [
    74, X, X, 77, X, X, 74, X, 72, X, 74, X, 77, X, X, X,
    76, X, X, 72, X, X, 69, X, 72, X, X, X, 76, X, X, X,
    77, X, X, 81, X, X, 77, X, 76, X, 77, X, 72, X, X, X,
    76, X, X, 80, X, X, 83, X, 80, X, X, X, 76, X, 71, X,
  ],
};

const FORM = [A, A, B, A, B];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function musicStep(c: BaseAudioContext, out: AudioNode, t: number, step: number) {
  const cycle = Math.floor(step / 64);
  // The first time round is the intro: arpeggio and bass, with the rest held back.
  const intro = cycle === 0;
  const section = intro ? A : FORM[(cycle - 1) % FORM.length];
  const bar = Math.floor(step / 16) % 4;
  const at = step % 16;
  const chord = section.chords[bar];
  tone(c, out, t, { freq: hz(chord[ARP[at]] + 12), dur: STEP * 0.9, gain: 0.05 });
  if (BASS[at]) tone(c, out, t, { freq: hz(chord[0] - 12), dur: STEP * 1.8, type: 'triangle', gain: 0.16 });
  if (intro) return;
  const note = section.melody[step % 64];
  if (note) tone(c, out, t, { freq: hz(note), dur: STEP * 2.6, type: 'triangle', gain: 0.12 });
  if (at % 8 === 0) tone(c, out, t, { freq: 120, to: 42, dur: 0.12, type: 'sine', gain: 0.3 });
  if (at % 4 === 2) noise(c, out, t, { dur: 0.03, gain: 0.06, freq: 6500, type: 'highpass' });
}

/** One bar of the tune with everything playing, for the self-test to render offline. */
export const tunePatch: Patch = (c, out, t) => {
  for (let step = 0; step < 16; step++) musicStep(c, out, t + step * STEP, 64 + step);
  return 16 * STEP;
};

/* ─── The live context ─── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = false;
let timer = 0;
let nextStep = 0;
let nextTime = 0;
let startedAt = 0;

function live(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  // Browsers start a context suspended until a key or a click. Every caller is one.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const sound = {
  get enabled() {
    return on;
  },
  enable(value: boolean) {
    on = value;
    if (value) live();
    else sound.stopMusic();
  },
  /** Call from any key or click, so the context is running by the time it is needed. */
  unlock() {
    if (on) live();
  },
  play(name: PatchName): number {
    if (!on) return 0;
    const c = live();
    return c && master ? PATCHES[name](c, master, c.currentTime + 0.01) : 0;
  },
  startMusic() {
    if (!on || timer) return;
    const c = live();
    if (!c || !master) return;
    const out = master;
    nextStep = 0;
    nextTime = c.currentTime + 0.08;
    startedAt = nextTime;
    // Schedule a little ahead of the clock, so a busy frame never drops a note.
    timer = window.setInterval(() => {
      while (nextTime < c.currentTime + 0.15) {
        musicStep(c, out, nextTime, nextStep);
        nextTime += STEP;
        nextStep += 1;
      }
    }, 30);
  },
  stopMusic() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  },
  /** Beats since the tune started, or null when it is not playing. The demo moves to it. */
  beat(): number | null {
    return timer && ctx ? Math.max(0, (ctx.currentTime - startedAt) / (60 / BPM)) : null;
  },
};

/**
 * Render a patch on an offline context and report how loud it came out. Used by the
 * self-test: a patch that schedules nothing, or schedules it wrongly, measures as silence.
 */
export async function measure(patch: Patch): Promise<{ seconds: number; peak: number } | null> {
  const Offline = typeof window === 'undefined' ? undefined : window.OfflineAudioContext;
  if (!Offline) return null;
  const rate = 22050;
  const offline = new Offline(1, rate * 3, rate);
  const seconds = patch(offline, offline.destination, 0.01);
  const data = (await offline.startRendering()).getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  return { seconds, peak };
}
