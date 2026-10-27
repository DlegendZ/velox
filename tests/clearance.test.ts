import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "../src/game/TrackBuilder.ts";
import { TRACKS } from "../src/data/tracks.ts";
import { installCanvasMock } from "./helpers/canvas.ts";
import { disposeObject } from "../src/game/CarFactory.ts";

test("all roadside meshes, instances and ramp colliders clear every legacy circuit", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  try {
    for (const spec of TRACKS)
      for (const reverse of [false, true]) {
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
          track = new Track(spec, world, reverse, "clear", true);
        try {
          track.root.updateMatrixWorld(true);
          let checked = 0;
          track.root.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            let ancestor: THREE.Object3D | null = object;
            while (ancestor) {
              if (ancestor.userData.trackFixture) return;
              ancestor = ancestor.parent;
            }
            assert.ok(
              object.userData.roadside,
              `${spec.id}: unclassified ${object.name}`,
            );
            object.geometry.computeBoundingBox();
            const box = object.geometry.boundingBox!;
            const check = (matrix: THREE.Matrix4, index: number) => {
              if (matrix.determinant() === 0) return;
              const bounds = box.clone().applyMatrix4(matrix),
                center = bounds.getCenter(new THREE.Vector3());
              const radius =
                Math.hypot(
                  bounds.max.x - bounds.min.x,
                  bounds.max.z - bounds.min.z,
                ) / 2;
              const near = track.nearest(center, -1, true),
                clearance =
                  near.distance - radius - track.halfWidthAt(near.t) - 0.8;
              assert.ok(
                clearance >= 0.5 - 1e-4,
                `${spec.id}${reverse ? " reverse" : ""}: ${object.name}[${index}] at ${center.toArray().map((v) => v.toFixed(2))} clearance ${clearance.toFixed(3)}m`,
              );
              const at = track.at(near.t),
                side = center.clone().sub(at.point).dot(at.normal),
                curvature = track.curvature[near.index];
              if (
                radius >= 2.5 &&
                Math.abs(curvature) > 1 / 180 &&
                side * curvature < 0
              )
                assert.ok(
                  clearance >= 12 - 1e-4,
                  `${spec.id}/${reverse} ${object.name} inside-apex sight line: ${clearance}m`,
                );
              checked++;
            };
            if (object instanceof THREE.InstancedMesh) {
              const m = new THREE.Matrix4();
              for (let i = 0; i < object.count; i++) {
                object.getMatrixAt(i, m);
                check(m.clone().premultiply(object.matrixWorld), i);
              }
            } else check(object.matrixWorld, 0);
            if (typeof object.userData.collider === "number") {
              const collider = world.getCollider(object.userData.collider)!;
              const center = new THREE.Vector3().copy(collider.translation());
              assert.ok(
                track.isClear(center, Math.hypot(3, 6), 0.5),
                `${spec.id} ramp collider intrudes`,
              );
            }
          });
          assert.ok(checked > 100, `${spec.id}: scenery was actually checked`);
          assert.ok(track.wallHandles.size > 0);
          const gates: THREE.Mesh[] = [];
          track.root.traverse((o) => {
            if (o instanceof THREE.Mesh && o.name === "CheckpointPost")
              gates.push(o);
          });
          assert.equal(gates.length, 22);
          for (const p of gates)
            assert.ok(
              track.isClear(p.getWorldPosition(new THREE.Vector3()), 0.12, 0.5),
            );
        } finally {
          disposeObject(track.root);
          world.free();
        }
      }
  } finally {
    restore();
  }
});
