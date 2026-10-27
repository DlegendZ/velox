import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Track } from "./TrackBuilder";
import { CarFactory, type CarModel } from "./CarFactory";
import { carById } from "../data/cars";
import { newOwned } from "../core/Save";

export class Traffic {
  root = new THREE.Group();
  actors: {
    t: number;
    direction: number;
    speed: number;
    body: RAPIER.RigidBody;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    model: CarModel | null;
  }[] = [];
  constructor(
    private track: Track,
    world: RAPIER.World,
    visuals = true,
  ) {
    this.root.name = "CivilianTraffic";
    for (let i = 0; i < 12; i++) {
      const id = i % 3 === 0 ? "solace" : i % 3 === 1 ? "kestrel" : "vanta",
        spec = carById(id),
        owned = newOwned(id);
      owned.visual.paint = ["#a1a8ac", "#5f7176", "#a69781", "#665966"][i % 4];
      owned.visual.spoiler = 0;
      const actor = {
        t: (i + 0.5) / 12,
        direction: i % 2 ? 1 : -1,
        speed: (60 + (i % 5) * 5) * (i % 2 ? 1 : -1),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        body: world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased(),
        ),
        model: visuals ? CarFactory.buildProcedural(spec, owned.visual, false) : null,
      };
      world.createCollider(
        RAPIER.ColliderDesc.roundCuboid(0.85, 0.48, spec.length * 0.43, 0.06)
          .setFriction(0.05)
          .setRestitution(0.02),
        actor.body,
      );
      this.place(actor, true);
      if (actor.model) this.root.add(actor.model.root);
      this.actors.push(actor);
    }
  }
  private place(actor: Traffic["actors"][number], immediate = false) {
    let skipped = false;
    if (actor.direction < 0)
      for (let i = 0; i < 100 && this.track.halfWidthAt(actor.t) < 7; i++) {
        actor.t = (actor.t - 0.002 + 1) % 1;
        skipped = true;
      }
    const at = this.track.at(
      actor.t,
      -actor.direction * Math.min(3.2, this.track.halfWidthAt(actor.t) * 0.34),
    );
    actor.position.copy(at.point);
    actor.position.y += 0.6;
    actor.quaternion.setFromEuler(
      new THREE.Euler(
        -Math.atan2(
          at.tangent.y * actor.direction,
          Math.hypot(at.tangent.x, at.tangent.z),
        ),
        at.yaw + (actor.direction < 0 ? Math.PI : 0),
        0,
        "YXZ",
      ),
    );
    if (immediate || skipped) {
      actor.body.setTranslation(actor.position, true);
      actor.body.setRotation(actor.quaternion, true);
    }
    actor.body.setNextKinematicTranslation(actor.position);
    actor.body.setNextKinematicRotation(actor.quaternion);
  }
  fixed(dt: number) {
    for (const actor of this.actors) {
      actor.t =
        (actor.t + ((actor.speed / 3.6) * dt) / this.track.length + 1) % 1;
      this.place(actor);
    }
  }
  render(time: number, night: boolean) {
    for (const actor of this.actors)
      if (actor.model) {
        const model = actor.model;
        model.root.position.copy(actor.position);
        model.root.position.y -= 0.5;
        model.root.quaternion.copy(actor.quaternion);
        model.setHeadlights(night);
        model.wheels.forEach((wheel, i) =>
          wheel.rotation.set(
            (-time * Math.abs(actor.speed)) / 3.6 / 0.365,
            i < 2
              ? this.track.curvature[Math.floor(actor.t * this.track.samples)] *
                  2
              : 0,
            0,
          ),
        );
      }
  }
}
