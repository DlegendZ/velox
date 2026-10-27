import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import type { CarSpec } from "../data/cars";
import type { OwnedCar, SaveData } from "../core/Save";
import type { Controls } from "../core/Input";
import { TUNING as T } from "../data/tuning";
export const WHEEL_POSITIONS = [
  [-0.88, 0.1, 1.3],
  [0.88, 0.1, 1.3],
  [-0.88, 0.1, -1.3],
  [0.88, 0.1, -1.3],
];
const forward = new Vector3(),
  side = new Vector3(),
  tmpVelocity = new Vector3(),
  UP = new Vector3(0, 1, 0);
export class VehicleController {
  body: RAPIER.RigidBody;
  controller: RAPIER.DynamicRayCastVehicleController;
  position = new Vector3();
  quaternion = new Quaternion();
  previousPosition = new Vector3();
  previousQuaternion = new Quaternion();
  speed = 0;
  gear = 1;
  rpm = 900;
  nitro = 100;
  nitroLocked = false;
  get nitroMax() {
    return 100 + this.owned.upgrades.nitro * 10;
  }
  boosting = false;
  drifting = false;
  slip = 0;
  steering = 0;
  throttle = 0;
  travel = 0;
  previousY = 0;
  surfaceGrip = 1;
  resets = 0;
  velocity = new Vector3();
  braking = false;
  reversing = false;
  /** Horizontal speed lost to a collision this step (m/s); 0 when nothing was hit. */
  impact = 0;
  impactDirection = new Vector3();
  wallImpact = 0;
  wallPoint = new Vector3();
  wallNormal = new Vector3();
  touchingWall = false;
  private preContactVelocity = new Vector3();
  /** Seconds the rev limiter has been bouncing; drives backfire effects. */
  limiter = 0;
  lifted = false;
  /** AI cars always use the automatic gearbox regardless of the player's setting. */
  automatic = false;
  /** 0 = full grip, 1 = committed drift. Smoothly blends handling between the two. */
  driftAmount = 0;
  private handbrakeWas = false;
  /** +1/-1: which way the current drift rotates (same sense as yaw rate). */
  private driftDir = 0;
  private previousVelocity = new Vector3();
  private skipImpact = 2;
  constructor(
    public world: RAPIER.World,
    public spec: CarSpec,
    public owned: OwnedCar,
    position: Vector3,
    yaw: number,
  ) {
    const mass = spec.massKg * (1 - owned.upgrades.weight * 0.035);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
        )
        .setLinearDamping(0.08)
        .setAngularDamping(3)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    this.body.setEnabledRotations(false, true, false, true);
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        0.78,
        0.2,
        spec.length * 0.43 - 0.08,
        0.08,
      )
        .setTranslation(0, 0.13, 0)
        .setMass(mass)
        .setFriction(0.05)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.05),
      this.body,
    );
    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    for (const [i, p] of WHEEL_POSITIONS.entries()) {
      this.controller.addWheel(
        { x: p[0], y: p[1], z: p[2] },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        T.suspension.rest,
        T.wheelRadius,
      );
      this.controller.setWheelSuspensionStiffness(i, T.suspension.stiffness);
      this.controller.setWheelSuspensionCompression(
        i,
        T.suspension.compression,
      );
      this.controller.setWheelSuspensionRelaxation(i, T.suspension.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, T.suspension.travel);
      this.controller.setWheelMaxSuspensionForce(i, T.suspension.maxForce);
      this.controller.setWheelFrictionSlip(i, T.friction);
      this.controller.setWheelSideFrictionStiffness(i, 1.5);
    }
    this.sync();
    this.previousPosition.copy(this.position);
    this.previousQuaternion.copy(this.quaternion);
  }
  update(dt: number, input: Controls, settings: SaveData["settings"]) {
    const steerInput = -input.steer;
    this.previousPosition.copy(this.position);
    this.previousQuaternion.copy(this.quaternion);
    const q = this.body.rotation();
    this.quaternion.set(q.x, q.y, q.z, q.w);
    forward.set(0, 0, 1).applyQuaternion(this.quaternion);
    side.set(1, 0, 0).applyQuaternion(this.quaternion);
    const vel = this.body.linvel(),
      v = this.velocity.set(vel.x, vel.y, vel.z),
      long = v.dot(forward);
    // Collision detection from the change in horizontal velocity between steps.
    const dvx = v.x - this.previousVelocity.x,
      dvz = v.z - this.previousVelocity.z,
      lost =
        Math.hypot(this.previousVelocity.x, this.previousVelocity.z) -
        Math.hypot(v.x, v.z);
    this.impact =
      this.skipImpact > 0
        ? 0
        : Math.max(0, Math.hypot(dvx, dvz) - 1.1) * (lost > 0.4 ? 1 : 0);
    if (this.impact > 0) this.impactDirection.set(-dvx, 0, -dvz).normalize();
    this.skipImpact = Math.max(0, this.skipImpact - 1);
    this.previousVelocity.copy(v);
    this.speed = long * 3.6;
    this.slip = Math.atan2(v.dot(side), Math.abs(long) + 0.1);
    const u = this.owned.upgrades;
    this.throttle = input.throttle;
    if (this.nitroLocked && !input.nitro && this.nitro >= this.nitroMax * 0.25)
      this.nitroLocked = false;
    this.boosting =
      input.nitro &&
      !this.nitroLocked &&
      input.throttle > 0 &&
      this.nitro > 0 &&
      long > 2;
    // Drift state: a handbrake flick or a big slide enters it; straightening up leaves it.
    const slipAbs = Math.abs(this.slip),
      speedAbs = Math.abs(long);
    let kick = 0;
    if (
      input.handbrake &&
      !this.handbrakeWas &&
      speedAbs > 9 &&
      Math.abs(steerInput) > 0.15
    ) {
      this.driftDir = Math.sign(steerInput * long);
      kick = this.driftDir * Math.min(0.7, speedAbs / 35);
    }
    if (this.driftAmount === 0 && slipAbs > 0.32 && Math.abs(steerInput) > 0.3)
      this.driftDir = -Math.sign(this.slip);
    this.handbrakeWas = input.handbrake;
    // Power oversteer also starts a drift, but only while steering and on the throttle.
    const powerSlide =
      slipAbs > 0.32 &&
      speedAbs > 10 &&
      input.throttle > 0.5 &&
      Math.abs(steerInput) > 0.3;
    if ((input.handbrake && speedAbs > 9) || powerSlide)
      this.driftAmount = Math.min(1, this.driftAmount + dt * 6);
    else
      this.driftAmount = Math.max(
        0,
        this.driftAmount -
          dt *
            (slipAbs < 0.12 || speedAbs < 6
              ? 4
              : Math.abs(steerInput) < 0.2
                ? 2.4
                : 0.6),
      );
    this.drifting =
      this.driftAmount > 0.35 && slipAbs > 0.1 && Math.abs(this.speed) > 30;
    this.nitro = Math.max(
      0,
      Math.min(
        this.nitroMax,
        this.nitro +
          dt *
            (this.boosting
              ? -T.nitroDrain
              : this.drifting
                ? 12
                : T.nitroRecharge),
      ),
    );
    if (this.boosting && this.nitro <= 0) {
      this.nitro = 0;
      this.boosting = false;
      this.nitroLocked = true;
    }
    const maxSpeed = (this.spec.topSpeed + u.engine * 5 + u.turbo * 3) / 3.6;
    const power =
      this.spec.powerKw * 1000 * (1 + u.engine * 0.08 + u.turbo * 0.06);
    const tractionFactor =
      settings.assists.traction &&
      Math.abs(this.slip) > 0.35 &&
      !input.handbrake &&
      this.driftAmount < 0.3
        ? 0.7
        : 1;
    // Manual gearbox: torque follows a simple curve so gear choice matters.
    const manual = settings.manual && !this.automatic;
    const torque = manual
      ? this.rpm > 8050
        ? 0
        : Math.max(0.45, Math.min(1, 0.35 + this.rpm / 6500))
      : 1;
    this.limiter =
      manual && this.rpm > 8050 && input.throttle > 0 ? this.limiter + dt : 0;
    const force =
      Math.min(power / Math.max(Math.abs(long), 12), this.spec.massKg * 8) *
      (long < maxSpeed ? 1 : 0) *
      tractionFactor *
      torque;
    const reverse = input.brake > 0 && long < 0.6;
    this.braking = input.brake > 0 && !reverse && long > 1;
    this.reversing = reverse && long < -0.3;
    this.lifted = input.throttle === 0 && Math.abs(long) > 15;
    const steer =
      ((steerInput * T.steering * settings.sensitivity) /
        (1 + Math.abs(long) / 42)) *
      (1 + u.suspension * 0.035);
    // Input is already rate-limited; this only removes per-frame jitter.
    this.steering += (steer - this.steering) * (1 - Math.exp(-24 * dt));
    for (let i = 0; i < 4; i++) {
      const driven =
        this.spec.drive === "AWD" ||
        (this.spec.drive === "FWD" ? i < 2 : i >= 2);
      const count = this.spec.drive === "AWD" ? 4 : 2;
      this.controller.setWheelEngineForce(
        i,
        driven
          ? (input.throttle * force - (reverse ? force * 0.45 : 0)) / count
          : 0,
      );
      const absFactor =
        settings.assists.abs && Math.abs(this.slip) > 0.25 && Math.abs(long) > 5
          ? 0.65
          : 1;
      this.controller.setWheelBrake(
        i,
        reverse
          ? 0
          : input.brake * T.brake * absFactor +
              (input.handbrake && i >= 2 ? T.brake * 0.22 : 0),
      );
      this.controller.setWheelSteering(i, i < 2 ? this.steering : 0);
      this.controller.setWheelFrictionSlip(
        i,
        T.friction *
          this.surfaceGrip *
          (1 + u.tires * 0.08) *
          (i >= 2
            ? 1 -
              (1 - T.driftGrip) *
                Math.max(this.driftAmount, input.handbrake ? 1 : 0)
            : 1),
      );
    }
    this.body.resetForces(true);
    const drag =
      T.drag * long * Math.abs(long) + Math.sign(long) * T.rollingResistance;
    this.body.addForce(
      {
        x:
          forward.x *
          (-drag + (this.boosting ? T.nitroForce * (1 + u.nitro * 0.1) : 0)),
        y: -Math.min(3500, long * long * 1.5),
        z:
          forward.z *
          (-drag + (this.boosting ? T.nitroForce * (1 + u.nitro * 0.1) : 0)),
      },
      true,
    );
    this.controller.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    const grounded = [0, 1, 2, 3].some((i) =>
      this.controller.wheelIsInContact(i),
    );
    if (grounded && Math.abs(long) > 0.5) {
      const av = this.body.angvel(),
        d = this.driftDir ? this.driftAmount : 0;
      const gripYaw =
        (this.steering * long) / (T.wheelBase + Math.abs(long) * 0.07);
      const gripResponse = settings.assists.steering ? 6 : 2.2;
      let yawTarget = gripYaw,
        response = gripResponse;
      if (d > 0) {
        // Arcade drift: steering picks the angle and the arc; counter-steer to exit.
        // Steer into the slide to hold it; let go or counter-steer to straighten up.
        const along = Math.max(-1, Math.min(1, steerInput * this.driftDir)),
          holding = along > 0.15 || input.handbrake,
          angle = holding
            ? 0.26 + 0.2 * along + (input.handbrake ? 0.1 : 0)
            : 0.04,
          arc =
            (0.45 + 0.55 * Math.max(0, along) + (input.handbrake ? 0.25 : 0)) *
            Math.min(1, speedAbs / 14),
          desiredSlip = -this.driftDir * angle,
          error = this.slip - desiredSlip;
        const driftYaw =
          this.driftDir * arc + error * (settings.assists.drift ? 7 : 3.5);
        yawTarget = gripYaw + (driftYaw - gripYaw) * d;
        response = gripResponse + (8 - gripResponse) * d;
        // Turn the direction of travel along the arc instead of scrubbing it away.
        const before = Math.hypot(v.x, v.z);
        tmpVelocity
          .set(v.x, 0, v.z)
          .applyAxisAngle(UP, this.driftDir * arc * d * dt);
        const keep = Math.max(
          Math.hypot(this.body.linvel().x, this.body.linvel().z),
          before *
            (1 - dt * (input.handbrake ? 0.5 : 0.16 - 0.15 * input.throttle)),
        );
        // Rear tyres are sliding, so feed throttle in along the line of travel.
        const push =
          input.throttle *
          d *
          Math.min(
            4.5,
            (0.6 * power) / (this.body.mass() * Math.max(before, 8)),
          ) *
          (long < maxSpeed ? 1 : 0);
        tmpVelocity.setLength(keep + push * dt);
        this.body.setLinvel(
          { x: tmpVelocity.x, y: this.body.linvel().y, z: tmpVelocity.z },
          true,
        );
      }
      const yaw =
        av.y + (yawTarget - av.y) * (1 - Math.exp(-dt * response)) + kick;
      this.body.setAngvel({ x: 0, y: yaw, z: 0 }, true);
      const lateral = v.dot(side);
      const factor = T.lateralAssist * (1 - d);
      if (factor > 0)
        this.body.applyImpulse(
          {
            x: -side.x * lateral * this.body.mass() * dt * factor,
            y: 0,
            z: -side.z * lateral * this.body.mass() * dt * factor,
          },
          true,
        );
    }
    if (this.driftAmount === 0) this.driftDir = 0;
    if (!manual)
      this.gear = Math.max(
        1,
        Math.min(6, Math.floor(Math.abs(this.speed) / 42) + 1),
      );
    const target =
      this.spec.sound === "ev"
        ? 1000 + Math.abs(this.speed) * 20
        : Math.min(
            8200,
            950 + (Math.abs(this.speed) / (this.gear * 42)) * 6200,
          );
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt * 12));
    this.travel += Math.abs(long) * dt;
    const nextVelocity = this.body.linvel();
    this.preContactVelocity.set(nextVelocity.x, nextVelocity.y, nextVelocity.z);
  }
  wallContact(world: RAPIER.World, wallHandles: Set<number>) {
    this.wallImpact = 0;
    this.touchingWall = false;
    const chassis = this.body.collider(0);
    let carContact = false;
    world.contactPairsWith(chassis, (other) => {
      if (!wallHandles.has(other.handle)) {
        const parent = other.parent();
        carContact ||= !!parent && !parent.isFixed();
        return;
      }
      world.contactPair(chassis, other, (manifold, flipped) => {
        let contact = manifold.numSolverContacts()
          ? manifold.solverContactPoint(0)
          : null;
        if (!contact && manifold.numContacts()) {
          const local = flipped
            ? manifold.localContactPoint1(0)
            : manifold.localContactPoint2(0);
          if (local) {
            const rotation = other.rotation(),
              translation = other.translation();
            contact = new Vector3(local.x, local.y, local.z)
              .applyQuaternion(
                new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
              )
              .add(new Vector3(translation.x, translation.y, translation.z));
          }
        }
        if (!contact) return;
        const normal = manifold.normal(),
          position = this.body.translation();
        let nx = normal.x,
          nz = normal.z;
        const length = Math.hypot(nx, nz);
        if (length < 0.1) return;
        nx /= length;
        nz /= length;
        if (nx * (position.x - contact.x) + nz * (position.z - contact.z) < 0) {
          nx = -nx;
          nz = -nz;
        }
        this.touchingWall = true;
        this.wallPoint.set(contact.x, contact.y, contact.z);
        this.wallNormal.set(nx, 0, nz);
        const before = this.preContactVelocity,
          v = this.body.linvel(),
          vn = before.x * nx + before.z * nz;
        if (vn >= 0) return;
        this.wallImpact = Math.max(this.wallImpact, -vn);
        const speed = Math.hypot(before.x, before.z),
          cos = -vn / Math.max(speed, 0.01),
          keep = 1 - 0.35 * cos * cos;
        const tx = (before.x - nx * vn) * keep,
          tz = (before.z - nz * vn) * keep,
          bounce = cos > 0.75 ? -vn * 0.15 : 0;
        this.body.setLinvel(
          { x: tx + nx * bounce, y: v.y, z: tz + nz * bounce },
          true,
        );
        if (cos < 0.6 && Math.hypot(tx, tz) > 0.5) {
          const rotation = this.body.rotation();
          const heading = Math.atan2(
            2 * (rotation.w * rotation.y + rotation.x * rotation.z),
            1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
          );
          const target = Math.atan2(tx, tz),
            error = Math.atan2(
              Math.sin(target - heading),
              Math.cos(target - heading),
            );
          const turn = Math.max(-0.9 / 60, Math.min(0.9 / 60, error));
          this.body.setRotation(
            new Quaternion().setFromAxisAngle(UP, heading + turn),
            true,
          );
          this.body.setAngvel({ x: 0, y: turn * 60, z: 0 }, true);
        }
      });
    });
    if (this.touchingWall || !carContact) this.impact = 0;
  }
  sync() {
    const p = this.body.translation(),
      q = this.body.rotation();
    this.position.set(p.x, p.y, p.z);
    this.quaternion.set(q.x, q.y, q.z, q.w);
  }
  reset(position: Vector3, yaw: number) {
    this.resets++;
    this.body.setTranslation(
      { x: position.x, y: position.y + 0.66, z: position.z },
      true,
    );
    this.body.setRotation(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.previousVelocity.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.skipImpact = 2;
    this.impact = 0;
    this.wallImpact = 0;
    this.touchingWall = false;
    this.preContactVelocity.set(0, 0, 0);
    this.sync();
    this.previousPosition.copy(this.position);
    this.previousQuaternion.copy(this.quaternion);
  }
  dispose() {
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
