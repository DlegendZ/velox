import { Vector3 } from "three";
import type { Controls } from "../core/Input";
import type { VehicleController } from "../physics/VehicleController";
import type { Track } from "./TrackBuilder";
import { TUNING, AI_PROFILES } from "../data/tuning";
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const forward = new Vector3(),
  delta = new Vector3();
export interface NearInfo {
  t: number;
  distance: number;
  index: number;
}
export class AIDriver {
  stuck = 0;
  lastT = 0;
  eliminated = false;
  constructor(
    public vehicle: VehicleController,
    public profile: (typeof AI_PROFILES)[number],
    private difficulty: keyof typeof TUNING.difficulties,
  ) {
    vehicle.automatic = true;
  }
  drive(
    dt: number,
    track: Track,
    near: NearInfo,
    playerT: number,
    rubberband: boolean,
    others: VehicleController[] = [],
  ): Controls {
    const v = this.vehicle,
      look = Math.max(8, (Math.abs(v.speed) / 3.6) * 0.52);
    forward.set(0, 0, 1).applyQuaternion(v.quaternion);
    let offset = this.profile.lane,
      blocked = false;
    for (const other of others) {
      if (other === v || !other.body.isEnabled()) continue;
      delta.copy(other.position).sub(v.position);
      const distance = delta.length();
      if (
        distance < 11 &&
        distance > 0.1 &&
        delta.normalize().dot(forward) > 0.88
      ) {
        offset = Math.max(
          -track.halfWidthAt(near.t) + 2,
          Math.min(
            track.halfWidthAt(near.t) - 2,
            offset + (offset > 0 ? -2 : 2) * this.profile.aggression,
          ),
        );
        if (distance < 4) blocked = true;
        break;
      }
    }
    offset = Math.max(
      -track.halfWidthAt(near.t) + 2,
      Math.min(track.halfWidthAt(near.t) - 2, offset),
    );
    const desired = track.at(near.t + look / track.length, offset);
    const dx = desired.point.x - v.position.x,
      dz = desired.point.z - v.position.z;
    const heading = Math.atan2(forward.x, forward.z),
      steerError = angle(Math.atan2(dx, dz) - heading);
    const tangentNow = track.at(near.t).tangent,
      tangentThen = track.at(near.t + 22 / track.length).tangent;
    const curvature = Math.acos(
      Math.max(-1, Math.min(1, tangentNow.dot(tangentThen))),
    );
    const diff = TUNING.difficulties[this.difficulty];
    let target = (165 - curvature * 130) * diff * this.profile.skill;
    if (curvature > 0.12 && tangentNow.y < 0)
      target *= Math.max(0.75, 1 + tangentNow.y * 2.5);
    target = Math.max(45, target);
    if (rubberband) {
      let gap = playerT - near.t;
      if (gap > 0.5) gap -= 1;
      if (gap < -0.5) gap += 1;
      target *= 1 + Math.max(-0.08, Math.min(0.08, gap * 0.3));
    }
    if (Math.abs(v.speed) < 5) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck > 3 || near.distance > track.spec.width) {
      const p = track.at(near.t + 0.008, this.profile.lane * 0.7);
      v.reset(p.point, p.yaw);
      this.stuck = 0;
    }
    this.lastT = near.t;
    return {
      throttle: blocked ? 0.15 : v.speed < target ? 1 : 0.12,
      brake: blocked && v.speed > 35 ? 0.3 : v.speed > target + 12 ? 0.5 : 0,
      steer: -Math.max(-1, Math.min(1, steerError * 1.9)),
      handbrake: false,
      nitro:
        curvature < 0.1 &&
        v.speed > 80 &&
        v.nitro > 70 &&
        this.profile.aggression > 0.65,
      rear: false,
    };
  }
}
