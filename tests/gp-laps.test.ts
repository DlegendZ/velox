import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "../src/game/TrackBuilder.ts";
import { Checkpoints } from "../src/game/Checkpoints.ts";
import { AIDriver } from "../src/game/AIDriver.ts";
import { VehicleController } from "../src/physics/VehicleController.ts";
import { TRACKS } from "../src/data/tracks.ts";
import { CARS } from "../src/data/cars.ts";
import {
  defaultSave,
  newOwned,
  migrateSave,
  Save,
  SAVE_KEY,
} from "../src/core/Save.ts";
import { installCanvasMock } from "./helpers/canvas.ts";
import { disposeObject } from "../src/game/CarFactory.ts";
import { Vector3 } from "three";
test("all Grand Prix tracks finish an AI lap under four minutes without resets", async () => {
  await RAPIER.init();
  const restore = installCanvasMock();
  try {
    for (const spec of TRACKS.filter((t) => t.length === "gp")) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
        track = new Track(spec, world),
        spawn = track.at(0);
      spawn.point.y += 0.66;
      const vehicle = new VehicleController(
          world,
          CARS[0],
          newOwned("kestrel"),
          spawn.point,
          spawn.yaw,
        ),
        ai = new AIDriver(
          vehicle,
          {
            name: "TEST",
            car: "kestrel",
            skill: 1,
            aggression: 0.8,
            lane: 0,
            color: "#ffffff",
          },
          "normal",
        ),
        checkpoints = new Checkpoints();
      const reset = vehicle.reset.bind(vehicle);
      vehicle.reset = (p, yaw) => {
        console.log(
          "RESET",
          spec.id,
          track.nearest(vehicle.position),
          vehicle.position.toArray(),
        );
        reset(p, yaw);
      };
      try {
        let time = 0;
        for (; time < 240 && checkpoints.lap === 1; time += 1 / 60) {
          const near = track.nearest(vehicle.position);
          vehicle.surfaceGrip = track.gripAt(near.t);
          vehicle.update(
            1 / 60,
            ai.drive(1 / 60, track, near, 0, false),
            defaultSave().settings,
          );
          world.step();
          vehicle.wallContact(world, track.wallHandles);
          vehicle.sync();
          const p = track.nearest(vehicle.position);
          checkpoints.update(
            p.t,
            time,
            new Vector3(0, 0, 1)
              .applyQuaternion(vehicle.quaternion)
              .dot(track.at(p.t).tangent),
          );
        }
        console.log(
          `${spec.id}: ${time.toFixed(1)} seconds, ${checkpoints.passed} gates, ${vehicle.resets} resets`,
        );
        assert.equal(checkpoints.lap, 2, `${spec.id} completes`);
        assert.equal(vehicle.resets, 0, `${spec.id} no reset`);
      } finally {
        vehicle.dispose();
        disposeObject(track.root);
        world.free();
      }
    }
  } finally {
    restore();
  }
});
test("track migration archives only records and notifies once", () => {
  const old = defaultSave() as any;
  delete old.trackVersion;
  old.profile.credits = 23456;
  old.garage.owned.kestrel.upgrades.engine = 3;
  old.achievements.first_race = 123;
  old.stats.races = 10;
  old.career.stars.tier1_0 = 3;
  old.records.neon_a = { bestLap: 45, ghost: null, splits: [10] };
  const migrated = migrateSave(old);
  assert.deepEqual(migrated.records, {});
  assert.equal(migrated.records_v1?.neon_a.bestLap, 45);
  assert.equal(migrated.profile.credits, 23456);
  assert.equal(migrated.garage.owned.kestrel.upgrades.engine, 3);
  assert.equal(migrated.stats.races, 10);
  assert.equal(migrated.achievements.first_race, 123);
  assert.equal(migrated.career.stars.tier1_0, 3);
  let raw = JSON.stringify(old);
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
    removeItem: () => {},
  };
  const first = new Save(storage);
  assert.match(first.warning, /archived/);
  assert.equal(new Save(storage).warning, "");
  migrated.records.neon_gp = { bestLap: 95, ghost: null };
  assert.equal(migrateSave(migrated).records.neon_gp.bestLap, 95);
});
