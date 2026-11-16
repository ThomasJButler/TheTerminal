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

function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, buffer);
  }
  return buffer;
}

function noise(
  c: BaseAudioContext, out: AudioNode, t: number,
  { dur, gain, freq, type = 'bandpass', q = 1 }: { dur: number; gain: number; freq: number; type?: BiquadFilterType; q?: number },
) {
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  source.buffer = noiseBuffer(c);
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

/* ─── The demo's score ───
 * Darksynth at 108 beats a minute, in A minor. Sixteen steps to a bar, four bars to a
 * section. It is still nothing but oscillators and filtered noise: the pads are detuned
 * saws, the echo is a delay line feeding itself, and the room is a burst of noise with a
 * decay drawn on it. Notes are MIDI numbers. */

const BPM = 108;
const STEP = 60 / BPM / 4;
const X = null;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Section {
  chords: number[][];
  melody: (number | null)[];
}

/** A minor, F, D minor, E. The last bar is major, which keeps it uneasy. */
const A: Section = {
  chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
  melody: [
    76, X, X, X, X, X, 72, X, 69, X, X, X, 72, X, 74, X,
    77, X, X, X, X, X, 76, X, 72, X, X, X, 69, X, X, X,
    74, X, X, X, X, X, 77, X, 81, X, X, X, 77, X, 74, X,
    76, X, X, X, X, X, 80, X, 83, X, X, X, 80, X, 76, X,
  ],
};

/** F, G, then A minor twice: the lift. */
const B: Section = {
  chords: [[53, 57, 60], [55, 59, 62], [57, 60, 64], [57, 60, 64]],
  melody: [
    81, X, X, X, X, X, 77, X, 84, X, X, X, 81, X, X, X,
    83, X, X, X, X, X, 79, X, 86, X, X, X, 83, X, X, X,
    88, X, X, X, 84, X, X, X, 81, X, X, X, 76, X, X, X,
    81, X, X, X, X, X, X, X, X, X, X, X, 79, X, 76, X,
  ],
};

interface Part {
  section: Section;
  kick: boolean;
  snare: boolean;
  bass: boolean;
  lead: boolean;
}

/** The two sections, for the test that checks every note is in key. */
export const SECTIONS: Section[] = [A, B];

/** Pads and the arpeggio on their own, opening up, before anything hits. */
const INTRO: Part = { section: A, kick: false, snare: false, bass: false, lead: false };
/** What comes round after the intro. The last one is the breakdown: the drums step out. */
const FORM: Part[] = [
  { section: A, kick: true, snare: false, bass: true, lead: false },
  { section: A, kick: true, snare: true, bass: true, lead: true },
  { section: B, kick: true, snare: true, bass: true, lead: true },
  { section: A, kick: true, snare: true, bass: true, lead: true },
  { section: B, kick: false, snare: false, bass: false, lead: true },
];

const ARP = [0, 1, 2, 1, 2, 1, 0, 1, 0, 2, 1, 2, 0, 1, 2, 1];
/** The rolling bass: the root, with the octave thrown in. */
const BASS = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12];

/** Where the score's voices go. Everything but the drums is pushed down by the kick. */
interface Bus {
  drums: AudioNode;
  duck: GainNode;
  echo: AudioNode;
  space: AudioNode;
}

const buses = new WeakMap<AudioNode, Bus>();

