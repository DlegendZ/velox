import type { SaveData } from "../core/Save";
import { MusicEngine, SONGS, midi } from "./Music";
type Sfx =
  | "click"
  | "hover"
  | "back"
  | "buy"
  | "error"
  | "shift"
  | "checkpoint"
  | "lap"
  | "best"
  | "finish"
  | "nitro"
  | "impact"
  | "count"
  | "go"
  | "token"
  | "nearMiss"
  | "wrongWay"
  | "drift"
  | "achievement"
  | "eliminated"
  | "positionUp"
  | "positionDown"
  | "backfire"
  | "join"
  | "leave";
/** Engine character per sound profile. */
const PROFILES = {
  i4: { cylinders: 4, burble: 0.08, rasp: 0.5, sub: 0.25, drive: 2.2 },
  boxer: { cylinders: 4, burble: 0.32, rasp: 0.35, sub: 0.45, drive: 2.6 },
  v8: { cylinders: 8, burble: 0.38, rasp: 0.25, sub: 0.7, drive: 3.2 },
  v12: { cylinders: 12, burble: 0.05, rasp: 0.8, sub: 0.3, drive: 1.8 },
  ev: { cylinders: 0, burble: 0, rasp: 0, sub: 0, drive: 1 },
} as const;
export type EngineSound = keyof typeof PROFILES;
interface Voice {
  osc: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
}
export interface SpatialSource {
  x: number;
  y: number;
  z: number;
  speed: number;
}
export class AudioManager {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineShaper: WaveShaperNode | null = null;
  private engineOsc: OscillatorNode[] = [];
  private burble: OscillatorNode | null = null;
  private burbleDepth: GainNode | null = null;
  private turbo: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private delay: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: MusicEngine | null = null;
  private wind: GainNode | null = null;
  private skid: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private rain: GainNode | null = null;
  private voices: Voice[] = [];
  private settings: SaveData["settings"]["audio"];
  private lastGear = 1;
  private profile: EngineSound = "i4";
  private wasBoosting = false;
  private lastHover = 0;
  private wantedSong = "afterglow";
  private wantedIntensity = 0;
  private muffled = false;
  constructor(settings: SaveData["settings"]["audio"]) {
    this.settings = settings;
  }
  async start() {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }
    try {
      const ctx = (this.context = new AudioContext());
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.settings.master;
      this.master.connect(compressor);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
      // Shared effects: generated reverb tail and a dotted-eighth echo.
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.35;
      this.reverb.connect(reverbReturn).connect(this.master);
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.38;
      const feedback = ctx.createGain(),
        delayReturn = ctx.createGain(),
        delayTone = ctx.createBiquadFilter();
      feedback.gain.value = 0.38;
      delayReturn.gain.value = 0.5;
      delayTone.type = "lowpass";
      delayTone.frequency.value = 2200;
      this.delay.connect(delayTone).connect(feedback).connect(this.delay);
      delayTone.connect(delayReturn);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.settings.music;
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = "lowpass";
      this.musicFilter.frequency.value = 20000;
      this.musicGain.connect(this.musicFilter).connect(this.master);
      delayReturn.connect(this.musicGain);
      const musicReverb = ctx.createGain();
      musicReverb.connect(this.reverb);
      this.music = new MusicEngine(ctx, this.musicGain, musicReverb, this.delay);
      this.music.play(this.wantedSong);
      this.music.intensity = this.wantedIntensity;
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx;
      this.sfxGain.connect(this.master);
      this.buildEngine(ctx);
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      for (const kind of ["wind", "skid", "rain"] as const) {
        const filter = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        filter.type =
          kind === "wind" ? "lowpass" : kind === "skid" ? "bandpass" : "highpass";
        filter.frequency.value =
          kind === "wind" ? 650 : kind === "skid" ? 1500 : 900;
        filter.Q.value = kind === "skid" ? 7 : 0.5;
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        this[kind] = gain;
        if (kind === "skid") this.skidFilter = filter;
      }
      source.start();
      for (let i = 0; i < 3; i++) this.voices.push(this.buildVoice(ctx));
    } catch {
      /* Audio availability does not block play. */
    }
  }
  private impulse(seconds: number) {
    const ctx = this.context!,
      length = Math.floor(ctx.sampleRate * seconds),
      buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++)
        d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buffer;
  }
  private buildEngine(ctx: AudioContext) {
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.Q.value = 1.2;
    this.engineShaper = ctx.createWaveShaper();
    this.engineShaper.curve = this.shaperCurve(2.2);
    const am = ctx.createGain();
    this.engineShaper.connect(this.engineFilter);
    this.engineFilter.connect(am).connect(this.engineGain).connect(this.master!);
    // Fundamental (firing frequency), sub-harmonic and a rasp harmonic.
    for (const type of ["sawtooth", "square", "sawtooth"] as OscillatorType[]) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = type;
      o.frequency.value = 40;
      g.gain.value = 0.3;
      o.connect(g).connect(this.engineShaper);
      o.start();
      this.engineOsc.push(o);
      (o as OscillatorNode & { level?: GainNode }).level = g;
    }
    // Low-frequency burble modulates loudness like uneven firing.
    this.burble = ctx.createOscillator();
    this.burble.frequency.value = 12;
    this.burbleDepth = ctx.createGain();
    this.burbleDepth.gain.value = 0;
    am.gain.value = 1;
    this.burble.connect(this.burbleDepth).connect(am.gain);
    this.burble.start();
    this.turbo = ctx.createOscillator();
    this.turbo.type = "sine";
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.master!);
    this.turbo.start();
  }
  private shaperCurve(amount: number) {
    const n = 1024,
      curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
  }
  private buildVoice(ctx: AudioContext): Voice {
    const filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      panner = ctx.createPanner();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    gain.gain.value = 0;
    panner.panningModel = "equalpower";
    panner.distanceModel = "inverse";
    panner.refDistance = 5;
    panner.rolloffFactor = 1.3;
    panner.maxDistance = 200;
    const osc = (["sawtooth", "square"] as OscillatorType[]).map((type) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 60;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(panner).connect(this.master!);
    return { osc, filter, gain, panner };
  }
  get songName() {
    return SONGS[this.wantedSong]?.name ?? "";
  }
  /** Selects the soundtrack: song id plus intensity (0 menus, 1 racing, 2 final lap). */
  setMusic(song: string, intensity: number) {
    this.wantedSong = song;
    this.wantedIntensity = intensity;
    if (this.music) {
      this.music.play(song);
      this.music.intensity = intensity;
    }
  }
  /** Muffles music behind pause menus. */
  setMuffled(on: boolean) {
    if (on === this.muffled) return;
    this.muffled = on;
    if (this.musicFilter && this.context)
      this.musicFilter.frequency.setTargetAtTime(
        on ? 650 : 20000,
        this.context.currentTime,
        0.15,
      );
  }
  configure(s: SaveData["settings"]["audio"]) {
    this.settings = s;
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master?.gain.setTargetAtTime(s.master, t, 0.05);
    this.musicGain?.gain.setTargetAtTime(s.music, t, 0.05);
    this.sfxGain?.gain.setTargetAtTime(s.sfx, t, 0.05);
  }
  driveEffects(
    active: boolean,
    speed: number,
    slip: number,
    boosting: boolean,
    weather: string,
  ) {
    if (!this.context) return;
    const time = this.context.currentTime,
      sfx = this.settings.sfx;
    this.wind?.gain.setTargetAtTime(
      active
        ? sfx *
            (Math.min(0.06, (speed / 100) ** 2 * 0.012) + (boosting ? 0.05 : 0))
        : 0,
      time,
      0.1,
    );
    const squeal = active && Math.abs(speed) > 25 ? Math.min(1, slip) : 0;
    this.skid?.gain.setTargetAtTime(sfx * 0.16 * squeal, time, 0.05);
    this.skidFilter?.frequency.setTargetAtTime(
      1200 + squeal * 700 + Math.sin(time * 9) * 80,
      time,
      0.05,
    );
    this.rain?.gain.setTargetAtTime(
      weather === "rain" && active ? sfx * 0.05 : 0,
      time,
      0.5,
    );
    if (active && boosting && !this.wasBoosting) this.sfx("nitro");
    this.wasBoosting = boosting && active;
  }
  update(
    rpm: number,
    throttle: number,
    speed: number,
    gear: number,
    active: boolean,
    profile: EngineSound = "i4",
    turbo = 0,
  ) {
    if (!this.context || !this.engineGain || !this.engineFilter) return;
    const ctx = this.context,
      t = ctx.currentTime;
    this.music?.schedule();
    if (profile !== this.profile) {
      this.profile = profile;
      this.engineShaper!.curve = this.shaperCurve(PROFILES[profile].drive);
      this.engineOsc.forEach(
        (o, i) =>
          (o.type =
            profile === "ev" ? "sine" : i === 1 ? "square" : "sawtooth"),
      );
    }
    const p = PROFILES[profile],
      ev = profile === "ev";
    this.engineGain.gain.setTargetAtTime(
      active
        ? this.settings.engine *
            (0.05 + throttle * 0.07 + Math.min(0.04, Math.abs(speed) * 0.0002))
        : 0,
      t,
      0.06,
    );
    const firing = ev ? 60 + rpm / 14 : Math.max(18, (rpm / 60) * (p.cylinders / 2));
    const levels = ev ? [0, 0, 0.5] : [0.35, p.sub * 0.4, p.rasp * 0.25];
    this.engineOsc.forEach((o, i) => {
      o.frequency.setTargetAtTime(
        firing * (i === 1 ? 0.5 : i === 2 ? (ev ? 3.01 : 2.003) : 1),
        t,
        0.03,
      );
      (o as OscillatorNode & { level?: GainNode }).level?.gain.setTargetAtTime(
        ev ? (i === 0 ? 0.4 : levels[i]) : levels[i],
        t,
        0.1,
      );
    });
    this.engineFilter.frequency.setTargetAtTime(
      ev ? 2400 : 260 + rpm * 0.22 + throttle * 1100,
      t,
      0.06,
    );
    this.burble?.frequency.setTargetAtTime(
      Math.max(4, firing / Math.max(1, p.cylinders)),
      t,
      0.05,
    );
    this.burbleDepth?.gain.setTargetAtTime(
      p.burble * (1.2 - throttle * 0.6),
      t,
      0.1,
    );
    this.turbo?.frequency.setTargetAtTime(1800 + rpm * 0.45, t, 0.08);
    this.turboGain?.gain.setTargetAtTime(
      active && !ev
        ? this.settings.engine * turbo * 0.0045 * throttle * (rpm / 8000)
        : 0,
      t,
      0.12,
    );
    if (gear !== this.lastGear && active) {
      this.sfx("shift");
      // Momentary torque cut on the shift.
      this.engineGain.gain.setValueAtTime(this.engineGain.gain.value * 0.3, t);
    }
    this.lastGear = gear;
  }
  /** Positions the listener and drives up to three spatial opponent engines. */
  spatial(
    listener: { x: number; y: number; z: number; fx: number; fz: number },
    sources: SpatialSource[],
  ) {
    const ctx = this.context;
    if (!ctx) return;
    const l = ctx.listener,
      t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(listener.x, t, 0.02);
      l.positionY.setTargetAtTime(listener.y, t, 0.02);
      l.positionZ.setTargetAtTime(listener.z, t, 0.02);
      l.forwardX.setTargetAtTime(listener.fx, t, 0.02);
      l.forwardY.setTargetAtTime(0, t, 0.02);
      l.forwardZ.setTargetAtTime(listener.fz, t, 0.02);
    }
    const nearest = sources
      .map((s) => ({
        s,
        d: (s.x - listener.x) ** 2 + (s.z - listener.z) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.voices.length);
    this.voices.forEach((v, i) => {
      const n = nearest[i];
      v.gain.gain.setTargetAtTime(
        n ? this.settings.engine * 0.09 : 0,
        t,
        0.15,
      );
      if (!n) return;
      v.panner.positionX.setTargetAtTime(n.s.x, t, 0.03);
      v.panner.positionY.setTargetAtTime(n.s.y, t, 0.03);
      v.panner.positionZ.setTargetAtTime(n.s.z, t, 0.03);
      const speed = Math.abs(n.s.speed),
        gear = Math.min(6, Math.floor(speed / 42) + 1),
        rpm = 950 + (speed / (gear * 42)) * 6200;
      v.osc.forEach((o, k) =>
        o.frequency.setTargetAtTime(
          (rpm / 60) * 2 * (k ? 0.5 : 1),
          t,
          0.05,
        ),
      );
      v.filter.frequency.setTargetAtTime(400 + rpm * 0.15, t, 0.1);
    });
  }
  silenceSpatial() {
    if (!this.context) return;
    for (const v of this.voices)
      v.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
  }
  private tone(
    freq: number,
    start: number,
    length: number,
    type: OscillatorType,
    peak: number,
    endFreq?: number,
    reverb = false,
  ) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + length);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    o.connect(g).connect(this.sfxGain!);
    if (reverb && this.reverb) g.connect(this.reverb);
    o.start(start);
    o.stop(start + length + 0.05);
  }
  private burst(
    start: number,
    length: number,
    type: BiquadFilterType,
    freq: number,
    peak: number,
    endFreq?: number,
  ) {
    const c = this.context!,
      src = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + length);
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(start, Math.random());
    src.stop(start + length + 0.05);
  }
  sfx(type: Sfx = "click") {
    if (!this.context || !this.sfxGain) return;
    const t = this.context.currentTime;
    switch (type) {
      case "click":
        this.tone(1250, t, 0.06, "triangle", 0.14, 900);
        break;
      case "hover":
        if (t - this.lastHover < 0.05) return;
        this.lastHover = t;
        this.tone(2300, t, 0.03, "sine", 0.03);
        break;
      case "back":
        this.tone(700, t, 0.1, "triangle", 0.12, 380);
        break;
      case "buy":
        this.tone(midi(83), t, 0.12, "square", 0.08);
        this.tone(midi(88), t + 0.09, 0.4, "square", 0.08, undefined, true);
        break;
      case "error":
        this.tone(140, t, 0.22, "sawtooth", 0.08, 110);
        break;
      case "shift":
        this.burst(t, 0.12, "bandpass", 3200, 0.08, 1400);
        this.tone(95, t, 0.08, "square", 0.06, 50);
        break;
      case "checkpoint":
        this.tone(midi(84), t, 0.18, "sine", 0.12, undefined, true);
        this.tone(midi(91), t + 0.06, 0.25, "sine", 0.09, undefined, true);
        break;
      case "lap":
        [76, 81, 88].forEach((n, i) =>
          this.tone(midi(n), t + i * 0.08, 0.35, "triangle", 0.12, undefined, true),
        );
        break;
      case "best":
        [72, 76, 79, 84, 88].forEach((n, i) =>
          this.tone(midi(n), t + i * 0.07, 0.5, "square", 0.06, undefined, true),
        );
        break;
      case "finish":
        [60, 64, 67, 72].forEach((n) => {
          this.tone(midi(n), t, 1.6, "sawtooth", 0.05, undefined, true);
          this.tone(midi(n + 12), t + 0.15, 1.4, "triangle", 0.05, undefined, true);
        });
        this.burst(t, 1.2, "highpass", 6000, 0.05);
        break;
      case "nitro":
        this.burst(t, 0.6, "bandpass", 400, 0.35, 2600);
        this.tone(70, t, 0.5, "sawtooth", 0.08, 140);
        break;
      case "impact":
        this.tone(90, t, 0.3, "sine", 0.5, 38);
        this.burst(t, 0.25, "lowpass", 2400, 0.4, 300);
        this.burst(t + 0.02, 0.18, "bandpass", 4200, 0.12);
        break;
      case "count":
        this.tone(midi(69), t, 0.25, "square", 0.08);
        break;
      case "go":
        this.tone(midi(81), t, 0.7, "square", 0.09, undefined, true);
        this.tone(midi(88), t, 0.7, "triangle", 0.06, undefined, true);
        break;
      case "token":
        [88, 93, 100].forEach((n, i) =>
          this.tone(midi(n), t + i * 0.05, 0.25, "sine", 0.1, undefined, true),
        );
        break;
      case "nearMiss":
        this.burst(t, 0.45, "bandpass", 3000, 0.3, 500);
        break;
      case "wrongWay":
        this.tone(220, t, 0.18, "square", 0.07);
        this.tone(220, t + 0.25, 0.18, "square", 0.07);
        break;
      case "drift":
        this.tone(midi(79), t, 0.2, "triangle", 0.1);
        this.tone(midi(86), t + 0.07, 0.3, "triangle", 0.1, undefined, true);
        break;
      case "achievement":
        [72, 79, 84, 88, 91].forEach((n, i) =>
          this.tone(midi(n), t + i * 0.09, 0.8, "triangle", 0.09, undefined, true),
        );
        break;
      case "eliminated":
        [67, 63, 60].forEach((n, i) =>
          this.tone(midi(n), t + i * 0.12, 0.3, "square", 0.07),
        );
        break;
      case "positionUp":
        this.tone(midi(84), t, 0.12, "sine", 0.08, midi(91));
        break;
      case "positionDown":
        this.tone(midi(76), t, 0.14, "sine", 0.06, midi(69));
        break;
      case "backfire":
        this.burst(t, 0.09, "lowpass", 900, 0.6);
        this.tone(75, t, 0.08, "sine", 0.3, 40);
        break;
      case "join":
        this.tone(midi(76), t, 0.15, "sine", 0.1);
        this.tone(midi(83), t + 0.1, 0.25, "sine", 0.1, undefined, true);
        break;
      case "leave":
        this.tone(midi(83), t, 0.15, "sine", 0.1);
        this.tone(midi(76), t + 0.1, 0.25, "sine", 0.1);
        break;
    }
  }
}
