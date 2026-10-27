import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../src/game/TrackBuilder";
import { TRACKS } from "../src/data/tracks";
import { installCanvasMock } from "./helpers/canvas";
test("coarse terrain never crosses the tunnel driving corridor", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  try {
    for (const spec of TRACKS.filter((t) => t.length === "gp")) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
        track = new Track(spec, world);
      world.step();
      for (let i = 0; i < track.samples; i += 15) {
        const t = i / track.samples;
        if (!track.inSection("tunnel", t)) continue;
        for (const side of [-1, 0, 1]) {
          const p = track.at(t, side * (track.halfWidthAt(t) - 1)).point;
          const ray = new RAPIER.Ray(
              { x: p.x, y: p.y + 3, z: p.z },
              { x: 0, y: -1, z: 0 },
            ),
            hit = world.castRay(ray, 8, true);
          assert.ok(hit, `${spec.id} missing tunnel ground`);
          const y = ray.origin.y - hit.timeOfImpact;
          assert.ok(
            y <= p.y + 0.2,
            `${spec.id} terrain at ${t.toFixed(3)} side ${side} rises ${(y - p.y).toFixed(2)}m above road`,
          );
        }
      }
      world.free();
    }
  } finally {
    restore();
  }
});