function busFor(c: BaseAudioContext, out: AudioNode): Bus {
  const made = buses.get(out);
  if (made) return made;

  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -15;
  glue.ratio.value = 5;
  glue.attack.value = 0.004;
  glue.release.value = 0.16;
  glue.connect(out);

  const drums = c.createGain();
  drums.connect(glue);
  const duck = c.createGain();
  duck.connect(glue);

  // The echo: three steps long, and each repeat comes back darker than the last.
  const echo = c.createGain();
  echo.gain.value = 0.34;
  const delay = c.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const darker = c.createBiquadFilter();
  darker.type = 'lowpass';
  darker.frequency.value = 2200;
  const again = c.createGain();
  again.gain.value = 0.44;
  echo.connect(delay).connect(darker).connect(again).connect(delay);
  darker.connect(duck);

  // The room: two and a half seconds of noise, fading, which is all a reverb's impulse is.
  const length = Math.floor(c.sampleRate * 2.5);
  const impulse = c.createBuffer(2, length, c.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const space = c.createGain();
  space.gain.value = 0.2;
  const room = c.createConvolver();
  room.buffer = impulse;
  space.connect(room).connect(glue);

  const bus = { drums, duck, echo, space };
  buses.set(out, bus);
  return bus;
}

interface Voice {
  freqs: number[];
  type: OscillatorType;
  dur: number;
  gain: number;
  /** Two oscillators per note, this many cents either side. */
  spread?: number;
  attack?: number;
  release?: number;
  /** The filter opens or closes from `cutoff` to `cutoffTo` over `sweep` seconds. */
  cutoff: number;
  cutoffTo?: number;
  sweep?: number;
  q?: number;
  /** Cents of vibrato, arriving once the note has settled. */
  vibrato?: number;
}

function synth(c: BaseAudioContext, to: AudioNode[], t: number, v: Voice) {
  const { attack = 0.005, release = 0.08 } = v;
  const end = t + v.dur + release;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = v.q ?? 1;
  filter.frequency.setValueAtTime(v.cutoff, t);
  if (v.cutoffTo) filter.frequency.exponentialRampToValueAtTime(v.cutoffTo, t + (v.sweep ?? v.dur));
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(v.gain, t + Math.min(attack, v.dur));
  amp.gain.setValueAtTime(v.gain, t + v.dur);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  filter.connect(amp);
  for (const node of to) amp.connect(node);

  let wobble: GainNode | null = null;
  if (v.vibrato) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.4;
    wobble = c.createGain();
    wobble.gain.value = 0;
    wobble.gain.setValueAtTime(0, t + 0.18);
    wobble.gain.linearRampToValueAtTime(v.vibrato, t + 0.5);
    lfo.connect(wobble);
    lfo.start(t);
    lfo.stop(end + 0.02);
  }
  for (const freq of v.freqs) {
    for (const cents of v.spread ? [-v.spread, v.spread] : [0]) {
      const osc = c.createOscillator();
      osc.type = v.type;
      osc.frequency.value = freq;
      osc.detune.value = cents;
      wobble?.connect(osc.detune);
      osc.connect(filter);
      osc.start(t);
      osc.stop(end + 0.02);
    }
  }
}

function kick(c: BaseAudioContext, bus: Bus, t: number) {
  tone(c, bus.drums, t, { freq: 150, to: 44, dur: 0.24, type: 'sine', gain: 0.7 });
  noise(c, bus.drums, t, { dur: 0.014, gain: 0.32, freq: 3200, type: 'highpass' });
  // The pump: everything else drops as the kick lands and swells back before the next.
  bus.duck.gain.setValueAtTime(0.34, t);
  bus.duck.gain.linearRampToValueAtTime(1, t + STEP * 3);
}

function snare(c: BaseAudioContext, bus: Bus, t: number, level = 1) {
  noise(c, bus.drums, t, { dur: 0.19, gain: 0.4 * level, freq: 1900, q: 0.6 });
  noise(c, bus.space, t, { dur: 0.12, gain: 0.3 * level, freq: 2600, q: 0.6 });
  // The crack on top. Without it the snare is all body and sits under everything else.
  noise(c, bus.drums, t, { dur: 0.1, gain: 0.2 * level, freq: 5200, type: 'highpass' });
  tone(c, bus.drums, t, { freq: 200, to: 150, dur: 0.09, type: 'triangle', gain: 0.24 * level });
}

