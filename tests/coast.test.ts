import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "../src/game/TrackBuilder";
import { TRACKS } from "../src/data/tracks";
import { installCanvasMock } from "./helpers/canvas";
import { disposeObject } from "../src/game/CarFactory";
test("all coastal roads and embankments stay above sea; sea has no lane triangles", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  try {
    for (const spec of TRACKS.filter((t) => t.environment === "coast"))
      for (const reverse of [false, true]) {
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
          track = new Track(spec, world, reverse),
          sea = track.root.getObjectByName("Sea"),
          ray = new THREE.Raycaster(),
          down = new THREE.Vector3(0, -1, 0);
        track.root.updateMatrixWorld(true);
        try {
          for (let i = 0; i < track.samples; i += 7) {
            const t = i / track.samples,
              half = track.halfWidthAt(t);
            for (const side of [-1, 0, 1]) {
              const p = track.at(t, side * half).point;
              assert.ok(p.y >= 1.3, `${spec.id} low road ${p.y}`);
              ray.set(p.clone().add(new THREE.Vector3(0, 8, 0)), down);
              assert.equal(
                ray.intersectObject(sea!).length,
                0,
                `${spec.id}/${t} sea corridor`,
              );
            }
            for (const side of [-1, 1])
              for (const distance of [0, 5, 15, 25]) {
                const p = track.at(t, side * (half + distance)).point,
                  y = track.terrain.heightAt(p.x, p.z);
                assert.ok(
                  y >= 0.4 - 1e-5,
                  `${spec.id}/${t}/${distance} embankment ${y}`,
                );
              }
          }
        } finally {
          disposeObject(track.root);
          world.free();
        }
      }
  } finally {
    restore();
  }
});
