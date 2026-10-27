import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../src/game/TrackBuilder";
import { Traffic } from "../src/game/Traffic";
import { TRACKS } from "../src/data/tracks";
import { installCanvasMock } from "./helpers/canvas";
test("GP free roam has six terrain exits, 30 tokens, five traps, four ramps and moving civilian traffic", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  try {
    for (const spec of TRACKS.filter((t) => t.length === "gp")) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
        track = new Track(spec, world, false, "clear", true),
        traffic = new Traffic(track, world, false);
      assert.equal(track.tokens.length, 30);
      assert.equal(track.speedTraps.length, 5);
      assert.equal(track.exits.length, 6);
      let ramps = 0;
      track.root.traverse((o) => {
        if (o.name === "Ramp") ramps++;
      });
      assert.equal(ramps, 4);
      for (const e of track.exits) {
        assert.ok(track.isExit(e.t, e.side));
        assert.ok(
          !track.inSection("bridge", e.t) && !track.inSection("tunnel", e.t),
        );
      }
      for (const side of [-1, 1]) {
        let runs = 0,
          previous = track.isExit((track.samples - 1) / track.samples, side);
        for (let i = 0; i < track.samples; i++) {
          const current = track.isExit(i / track.samples, side);
          if (current && !previous) runs++;
          previous = current;
        }
        assert.equal(runs, 3);
      }
      assert.equal(traffic.actors.length, 12);
      assert.ok(
        traffic.actors.some((a) => a.speed < 0) &&
          traffic.actors.some((a) => a.speed > 0),
      );
      const initial = traffic.actors.map((a) => a.position.clone());
      for (let step = 0; step < 600; step++) {
        traffic.fixed(1 / 60);
        world.step();
      }
      traffic.actors.forEach((a, i) => {
        assert.ok(a.body.isKinematic());
        assert.ok(Math.abs(a.speed) >= 60 && Math.abs(a.speed) <= 80);
        assert.ok(a.position.distanceTo(initial[i]) > 100);
        assert.ok(Math.abs(a.body.translation().y - a.position.y) < 0.1);
      });
      world.free();
    }
  } finally {
    restore();
  }
});
