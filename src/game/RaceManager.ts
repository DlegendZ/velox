import { TRACK_SECTORS } from "./TrackGeometry";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { VehicleController } from "../physics/VehicleController";
import { Track } from "./TrackBuilder";
import { CarFactory, disposeObject, type CarModel } from "./CarFactory";
import { Checkpoints, noseProgress } from "./Checkpoints";
import { AIDriver, type NearInfo } from "./AIDriver";
import { RemoteCar, type Snapshot } from "./RemoteCar";
import { AI_PROFILES, TUNING } from "../data/tuning";
import { carById } from "../data/cars";
import { TRACKS, type RaceMode } from "../data/tracks";
import {
  newOwned,
  type GhostFrame,
  type Save,
  type Visual,
} from "../core/Save";
import type { Controls } from "../core/Input";
import { Effects } from "../fx/Effects";
import { createSky } from "../render/Sky";
import { Traffic } from "./Traffic";
import { FEATURES } from "../data/features";
export interface RaceConfig {
  mode: RaceMode;
  track: string;
  laps: number;
  difficulty: keyof typeof TUNING.difficulties;
  reverse: boolean;
  weather: string;
  eventId?: string;
  /** Number of AI rivals (race and elimination); defaults to five. */
  rivals?: number;
}
export interface Standing {
  name: string;
  kind: "player" | "ai" | "remote";
  color: string;
  car: string;
  time: number | null;
  best: number | null;
  progress: number;
  estimated: boolean;
  out: boolean;
}
export interface RaceResult {
  position: number;
  time: number;
  laps: number[];
  best: number;
  score: number;
  credits: number;
  xp: number;
  stars: number;
  clean: number;
  nearMisses: number;
  completed: boolean;
  standings: Standing[];
  newBest: boolean;
}
/** Per-race counters merged into the profile statistics afterwards. */
export interface RaceStats {
  distance: number;
  topSpeed: number;
  bestDrift: number;
  longestAir: number;
  nearMisses: number;
  overtakes: number;
  hits: number;
  tokens: number;
  traps: number;
  nitroTime: number;
}
export interface NetPlayer {
  id: string;
  name: string;
  car: string;
  visual: Visual;
  slot: number;
}
export interface NetRace {
  localSlot: number;
  remotes: NetPlayer[];
}
export type RaceEvent =
  | { type: "count"; value: number }
  | { type: "go" }
  | { type: "checkpoint"; delta: number | null }
  | { type: "lap"; best: boolean; final: boolean }
  | { type: "impact"; strength: number }
  | { type: "scrape" }
  | { type: "boostPad" }
  | { type: "nearMiss" }
  | { type: "drift"; points: number }
  | { type: "token" }
  | { type: "trap" }
  | { type: "air"; seconds: number }
  | { type: "position"; delta: number }
  | { type: "eliminated"; name: string }
  | { type: "wrongWay" }
  | { type: "backfire" };
const tmp = new THREE.Vector3(),
  forward = new THREE.Vector3();
