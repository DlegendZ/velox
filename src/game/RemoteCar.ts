import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { CarSpec } from "../data/cars";
import type { Visual } from "../core/Save";
import { CarFactory, type CarModel } from "./CarFactory";
/** One network state sample of another player's car. */
export interface Snapshot {
  /** Local receive time (ms, performance.now). */
  at: number;
  p: [number, number, number];
  q: [number, number, number, number];
  v: [number, number, number];
  sp: number;
  st: number;
  /** Bit flags: 1 boost, 2 brake, 4 drift, 8 reverse. */
  fl: number;
  pr: number;
  lap: number;
}
export const INTERPOLATION_DELAY = 110;
const qa = new THREE.Quaternion(),
  qb = new THREE.Quaternion();
/** A kinematic stand-in for another player: collides with local cars and renders smoothly. */
export class RemoteCar {
  body: RAPIER.RigidBody;
  model: CarModel;
  position = new THREE.Vector3();
  quaternion = new THREE.Quaternion();
  velocity = new THREE.Vector3();
  speed = 0;
  steering = 0;
  boosting = false;
  braking = false;
  drifting = false;
  progress = 0;
  lap = 1;
  finishTime: number | null = null;
  bestLap: number | null = null;
  lastHeard = performance.now();
  private buffer: Snapshot[] = [];
  constructor(
    private world: RAPIER.World,
    public id: string,
    public name: string,
    public spec: CarSpec,
    visual: Visual,
    spawn: THREE.Vector3,
    yaw: number,
  ) {
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.position.copy(spawn);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setRotation(this.quaternion),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.84, 0.4, spec.length * 0.43)
        .setTranslation(0, 0.13, 0)
        .setFriction(0.2),
      this.body,
    );
    this.model = CarFactory.buildProcedural(spec, visual, false);
  }
  push(s: Snapshot) {
    this.lastHeard = s.at;
    const last = this.buffer[this.buffer.length - 1];
    if (last && s.at <= last.at) return;
    this.buffer.push(s);
    if (this.buffer.length > 40) this.buffer.shift();
    this.progress = s.pr;
    this.lap = s.lap;
  }
  /** Interpolated state INTERPOLATION_DELAY ms in the past, extrapolated briefly on packet loss. */
  sample(now = performance.now()) {
    const b = this.buffer;
    if (!b.length) return;
    const t = now - INTERPOLATION_DELAY;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > t) i--;
    const next = b[i],
      prev = b[Math.max(0, i - 1)];
    if (t >= next.at || prev === next) {
      const ahead = Math.min(0.25, Math.max(0, (t - next.at) / 1000));
      this.position.set(
        next.p[0] + next.v[0] * ahead,
        next.p[1] + next.v[1] * ahead,
        next.p[2] + next.v[2] * ahead,
      );
      this.quaternion.set(...next.q);
      this.apply(next);
      return;
    }
    const k = (t - prev.at) / Math.max(1, next.at - prev.at);
    this.position.set(
      prev.p[0] + (next.p[0] - prev.p[0]) * k,
      prev.p[1] + (next.p[1] - prev.p[1]) * k,
      prev.p[2] + (next.p[2] - prev.p[2]) * k,
    );
    qa.set(...prev.q);
    qb.set(...next.q);
    this.quaternion.slerpQuaternions(qa, qb, k);
    this.apply(k < 0.5 ? prev : next);
  }
  private apply(s: Snapshot) {
    this.velocity.set(...s.v);
    this.speed = s.sp;
    this.steering = s.st;
    this.boosting = !!(s.fl & 1);
    this.braking = !!(s.fl & 2);
    this.drifting = !!(s.fl & 4);
  }
  fixed() {
    this.sample();
    this.body.setNextKinematicTranslation(this.position);
    this.body.setNextKinematicRotation(this.quaternion);
  }
  render(time: number) {
    this.sample();
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.position.y -= 0.5;
    m.root.quaternion.copy(this.quaternion);
    m.setLights(this.braking, false, this.boosting);
    m.wheels.forEach((w, j) => {
      w.rotation.set(
        ((time * this.speed) / 3.6 / 0.36) % (Math.PI * 2),
        j < 2 ? this.steering : 0,
        0,
      );
    });
  }
  dispose() {
    this.world.removeRigidBody(this.body);
  }
}
