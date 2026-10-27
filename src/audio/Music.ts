/** Procedural synthwave: four original songs built from chords, drum grids and arpeggios. */
export interface Song {
  name: string;
  bpm: number;
  /** MIDI note of the key root. */
  key: number;
  /** One chord per bar: [semitones from key, minor?]. */
  chords: [number, boolean][];
  kick: string;
  snare: string;
  hat: string;
  /** Bass rhythm: x = root, o = octave, - = rest. */
  bass: string;
  /** Arpeggio chord-tone order (indices into a two-octave chord). */
  arp: number[];
  /** Lead melody per bar: scale degrees (-1 rest) on 8th notes. */
  lead: number[][];
}
export const SONGS: Record<string, Song> = {
  afterglow: {
    name: "Afterglow",
    bpm: 96,
    key: 57,
    chords: [
      [0, true],
      [-4, false],
      [3, false],
      [-2, false],
    ],
    kick: "x-------x-------",
    snare: "----x-------x---",
    hat: "--x---x---x---x-",
    bass: "x---x---x-o-x---",
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
    lead: [
      [4, -1, 3, -1, 2, -1, -1, -1],
      [2, -1, 1, -1, 0, -1, -1, -1],
      [4, -1, 5, -1, 4, -1, 2, -1],
      [1, -1, -1, -1, -1, -1, -1, -1],
    ],
  },
  neon: {
    name: "Neon Pursuit",
    bpm: 118,
    key: 53,
    chords: [
      [0, true],
      [-4, false],
      [3, false],
      [-2, false],
    ],
    kick: "x---x---x---x---",
    snare: "----x-------x---",
    hat: "x-x-x-x-x-x-x-xx",
    bass: "x-xox-xox-xox-xo",
    arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 4, 2, 1, 2],
    lead: [
      [7, -1, 7, 6, 4, -1, 2, -1],
      [4, -1, 3, -1, 2, -1, 0, -1],
      [7, -1, 9, -1, 8, 7, 6, -1],
      [4, -1, -1, 3, 4, -1, -1, -1],
    ],
  },
  coast: {
    name: "Coastline",
    bpm: 108,
    key: 62,
    chords: [
      [3, false],
      [-2, false],
      [0, true],
      [-4, false],
    ],
    kick: "x-----x-x-------",
    snare: "----x-------x---",
    hat: "--x---x---x---x-",
    bass: "x--x--x-x--x--x-",
    arp: [0, 1, 2, 4, 2, 1, 0, 2, 1, 2, 4, 5, 4, 2, 1, 0],
    lead: [
      [4, -1, 5, -1, 7, -1, 5, 4],
      [2, -1, -1, -1, 4, -1, 2, 1],
      [0, -1, 2, -1, 4, -1, 5, -1],
      [4, -1, -1, -1, 2, -1, -1, -1],
    ],
  },
  canyon: {
    name: "Red Dust",
    bpm: 124,
    key: 52,
    chords: [
      [0, true],
      [-4, false],
      [-2, false],
      [-5, true],
    ],
    kick: "x--x--x-x--x--x-",
    snare: "----x--x----x---",
    hat: "xxx-xxx-xxx-xxxx",
    bass: "xx-oxx-oxx-oxxox",
    arp: [0, 3, 1, 4, 2, 5, 1, 4, 0, 3, 2, 4, 1, 3, 0, 2],
    lead: [
      [0, 0, 3, -1, 4, -1, 3, 1],
      [0, -1, -1, -1, -2, -1, 0, -1],
      [3, 3, 4, -1, 6, -1, 4, 3],
      [1, -1, 0, -1, -1, -1, -1, -1],
    ],
  },
};
const MINOR = [0, 2, 3, 5, 7, 8, 10];
export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** Chord tones across two octaves: root, third, fifth, octave… */
export function chordTones(root: number, minor: boolean) {
  const third = minor ? 3 : 4;
  return [0, third, 7, 12, 12 + third, 19].map((n) => root + n);
}
export function scaleNote(key: number, degree: number) {
  const octave = Math.floor(degree / 7),
    d = ((degree % 7) + 7) % 7;
  return key + MINOR[d] + octave * 12;
}
export class MusicEngine {
  private song: Song = SONGS.afterglow;
  private nextStep = 0;
  private step = 0;
  /** 0 = ambient (menus), 1 = racing, 2 = final lap. */
  intensity = 0;
  private bus: GainNode;
  private noise: AudioBuffer;
  private sidechain: GainNode;
  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    private reverb: AudioNode,
    private delay: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.sidechain = ctx.createGain();
    this.sidechain.connect(this.bus);
    this.bus.connect(out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  get current() {
    return this.song.name;
  }
  play(id: string) {
    const song = SONGS[id] ?? SONGS.afterglow;
    if (song === this.song) return;
    this.song = song;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
  }
  /** Schedules every 16th note inside the lookahead window. */
  schedule() {
    const t = this.ctx.currentTime,
      stepTime = 60 / this.song.bpm / 4;
    if (this.nextStep < t - 0.5) this.nextStep = t + 0.05;
    while (this.nextStep < t + 0.15) {
      this.playStep(this.step, this.nextStep, stepTime);
      this.step = (this.step + 1) % (16 * this.song.chords.length);
      this.nextStep += stepTime;
    }
  }
  private playStep(step: number, time: number, stepTime: number) {
    const s = this.song,
      i = step % 16,
      bar = Math.floor(step / 16),
      [offset, minor] = s.chords[bar],
      root = s.key + offset,
      tones = chordTones(root, minor),
      level = this.intensity;
    if (i === 0) this.pad(tones, time, stepTime * 16);
    if (level >= 1) {
      if (s.kick[i] === "x") this.kick(time);
      if (s.snare[i] === "x") this.snare(time);
      if (s.hat[i] === "x") this.hat(time, level >= 2 && i % 4 === 2);
    } else if (s.kick[i] === "x" && i === 0) this.kick(time, 0.35);
    if (s.bass[i] !== "-")
      this.bass(
        midi(root - 24 + (s.bass[i] === "o" ? 12 : 0)),
        time,
        stepTime * 1.8,
        level >= 1 ? 1 : 0.6,
      );
    const arpNote = tones[s.arp[i] % tones.length] + (level >= 2 ? 12 : 0);
    if (level >= 1 || i % 2 === 0)
      this.arp(midi(arpNote), time, level >= 1 ? 0.9 : 0.55);
    if (level >= 2 && i % 2 === 0) {
      const degree = s.lead[bar][i / 2];
      if (degree >= 0) this.lead(midi(scaleNote(s.key + 12, degree)), time, stepTime * 2);
    }
  }
  private env(g: GainNode, time: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }
  private kick(time: number, level = 1) {
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    this.env(g, time, 0.9 * level, 0.002, 0.32);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + 0.4);
    // Sidechain pump on everything melodic.
    const sc = this.sidechain.gain;
    sc.setValueAtTime(0.35, time);
    sc.linearRampToValueAtTime(1, time + 0.22);
  }
  private noiseHit(
    time: number,
    type: BiquadFilterType,
    freq: number,
    peak: number,
    decay: number,
    send = false,
  ) {
    const c = this.ctx,
      src = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    this.env(g, time, peak, 0.001, decay);
    src.connect(f).connect(g).connect(this.bus);
    if (send) g.connect(this.reverb);
    src.start(time, Math.random() * 0.5);
    src.stop(time + decay + 0.05);
  }
  private snare(time: number) {
    this.noiseHit(time, "highpass", 1400, 0.42, 0.2, true);
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, time);
    o.frequency.exponentialRampToValueAtTime(140, time + 0.08);
    this.env(g, time, 0.3, 0.001, 0.1);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + 0.15);
  }
  private hat(time: number, open: boolean) {
    this.noiseHit(time, "highpass", 7500, open ? 0.12 : 0.08, open ? 0.22 : 0.04);
  }
  private bass(freq: number, time: number, length: number, level: number) {
    const c = this.ctx,
      o = c.createOscillator(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(900, time);
    f.frequency.exponentialRampToValueAtTime(180, time + length);
    this.env(g, time, 0.32 * level, 0.005, length);
    o.connect(f).connect(g).connect(this.sidechain);
    o.start(time);
    o.stop(time + length + 0.05);
  }
  private pad(tones: number[], time: number, length: number) {
    const c = this.ctx,
      f = c.createBiquadFilter(),
      g = c.createGain();
    f.type = "lowpass";
    f.frequency.value = this.intensity >= 1 ? 1400 : 900;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.05, time + length * 0.25);
    g.gain.linearRampToValueAtTime(0.035, time + length * 0.8);
    g.gain.linearRampToValueAtTime(0, time + length + 0.3);
    f.connect(g);
    g.connect(this.sidechain);
    g.connect(this.reverb);
    for (const n of tones.slice(0, 3))
      for (const detune of [-9, 9]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midi(n);
        o.detune.value = detune;
        o.connect(f);
        o.start(time);
        o.stop(time + length + 0.4);
      }
  }
  private arp(freq: number, time: number, level: number) {
    const c = this.ctx,
      o = c.createOscillator(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    o.type = "square";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = 2400;
    this.env(g, time, 0.045 * level, 0.003, 0.16);
    o.connect(f).connect(g);
    g.connect(this.sidechain);
    g.connect(this.delay);
    o.start(time);
    o.stop(time + 0.2);
  }
  private lead(freq: number, time: number, length: number) {
    const c = this.ctx,
      o = c.createOscillator(),
      vib = c.createOscillator(),
      vibGain = c.createGain(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    vib.frequency.value = 5.5;
    vibGain.gain.value = freq * 0.006;
    vib.connect(vibGain).connect(o.frequency);
    f.type = "lowpass";
    f.frequency.value = 2800;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.06, time + 0.02);
    g.gain.setTargetAtTime(0, time + length * 0.8, 0.08);
    o.connect(f).connect(g);
    g.connect(this.sidechain);
    g.connect(this.delay);
    g.connect(this.reverb);
    o.start(time);
    vib.start(time);
    o.stop(time + length + 0.4);
    vib.stop(time + length + 0.4);
  }
}