const NEUTRAL: Controls = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  nitro: false,
  rear: false,
};
export const WEATHER_GRIP: Record<string, number> = {
  clear: 1,
  rain: 0.86,
  fog: 0.97,
  snow: 0.74,
};
export class RaceManager {
  world: RAPIER.World;
  track: Track;
  root = new THREE.Group();
  player: VehicleController;
  models: CarModel[] = [];
  vehicles: VehicleController[] = [];
  names: string[] = [];
  colors: string[] = [];
  ai: AIDriver[] = [];
  traffic: Traffic | null = null;
  remotes = new Map<string, RemoteCar>();
  checkpoints: Checkpoints[] = [];
  near: NearInfo[] = [];
  finishTimes: (number | null)[] = [];
  effects: Effects;
  sky: ReturnType<typeof createSky>;
  stats: RaceStats = {
    distance: 0,
    topSpeed: 0,
    bestDrift: 0,
    longestAir: 0,
    nearMisses: 0,
    overtakes: 0,
    hits: 0,
    tokens: 0,
    traps: 0,
    nitroTime: 0,
  };
  time = 0;
  countdown = TUNING.countdown;
  /** Multiplayer: the grid holds until every player has loaded. */
  waiting = false;
  finished = false;
  score = 0;
  combo = 1;
  comboTime = 0;
  driftPoints = 0;
  nearMisses = 0;
  hits = 0;
  position = 6;
  timeLeft = TUNING.rushTime;
  tokens = 0;
  popup = "";
  popupTime = 0;
  bestLap: number | null = null;
  bestSplits: number[] | null = null;
  splits: number[] = [];
  lastDelta: number | null = null;
  ghost: CarModel | null = null;
  recording: GhostFrame[] = [];
  replay: GhostFrame[][] = [];
  airtime = 0;
  night: boolean;
  newBest = false;
  private trapped = new Set<number>();
  private recordTimer = 0;
  private ghostIndex = 0;
  private nearCooldown = 0;
  private impactCooldown = 0;
  private scrapeCooldown = 0;
  private padContacts = new Set<number>();
  private replayTimer = 0;
  private lastCount = 4;
  private wasWrongWay = false;
  private backfireCooldown = 0;
  private stuck = 0;
  clock = 0;
  onFinish = (result: RaceResult) => {};
  onCheckpoint = () => {};
  onEvent = (event: RaceEvent) => {};
  constructor(
    public config: RaceConfig,
    public save: Save,
    public net: NetRace | null = null,
  ) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = TUNING.step;
    const spec = TRACKS.find((t) => t.id === config.track) ?? TRACKS[0];
    this.track = new Track(
      spec,
      this.world,
      config.reverse,
      config.weather,
      config.mode === "roam",
    );
    this.root.add(this.track.root);
    this.night = spec.environment === "neon" || config.weather !== "clear";
    if (FEATURES.traffic && config.mode === "roam" && spec.length === "gp") {
      this.traffic = new Traffic(this.track, this.world);
      this.root.add(this.traffic.root);
    }
    this.sky = createSky(spec.environment, config.weather);
    this.root.add(this.sky.root);
    const playerSpot = this.gridSpot(
      net ? net.localSlot : 0,
      carById(save.data.garage.activeCar).length,
    );
    this.player = new VehicleController(
      this.world,
      carById(save.data.garage.activeCar),
      save.active,
      playerSpot.point,
      playerSpot.yaw,
    );
    this.addVehicle(
      this.player,
      save.data.profile.name,
      save.active.visual.paint,
      save.active.visual,
    );
    const rivals =
      config.mode === "race" || config.mode === "elimination"
        ? Math.max(0, Math.min(5, config.rivals ?? 5))
        : 0;
    if (!net)
      AI_PROFILES.slice(0, rivals).forEach((baseProfile, i) => {
        const profile =
          config.eventId === "tier4_4" && i === 0
            ? {
                ...baseProfile,
                name: "WRAITH",
                car: "phantom",
                skill: 1.08,
                color: "#a8eff0",
              }
            : baseProfile;
        const spawn = this.gridSpot(i + 1, carById(profile.car).length);
        const owned = newOwned(profile.car);
        owned.visual.paint = profile.color;
        const vehicle = new VehicleController(
          this.world,
          carById(profile.car),
          owned,
          spawn.point,
          spawn.yaw,
        );
        this.addVehicle(vehicle, profile.name, profile.color, owned.visual);
        this.ai.push(new AIDriver(vehicle, profile, config.difficulty));
      });
    if (net)
      for (const r of net.remotes) {
        const spot = this.gridSpot(r.slot, carById(r.car).length);
        const remote = new RemoteCar(
          this.world,
          r.id,
          r.name,
          carById(r.car),
          r.visual,
          spot.point,
          spot.yaw,
        );
        remote.model.setHeadlights(this.night);
        this.remotes.set(r.id, remote);
        this.root.add(remote.model.root);
      }
    this.position = this.vehicles.length + this.remotes.size;
    const record = save.data.records[this.recordKey];
    this.bestLap = record?.bestLap ?? null;
    this.bestSplits = record?.splits ?? null;
    if (config.mode === "time" && record?.ghost) {
      this.ghost = CarFactory.buildProcedural(
        this.player.spec,
        save.active.visual,
        false,
      );
      const ghostly = (m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.22;
        c.depthWrite = false;
        return c;
      };
      this.ghost.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = Array.isArray(o.material)
            ? o.material.map(ghostly)
            : ghostly(o.material);
        }
      });
      this.ghost.beams.forEach((b) => (b.visible = false));
      this.root.add(this.ghost.root);
    }
    this.effects = new Effects(config.weather, spec.environment === "canyon");
    this.root.add(this.effects.root);
    if (config.mode === "roam")
      this.track.tokens.forEach((t) => (t.visible = true));
    this.near = this.vehicles.map((v) => this.track.nearest(v.position));
    this.position = this.computePosition();
    this.render(1);
    this.announce(net ? "MULTIPLAYER GRID" : "WELCOME TO THE AFTER HOURS");
  }
  private addVehicle(
    v: VehicleController,
    name: string,
    color: string,
    visual: Visual,
  ) {
    this.vehicles.push(v);
    this.names.push(name);
    this.colors.push(color);
    this.checkpoints.push(new Checkpoints());
    this.finishTimes.push(null);
    // Only the player's car (added first) gets clearcoat paint and map shadows.
    const model = CarFactory.buildProcedural(
      v.spec,
      visual,
      this.vehicles.length === 1,
    );
    model.setHeadlights(this.night);
    this.models.push(model);
    this.root.add(model.root);
  }
  gridSpot(slot: number, length: number) {
    const spot = this.track.at(0, slot % 2 ? 2.6 : -2.6);
    spot.point.addScaledVector(
      spot.tangent,
      -(3 + length / 2 + Math.floor(slot / 2) * 7),
    );
    spot.point.y += 0.66;
    return spot;
  }
  get recordKey() {
    return this.config.track + (this.config.reverse ? "_reverse" : "");
  }
  get lap() {
    return this.checkpoints[0].lap;
  }
  get currentLapTime() {
    return this.time - this.checkpoints[0].lapStart;
  }
  get wrongWay() {
    return this.checkpoints[0].wrongWay;
  }
  inTunnel(t: number) {
    return this.track.inSection("tunnel", t);
  }
  get racing() {
    return this.countdown <= 0 && !this.waiting && !this.finished;
  }
  /** Laps-plus-fraction progress used for ranking every kind of racer. */
  progressOf(i: number) {
    const near = this.near[i],
      passed = this.checkpoints[i].passed;
    if (!near) return passed;
    // Cars still behind the start line on the grid count as slightly negative progress.
    if (passed === 0 && near.t > 0.5) return (near.t - 1) * TRACK_SECTORS;
    return passed + ((near.t * TRACK_SECTORS) % 1);
  }
  announce(message: string) {
    this.popup = message;
    this.popupTime = 2.2;
  }
  /** Releases the multiplayer grid hold and starts the countdown. */
  go() {
    this.waiting = false;
  }
  updateRemote(id: string, s: Snapshot) {
    this.remotes.get(id)?.push(s);
  }
  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.dispose();
    disposeObject(r.model.root);
    this.remotes.delete(id);
  }
  remoteFinished(id: string, time: number, best: number | null) {
    const r = this.remotes.get(id);
    if (r) {
      r.finishTime = time;
      r.bestLap = best;
    }
  }
  private step() {
    this.world.step();
    for (const v of this.vehicles) {
      v.wallContact(this.world, this.track.wallHandles);
      v.sync();
    }
    for (const r of this.remotes.values()) r.fixed();
  }
  fixed(dt: number, controls: Controls) {
    this.clock += dt;
    if (!this.waiting && this.countdown <= 0) this.traffic?.fixed(dt);
    if (this.finished) {
      // Keep the world alive (remote cars, coasting player) behind the results screen.
      this.player.update(dt, NEUTRAL, this.save.data.settings);
      for (const a of this.ai)
        if (!a.eliminated)
          a.vehicle.update(
            dt,
            a.drive(
              dt,
              this.track,
              this.near[this.vehicles.indexOf(a.vehicle)],
              0,
              false,
              this.vehicles,
            ),
            this.save.data.settings,
          );
      this.step();
      this.updateNear();
      return;
    }
    if (this.waiting || this.countdown > 0) {
      if (!this.waiting) {
        this.countdown -= dt;
        const count = Math.ceil(this.countdown);
        if (count !== this.lastCount && count > 0) {
          this.lastCount = count;
          this.onEvent({ type: "count", value: count });
        }
        if (this.countdown <= 0) this.onEvent({ type: "go" });
      }
      for (const v of this.vehicles)
        v.update(dt, NEUTRAL, this.save.data.settings);
      this.step();
      return;
    }
    this.time += dt;
    this.popupTime = Math.max(0, this.popupTime - dt);
    this.nearCooldown = Math.max(0, this.nearCooldown - dt);
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.scrapeCooldown = Math.max(0, this.scrapeCooldown - dt);
    this.backfireCooldown = Math.max(0, this.backfireCooldown - dt);
    const settings = this.save.data.settings;
    const weatherGrip = WEATHER_GRIP[this.config.weather] ?? 1;
    const gripAt = (t: number) =>
      this.track.gripAt(t) *
      weatherGrip *
      (this.track.spec.environment === "canyon" &&
      this.track.spec.length !== "gp" &&
      t > 0.55 &&
      t < 0.75
        ? 0.78
        : 1);
    const input = { ...controls };
    if (this.config.weather !== "clear") input.steer *= 0.95;
    this.player.surfaceGrip =
      gripAt(this.near[0].t) *
      (this.near[0].distance > this.track.halfWidthAt(this.near[0].t) + 0.5
        ? 0.82
        : 1);
    const activePads = new Set<number>();
    for (const [i, section] of (this.track.spec.sections ?? []).entries())
      if (section.type === "boost") {
        const t = this.track.reverse ? 1 - section.at : section.at;
        if (this.track.at(t).point.distanceTo(this.player.position) < 6) {
          activePads.add(i);
          if (!this.padContacts.has(i)) {
            this.player.nitro = Math.min(
              this.player.nitroMax,
              this.player.nitro + 15,
            );
            this.announce("BOOST PAD +15 NITRO");
            this.onEvent({ type: "boostPad" });
          }
        }
      }
    this.padContacts = activePads;
    this.player.update(dt, input, settings);
    for (const a of this.ai)
      if (!a.eliminated) {
        const i = this.vehicles.indexOf(a.vehicle);
        a.vehicle.surfaceGrip = gripAt(this.near[i].t);
        a.vehicle.update(
          dt,
          a.drive(
            dt,
            this.track,
            this.near[i],
            this.near[0].t,
            settings.assists.rubberband,
            this.vehicles,
          ),
          settings,
        );
      }
    this.step();
    this.updateNear();
    for (const [i, v] of this.vehicles.entries()) {
      if (i && this.ai[i - 1].eliminated) continue;
      const near = this.near[i],
        at = this.track.at(near.t);
      forward.set(0, 0, 1).applyQuaternion(v.quaternion);
      const checkpoints = this.checkpoints[i];
      const crossing = checkpoints.update(
        noseProgress(
          this.track,
          v.position,
          v.quaternion,
          v.spec.length,
          near.index,
        ).t,
        this.time,
        forward.dot(at.tangent),
      );
      if (i && crossing === "lap" && this.finishTimes[i] === null) {
        if (checkpoints.lap > this.config.laps && this.config.mode !== "roam")
          this.finishTimes[i] = this.time;
      }
      if (i === 0 && crossing) {
        v.nitro = Math.min(v.nitroMax, v.nitro + 7);
        this.onCheckpoint();
        const split = this.currentLapTime,
          sector = checkpoints.passed % 12;
        if (crossing === "checkpoint") {
          this.splits[sector] = split;
          const best = this.bestSplits?.[sector];
          this.lastDelta = best ? split - best : null;
          this.onEvent({ type: "checkpoint", delta: this.lastDelta });
        }
        if (this.config.mode === "rush") {
          this.timeLeft += TUNING.rushBonus;
          this.announce(`CHECKPOINT +${TUNING.rushBonus}s`);
        }
        if (crossing === "lap") {
          this.completedLap();
          if (this.finished) return;
        } else if (this.hits === 0 && checkpoints.passed % 3 === 0)
          this.announce("CLEAN SECTION  +150");
      }
      if (
        v.position.y < this.track.at(near.t).point.y - 6 ||
        (near.distance > TUNING.resetDistance && this.config.mode !== "roam")
      ) {
        const safe = this.track.at(
          checkpoints.lastSafe,
          i ? this.ai[i - 1].profile.lane : 0,
        );
        v.reset(safe.point, safe.yaw);
        if (i === 0) {
          this.hits++;
          this.announce("BACK ON TRACK");
        }
      }
    }
    if (this.wrongWay && Math.abs(this.player.speed) > 15 && !this.wasWrongWay)
      this.onEvent({ type: "wrongWay" });
    this.wasWrongWay = this.wrongWay && Math.abs(this.player.speed) > 15;
    const previous = this.position;
    this.position = this.computePosition();
    if (this.position !== previous && this.time > 1) {
      this.onEvent({ type: "position", delta: previous - this.position });
      if (this.position < previous)
        this.stats.overtakes += previous - this.position;
    }
    this.scoring(dt, controls);
    this.effects.update(
      dt,
      [
        ...this.vehicles.map((car, i) => ({
          car,
          length: car.spec.length,
          offroad:
            this.near[i].distance >
            this.track.halfWidthAt(this.near[0].t) + 0.6,
        })),
        ...[...this.remotes.values()].map((car) => ({
          car,
          length: car.spec.length,
          offroad: false,
        })),
      ],
      this.player.position,
    );
    this.record(dt);
    if (this.config.mode === "drift" && this.time >= TUNING.driftDuration)
      this.finish(true);
    if (this.config.mode === "rush") {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.finish(false);
    }
    if (this.config.mode === "roam")
      for (const token of this.track.tokens) {
        if (
          !token.userData.collected &&
          token.position.distanceTo(this.player.position) < 2.2
        ) {
          token.userData.collected = true;
          token.visible = false;
          this.tokens++;
          this.stats.tokens++;
          this.save.reward(250, 25);
          this.announce("STREET TOKEN  +250 CR");
          this.onEvent({ type: "token" });
        }
        if (token.visible) {
          token.rotation.y += dt * 2;
          token.position.y = 1.1 + Math.sin(this.clock * 2 + token.id) * 0.15;
        }
      }
  }
  private updateNear() {
    for (let i = 0; i < this.vehicles.length; i++)
      this.near[i] = this.track.nearest(
        this.vehicles[i].position,
        this.near[i]?.index ?? -1,
      );
  }
  private computePosition() {
    const mine = this.progressOf(0);
    let ahead = 0;
    for (let i = 1; i < this.vehicles.length; i++)
      if (!this.ai[i - 1].eliminated && this.progressOf(i) > mine) ahead++;
    for (const r of this.remotes.values())
      if (r.finishTime !== null || r.progress > mine) ahead++;
    return ahead + 1;
  }
  private scoring(dt: number, controls: Controls) {
    const p = this.player,
      speed = Math.abs(p.speed);
    this.stats.distance += (speed / 3.6) * dt;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, speed);
    if (p.boosting) this.stats.nitroTime += dt;
    this.stuck =
      controls.throttle + controls.brake > 0 && speed < 4 ? this.stuck + dt : 0;
    if (this.stuck > 2.5 && this.popupTime < 0.1)
      this.announce("STUCK? PRESS R TO RESET");
    if (p.drifting) {
      this.comboTime += dt;
      this.combo = Math.min(5, 1 + Math.floor(this.comboTime / 2));
      const gained = Math.round(dt * speed * this.combo * 0.8);
      this.score += gained;
      this.driftPoints += gained;
    } else {
      if (this.comboTime > 0.6) {
        this.announce(
          `DRIFT BANKED  +${fmtNum(this.driftPoints)}  ×${this.combo}`,
        );
        this.stats.bestDrift = Math.max(this.stats.bestDrift, this.driftPoints);
        this.onEvent({ type: "drift", points: this.driftPoints });
      }
      this.comboTime = 0;
      this.combo = 1;
      this.driftPoints = 0;
    }
    forward.set(0, 0, 1).applyQuaternion(p.quaternion);
    const others: { position: THREE.Vector3; speed: number }[] = [
      ...this.ai.filter((a) => !a.eliminated).map((a) => a.vehicle),
      ...this.remotes.values(),
      ...(this.traffic?.actors ?? []),
    ];
    for (const o of others) {
      tmp.copy(o.position).sub(p.position);
      const distance = tmp.length();
      if (
        distance < 15 &&
        distance > 4 &&
        tmp.normalize().dot(forward) > 0.985 &&
        p.speed > 50
      ) {
        p.nitro = Math.min(p.nitroMax, p.nitro + dt * 8);
        if (this.popupTime < 0.1) this.announce("SLIPSTREAM");
      }
      if (
        distance < 3.4 &&
        distance > 2 &&
        p.speed > 80 &&
        Math.abs(p.speed - o.speed) > 15 &&
        this.nearCooldown === 0 &&
        p.impact === 0
      ) {
        this.nearMisses++;
        this.stats.nearMisses++;
        this.score += 300;
        this.announce("NEAR MISS  +300");
        this.nearCooldown = 4;
        this.onEvent({ type: "nearMiss" });
      }
    }
    for (const [i, v] of this.vehicles.entries()) {
      const wallHard = v.wallImpact > 6;
      if (v.wallImpact > 1.5 && Math.abs(v.speed) > 40) {
        this.effects.sparks(v.wallPoint, v.wallImpact);
        if (i === 0 && this.scrapeCooldown === 0 && !wallHard) {
          this.onEvent({ type: "scrape" });
          this.scrapeCooldown = 0.4;
        }
      }
      const impact = v.touchingWall ? v.wallImpact : v.impact;
      if (
        (wallHard || (!v.touchingWall && impact > 2.5)) &&
        (i === 0 || v.position.distanceTo(p.position) < 60)
      ) {
        tmp.copy(v.impactDirection).multiplyScalar(1.6).add(v.position);
        tmp.y = v.position.y + 0.1;
        this.effects.sparks(v.touchingWall ? v.wallPoint : tmp, impact);
        if (i === 0 && this.impactCooldown === 0) {
          this.onEvent({ type: "impact", strength: impact });
          this.impactCooldown = 0.35;
          if (
            (v.touchingWall ? wallHard : impact > 5) &&
            controls.brake === 0
          ) {
            this.hits++;
            this.stats.hits++;
            this.announce("WATCH THE PAINT");
          }
        }
      }
    }
    if (
      (p.limiter > 0.08 ||
        (p.lifted && p.rpm > 5200 && Math.random() < 0.04)) &&
      this.backfireCooldown === 0
    ) {
      this.effects.backfire(p, p.spec.length);
      this.backfireCooldown = 0.25 + Math.random() * 0.4;
      this.onEvent({ type: "backfire" });
    }
    let grounded = false;
    for (let i = 0; i < 4; i++) grounded ||= p.controller.wheelIsInContact(i);
    if (!grounded) this.airtime += dt;
    else if (this.airtime > 0) {
      if (this.airtime > 0.35) {
        this.score += Math.round(this.airtime * 250);
        p.nitro = Math.min(p.nitroMax, p.nitro + this.airtime * 10);
        this.announce(`AIRTIME ${this.airtime.toFixed(1)}s`);
        this.stats.longestAir = Math.max(this.stats.longestAir, this.airtime);
        this.onEvent({ type: "air", seconds: this.airtime });
      }
      this.airtime = 0;
    }
    if (this.config.mode === "roam")
      this.track.speedTraps.forEach((trap, i) => {
        if (
          !this.trapped.has(i) &&
          trap.distanceTo(p.position) < 6 &&
          speed > 70
        ) {
          this.trapped.add(i);
          this.stats.traps++;
          this.save.reward(500, 50);
          this.announce(`SPEED TRAP ${Math.round(speed)} KM/H  +500 CR`);
          this.onEvent({ type: "trap" });
        }
      });
  }
  private record(dt: number) {
    this.recordTimer += dt;
    this.replayTimer += dt;
    if (this.recordTimer >= 0.1) {
      this.recordTimer -= 0.1;
      const p = this.player.position,
        q = this.player.quaternion;
      this.recording.push([
        this.currentLapTime,
        p.x,
        p.y,
        p.z,
        q.x,
        q.y,
        q.z,
        q.w,
      ]);
    }
    if (this.replayTimer >= 0.1) {
      this.replayTimer -= 0.1;
      const actors: {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
      }[] = [...this.vehicles, ...this.remotes.values()];
      this.replay.push(
        actors.map((v) => [
          this.time,
          v.position.x,
          v.position.y,
          v.position.z,
          v.quaternion.x,
          v.quaternion.y,
          v.quaternion.z,
          v.quaternion.w,
        ]),
      );
      if (this.replay.length > 6000) this.replay.shift();
    }
  }
  completedLap() {
    const c = this.checkpoints[0],
      time = c.times[c.times.length - 1];
    const best = !this.bestLap || time < this.bestLap;
    if (best) {
      this.bestLap = time;
      this.newBest = true;
      this.splits[0] = time;
      this.bestSplits = this.splits.slice();
      this.save.data.records[this.recordKey] = {
        bestLap: time,
        ghost: this.recording.slice(),
        splits: this.bestSplits,
      };
      this.save.persist();
      this.announce("NEW PERSONAL BEST");
    } else
      this.announce(
        this.lap === this.config.laps ? "FINAL LAP" : "LAP COMPLETE",
      );
    this.onEvent({
      type: "lap",
      best,
      final: this.lap === this.config.laps,
    });
    this.splits = [];
    this.recording = [];
    this.ghostIndex = 0;
    if (this.config.mode === "elimination") {
      const active = this.ai.filter((a) => !a.eliminated);
      const ordered = [
        { index: 0, p: c.passed },
        ...active.map((a) => ({
          index: this.vehicles.indexOf(a.vehicle),
          p: this.progressOf(this.vehicles.indexOf(a.vehicle)),
        })),
      ].sort((a, b) => a.p - b.p);
      if (ordered[0].index === 0 && active.length) {
        this.finish(false);
        return;
      }
      if (ordered[0].index > 0) {
        const i = ordered[0].index;
        this.ai[i - 1].eliminated = true;
        this.models[i].root.visible = false;
        this.vehicles[i].body.setEnabled(false);
        this.announce(`${this.ai[i - 1].profile.name} ELIMINATED`);
        this.onEvent({ type: "eliminated", name: this.ai[i - 1].profile.name });
      }
    }
    if (
      this.lap > this.config.laps &&
      this.config.mode !== "roam" &&
      this.config.mode !== "drift"
    )
      this.finish(true);
  }
  /** Final order: finishers by time, then everyone else by progress (with an estimated time). */
  standings(): Standing[] {
    const lapLength = this.track.length,
      list: Standing[] = [];
    const estimate = (progress: number, speed: number) => {
      const remaining =
        Math.max(0, this.config.laps * TRACK_SECTORS - progress) *
        (lapLength / TRACK_SECTORS);
      return this.time + remaining / Math.max(20, Math.abs(speed) / 3.6);
    };
    this.vehicles.forEach((v, i) => {
      const finished =
        i === 0
          ? this.finished && this.lap > this.config.laps
            ? this.time
            : null
          : this.finishTimes[i];
      const out = i > 0 && this.ai[i - 1].eliminated;
      list.push({
        name: this.names[i],
        kind: i === 0 ? "player" : "ai",
        color: this.colors[i],
        car: v.spec.name,
        time:
          finished ??
          (this.finished && !out && this.config.mode === "race"
            ? estimate(this.progressOf(i), v.speed)
            : null),
        best:
          i === 0
            ? this.bestLap
            : this.checkpoints[i].times.length
              ? Math.min(...this.checkpoints[i].times)
              : null,
        progress: finished !== null ? 1e6 - finished : this.progressOf(i),
        estimated: finished === null,
        out,
      });
    });
    for (const r of this.remotes.values())
      list.push({
        name: r.name,
        kind: "remote",
        color: r.model.paint.color.getStyle(),
        car: r.spec.name,
        time: r.finishTime,
        best: r.bestLap,
        progress: r.finishTime !== null ? 1e6 - r.finishTime : r.progress,
        estimated: r.finishTime === null,
        out: false,
      });
    return list.sort(
      (a, b) => Number(a.out) - Number(b.out) || b.progress - a.progress,
    );
  }
  finish(completed: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.position = this.computePosition();
    const mode = this.config.mode,
      stars = completed
        ? mode === "drift"
          ? this.score > 12000
            ? 3
            : this.score > 5000
              ? 2
              : 1
          : mode === "time"
            ? this.time < this.config.laps * 75
              ? 3
              : 2
            : this.position === 1
              ? 3
              : this.position <= 3
                ? 2
                : 1
        : 0;
    const tier = this.config.eventId?.startsWith("tier")
      ? Number(this.config.eventId.charAt(4))
      : 1;
    const placement = completed
      ? Math.max(1000, 5500 - this.position * 500) * tier
      : 500;
    const clean = this.hits === 0 ? 750 : 0;
    const credits =
      placement + Math.floor(this.score / 10) + this.nearMisses * 150 + clean;
    const xp = completed ? 500 + stars * 150 + tier * 100 : 150;
    if (this.config.eventId?.startsWith("tier") && stars) {
      const key = this.config.eventId;
      this.save.data.career.stars[key] = Math.max(
        this.save.data.career.stars[key] ?? 0,
        stars,
      );
      this.save.data.career.unlockedTier = Math.min(
        4,
        1 +
          Math.floor(
            Object.values(this.save.data.career.stars).reduce(
              (a, b) => a + b,
              0,
            ) / 9,
          ),
      );
      if (
        key === "tier4_4" &&
        this.position === 1 &&
        completed &&
        !this.save.data.garage.owned.phantom
      )
        this.save.data.garage.owned.phantom = newOwned("phantom");
    }
    this.save.reward(credits, xp);
    this.onFinish({
      position: this.position,
      time: this.time,
      laps: this.checkpoints[0].times,
      best: this.bestLap ?? 0,
      score: this.score,
      credits,
      xp,
      stars,
      clean,
      nearMisses: this.nearMisses,
      completed,
      standings: this.standings(),
      newBest: this.newBest,
    });
  }
  reset() {
    // Respawn where the player is (same sector), not back at the last gate.
    const c = this.checkpoints[0],
      near = this.near[0],
      sameSector =
        Math.floor(near.t * TRACK_SECTORS) === Math.floor(c.lastSafe * 12);
    const p = this.track.at(
      sameSector ? Math.max(c.lastSafe, near.t - 0.002) : c.lastSafe,
    );
    this.player.reset(p.point, p.yaw);
    this.hits++;
    this.stats.hits++;
    this.announce("CAR RESET");
  }
  render(alpha: number) {
    this.traffic?.render(this.clock, this.night);
    this.vehicles.forEach((v, i) => {
      const m = this.models[i];
      m.root.position.lerpVectors(v.previousPosition, v.position, alpha);
      m.root.position.y -= 0.5;
      m.root.quaternion.slerpQuaternions(
        v.previousQuaternion,
        v.quaternion,
        alpha,
      );
      m.setLights(v.braking, v.reversing, v.boosting);
      m.wheels.forEach((w, j) => {
        w.position.y = 0.6 - (v.controller.wheelSuspensionLength(j) ?? 0.27);
        w.rotation.set(
          v.controller.wheelRotation(j) ?? 0,
          j < 2 ? v.steering : 0,
          0,
        );
      });
    });
    for (const r of this.remotes.values()) r.render(this.clock);
    this.track.update(this.clock);
    this.track.setStartLights(this.countdown);
    this.sky.root.visible = !this.inTunnel(this.near[0].t);
    this.sky.update(this.clock);
    if (this.ghost) {
      const frames = this.save.data.records[this.recordKey]?.ghost;
      if (frames?.length) {
        while (
          this.ghostIndex < frames.length - 2 &&
          frames[this.ghostIndex + 1][0] < this.currentLapTime
        )
          this.ghostIndex++;
        const f = frames[this.ghostIndex];
        this.ghost.root.visible =
          !!f &&
          this.racing &&
          this.currentLapTime <= frames[frames.length - 1][0];
        if (f) {
          this.ghost.root.position.set(f[1], f[2] - 0.5, f[3]);
          this.ghost.root.quaternion.set(f[4], f[5], f[6], f[7]);
        }
      }
    }
  }
  /** Smoothly interpolated replay playback; returns the followed car's transform. */
  playReplay(time: number) {
    if (!this.replay.length) return null;
    const span = this.replay.length,
      f = (time * 10) % span,
      i = Math.floor(f),
      k = f - i,
      a = this.replay[i],
      b = this.replay[Math.min(span - 1, i + 1)];
    const models = [
      ...this.models,
      ...[...this.remotes.values()].map((r) => r.model),
    ];
    a.forEach((fa, n) => {
      const fb = b[n] ?? fa,
        root = models[n]?.root;
      if (!root) return;
      root.position.set(
        fa[1] + (fb[1] - fa[1]) * k,
        fa[2] + (fb[2] - fa[2]) * k - 0.5,
        fa[3] + (fb[3] - fa[3]) * k,
      );
      root.quaternion
        .set(fa[4], fa[5], fa[6], fa[7])
        .slerp(new THREE.Quaternion(fb[4], fb[5], fb[6], fb[7]), k);
      models[n].wheels.forEach((w) => (w.rotation.x += 0.4));
    });
    this.track.update(this.clock + time);
    return models[0].root;
  }
  dispose() {
    this.world.free();
    disposeObject(this.root);
  }
}
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