/** A bar of hiss climbing into the next section. */
function riser(c: BaseAudioContext, bus: Bus, t: number, dur: number) {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);
  source.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(7000, t + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.13, t + dur * 0.96);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(amp);
  amp.connect(bus.duck);
  amp.connect(bus.space);
  source.start(t);
  source.stop(t + dur + 0.05);
}

function musicStep(c: BaseAudioContext, out: AudioNode, t: number, step: number) {
  const bus = busFor(c, out);
  const cycle = Math.floor(step / 64);
  const part = cycle === 0 ? INTRO : FORM[(cycle - 1) % FORM.length];
  const bar = Math.floor(step / 16) % 4;
  const at = step % 16;
  const { chords, melody } = part.section;
  const chord = chords[bar];

  if (at === 0) {
    synth(c, [bus.duck, bus.space], t, {
      freqs: chord.map(hz), type: 'sawtooth', spread: 11, dur: STEP * 16, gain: 0.026,
      attack: 0.5, release: 0.7, cutoff: 650, cutoffTo: 1800,
    });
  }

  // The arpeggio starts muffled and opens over the intro.
  const open = cycle === 0 ? 0.25 + 0.75 * (step / 64) : 1;
  synth(c, [bus.duck, bus.echo], t, {
    freqs: [hz(chord[ARP[at]] + 12)], type: 'square', dur: STEP * 0.5, gain: 0.06,
    release: 0.12, cutoff: 4600 * open, cutoffTo: 950, q: 3,
  });

  if (part.bass) {
    synth(c, [bus.duck], t, {
      freqs: [hz(chord[0] - 12 + BASS[at])], type: 'sawtooth', spread: 9, dur: STEP * 0.8, gain: 0.15,
      release: 0.05, cutoff: 1900, cutoffTo: 320, q: 7,
    });
  }

  if (part.kick && at % 4 === 0) kick(c, bus, t);
  if (part.snare && at % 8 === 4) snare(c, bus, t);
  // Hats: every step, quietly, with the off-beats leaning forward and one left open.
  const openHat = part.kick && at === 14 && bar % 2 === 1;
  noise(c, bus.drums, t, { dur: openHat ? 0.16 : 0.03, gain: at % 4 === 2 ? 0.19 : 0.085, freq: 8000, type: 'highpass' });

  if (part.lead) {
    const note = melody[step % 64];
    if (note) {
      // Held until the next note in the line.
      let hold = 1;
      while (hold < 16 && !melody[(step + hold) % 64]) hold += 1;
      synth(c, [bus.duck, bus.echo, bus.space], t, {
        freqs: [hz(note)], type: 'sawtooth', spread: 14, dur: STEP * hold * 0.92, gain: 0.085,
        attack: 0.03, release: 0.25, cutoff: 900, cutoffTo: 3800, sweep: 0.16, q: 2, vibrato: 7,
      });
    }
  }

  // The last bar of a section leans into the next one.
  if (bar === 3) {
    if (at === 0) riser(c, bus, t, STEP * 16);
    if (part.snare && at >= 12) snare(c, bus, t, 0.55);
  }
}

/** A stretch of the score as a patch: `steps` sixteenths, starting `from` that many in. */
export const scorePatch = (from: number, steps: number): Patch => (c, out, t) => {
  for (let step = 0; step < steps; step++) musicStep(c, out, t + step * STEP, from + step);
  return steps * STEP;
};

/** One bar with everything playing, for the self-test to render offline. */
export const tunePatch = scorePatch(64 * 3, 16);

/* ─── The live context ─── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** The score has a gain of its own, so stopping it can fade the pads and the echo out. */
let score: GainNode | null = null;
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
    score = ctx.createGain();
    score.connect(master);
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
    if (!c || !score) return;
    const out = score;
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setValueAtTime(1, c.currentTime);
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
    if (ctx && score) {
      score.gain.cancelScheduledValues(ctx.currentTime);
      score.gain.setTargetAtTime(0, ctx.currentTime, 0.07);
    }
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
