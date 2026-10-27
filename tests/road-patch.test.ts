import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "../src/game/TrackBuilder";
import { TRACKS } from "../src/data/tracks";
import { installCanvasMock } from "./helpers/canvas";
import { disposeObject } from "../src/game/CarFactory";

test("every painted patch stays 5–50mm above the actual triangulated road", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  let seed = 938;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    for (const spec of TRACKS)
      for (const reverse of [false, true]) {
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
          track = new Track(spec, world, reverse),
          road = track.root.getObjectByName("Road") as THREE.Mesh;
        track.root.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(),
          down = new THREE.Vector3(0, -1, 0),
          a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          c = new THREE.Vector3();
        try {
          for (const name of ["StartLine", "LightPool", "BoostPad"]) {
            const objects: THREE.Mesh[] = [];
            track.root.traverse((o) => {
              if (o.name === name) objects.push(o as THREE.Mesh);
            });
            for (const mesh of objects) {
              const geo = mesh.geometry,
                index = geo.index!,
                p = geo.getAttribute("position"),
                ranges = mesh.userData.patchRanges ?? [
                  { start: 0, count: index.count },
                ];
              for (let patch = 0; patch < ranges.length; patch++)
                for (let sample = 0; sample < 50; sample++) {
                  const tri =
                    ranges[patch].start +
                    Math.floor((random() * ranges[patch].count) / 3) * 3;
                  a.fromBufferAttribute(p, index.getX(tri));
                  b.fromBufferAttribute(p, index.getX(tri + 1));
                  c.fromBufferAttribute(p, index.getX(tri + 2));
                  let u = random(),
                    v = random();
                  if (u + v > 1) {
                    u = 1 - u;
                    v = 1 - v;
                  }
                  const point = a
                    .clone()
                    .multiplyScalar(1 - u - v)
                    .addScaledVector(b, u)
                    .addScaledVector(c, v);
                  const row = track.nearest(point, -1, true).index,
                    from = Math.max(0, row - 3),
                    to = Math.min(track.samples, row + 4);
                  road.geometry.setDrawRange(from * 30, (to - from) * 30);
                  if (row < 4 || row > track.samples - 5)
                    road.geometry.setDrawRange(0, track.samples * 30);
                  ray.set(point.clone().add(new THREE.Vector3(0, 1, 0)), down);
                  const hit = ray.intersectObject(road)[0];
                  assert.ok(
                    hit,
                    `${spec.id}/${reverse}/${name}/${patch} road hit ${JSON.stringify({ point: point.toArray(), row, tri, range: road.geometry.drawRange })}`,
                  );
                  const height = point.y - hit.point.y;
                  assert.ok(
                    height >= 0.005 && height <= 0.05,
                    `${spec.id}/${reverse}/${name}/${patch} lift ${height}`,
                  );
                }
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
