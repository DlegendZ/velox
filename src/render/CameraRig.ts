import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { VehicleController } from "../physics/VehicleController";
import RAPIER from "@dimforge/rapier3d-compat";
import type { TrackGeometry } from "../game/TrackGeometry";
const OFFSETS = [
  new Vector3(0, 3.1, -7.2),
  new Vector3(0, 4.6, -11),
  new Vector3(0, 0.75, 0.95),
  new Vector3(0, 0.2, 2.3),
];
export const CAMERA_NAMES = ["CHASE", "CHASE FAR", "HOOD", "BUMPER"];
const target = new Vector3(),
  origin = new Vector3(),
  ray = new Vector3(),
  look = new Vector3(),
  shakeOffset = new Vector3(),
  up = new Vector3(0, 1, 0);
export class CameraRig {
  mode = 0;
  fov = 60;
  /** Disabled through settings for motion-sensitive players. */
  shakeEnabled = true;
  groundHeight = 0;
  roadSlope = 0;
  private initialized = false;
  private trauma = 0;
  private time = 0;
  private roll = 0;
  private cut = 0;
  private cutAnchor = new Vector3();
  constructor(private camera: PerspectiveCamera) {}
  reset() {
    this.initialized = false;
    this.trauma = 0;
    this.roll = 0;
    this.camera.up.set(0, 1, 0);
  }
  /** Adds camera shake (0–1); decays quickly. */
  shake(amount: number) {
    if (this.shakeEnabled) this.trauma = Math.min(1, this.trauma + amount);
  }
  update(dt: number, car: VehicleController, rear = false) {
    this.time += dt;
    const q = car.quaternion;
    const offset = target.copy(OFFSETS[this.mode]);
    if (rear) offset.z *= -1;
    offset.applyQuaternion(q).add(car.position);
    origin.copy(car.position).y += 0.6;
    ray.copy(offset).sub(origin);
    const rayLength = ray.length();
    ray.normalize();
    if (this.mode < 2) {
      const hit = car.world.castRay(
        new RAPIER.Ray(origin, ray),
        rayLength,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      );
      if (hit)
        offset
          .copy(origin)
          .addScaledVector(ray, Math.max(0.5, hit.timeOfImpact - 0.3));
    }
    look
      .set(0, this.mode < 2 ? 0.65 : 0.4, rear ? -9 : 9)
      .applyQuaternion(q)
      .add(car.position);
    this.camera.position.lerp(
      offset,
      this.initialized ? 1 - Math.exp(-dt * (this.mode < 2 ? 7 : 30)) : 1,
    );
    this.camera.position.y = Math.max(
      this.groundHeight + 0.35,
      this.camera.position.y,
    );
    look.y += this.roadSlope * 7;
    // Constant subtle shake at speed plus trauma from impacts/boost.
    const speedShake = this.shakeEnabled
      ? Math.max(0, Math.abs(car.speed) - 160) * 0.00012 +
        (car.boosting ? 0.01 : 0)
      : 0;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 0.35 + speedShake;
    if (s > 0) {
      shakeOffset.set(
        Math.sin(this.time * 47.3) + Math.sin(this.time * 91.1) * 0.5,
        Math.sin(this.time * 53.7 + 1) + Math.sin(this.time * 77.9) * 0.5,
        0,
      );
      this.camera.position.addScaledVector(shakeOffset, s);
    }
    // Lean into corners on the chase cameras.
    const targetRoll =
      this.mode < 2 && this.shakeEnabled
        ? car.steering * Math.min(1, Math.abs(car.speed) / 120) * 0.05
        : 0;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 4));
    this.camera.up
      .copy(up)
      .applyAxisAngle(ray.set(0, 0, 1).applyQuaternion(q), this.roll);
    this.camera.lookAt(look);
    this.camera.fov = MathUtils.lerp(
      this.camera.fov,
      this.fov +
        Math.min(14, Math.abs(car.speed) * 0.035) +
        (car.boosting ? 9 : 0),
      1 - Math.exp(-dt * 4),
    );
    this.camera.updateProjectionMatrix();
    this.initialized = true;
  }
  /** Slow orbit used during the countdown. */
  cinematic(dt: number, position: Vector3, rotation: Quaternion, time: number) {
    this.camera.up.set(0, 1, 0);
    const offset = target
      .set(Math.sin(time * 0.25) * 7, 3, Math.cos(time * 0.25) * 7)
      .applyQuaternion(rotation)
      .add(position);
    this.camera.position.lerp(offset, 1 - Math.exp(-dt * 2));
    this.camera.lookAt(look.copy(position).setY(position.y + 0.7));
  }
  /** Replay director: cuts between orbit, trackside, low chase and helicopter shots. */
  director(
    dt: number,
    position: Vector3,
    rotation: Quaternion,
    time: number,
    track?: TrackGeometry,
  ) {
    this.camera.up.set(0, 1, 0);
    if (track) {
      const t = track.nearest(position).t,
        at = track.at(t);
      if (track.inSection("tunnel", t)) {
        target.set(1.2, 1.8, -6).applyQuaternion(rotation).add(position);
        this.camera.position.copy(target);
        this.camera.fov = 55;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(look.copy(position).addScaledVector(at.tangent, 10));
        return;
      }
      if (track.inSection("bridge", t)) {
        const anchor = track.at(
          (t - 0.018 + 1) % 1,
          track.halfWidthAt(t) + 14,
        ).point;
        anchor.y += 5;
        this.camera.position.copy(anchor);
        this.camera.fov = 48;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(position);
        return;
      }
    }
    const shot = Math.floor(time / 5) % 4;
    if (shot !== this.cut) {
      this.cut = shot;
      // Trackside camera waits ahead of the car.
      this.cutAnchor.set(6, 1.4, 28).applyQuaternion(rotation).add(position);
      this.initialized = false;
    }
    if (shot === 0) {
      target
        .set(Math.sin(time * 0.3) * 7, 2.5, Math.cos(time * 0.3) * 7)
        .applyQuaternion(rotation)
        .add(position);
    } else if (shot === 1) target.copy(this.cutAnchor);
    else if (shot === 2)
      target.set(1.6, 0.45, -4.2).applyQuaternion(rotation).add(position);
    else target.set(0, 26, -18).applyQuaternion(rotation).add(position);
    if (!this.initialized) this.camera.position.copy(target);
    else
      this.camera.position.lerp(
        target,
        1 - Math.exp(-dt * (shot === 1 ? 0 : 4)),
      );
    this.initialized = true;
    this.camera.fov = shot === 1 ? 34 : 55;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(look.copy(position).setY(position.y + 0.6));
  }
}
