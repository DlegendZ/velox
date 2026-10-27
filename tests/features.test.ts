import { TrackGeometry } from "../src/game/TrackGeometry.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { packCode, unpackCode } from "../src/net/codec.ts";
import { cleanConfig } from "../src/net/Session.ts";
import {
  checkAchievements,
  dailyChallenge,
  ACHIEVEMENTS,
} from "../src/data/achievements.ts";
import {
  defaultSave,
  migrateSave,
  cleanName,
  cleanVisual,
} from "../src/core/Save.ts";
import { VehicleController } from "../src/physics/VehicleController.ts";
import { CARS } from "../src/data/cars.ts";
import { TRACKS } from "../src/data/tracks.ts";
import * as THREE from "three";
import { Track } from "../src/game/TrackBuilder.ts";
import { AIDriver } from "../src/game/AIDriver.ts";
import { Checkpoints } from "../src/game/Checkpoints.ts";
import { AI_PROFILES } from "../src/data/tuning.ts";
import { installCanvasMock } from "./helpers/canvas.ts";
test("invite codes round-trip and reject damaged input", async () => {
  const value = {
    t: "offer",
    s: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n".repeat(20),
    i: "host",
  };
  const code = await packCode(value);
  assert.ok(code.startsWith("VLX1-"));
  assert.ok(code.length < JSON.stringify(value).length, "compressed");
  assert.deepEqual(await unpackCode(code), value);
  assert.deepEqual(
    await unpackCode(`  ${code.slice(0, 40)}\n${code.slice(40)}  `),
    value,
    "whitespace from chat apps",
  );
  await assert.rejects(unpackCode("hello"));
  await assert.rejects(unpackCode("VLX1-%%%"));
});
test("network input is sanitised: config, names and liveries", () => {
  const fallback = {
    mode: "race" as const,
    track: "neon_a",
    laps: 3,
    reverse: false,
    weather: "clear",
    garage: "own" as const,
  };
  assert.deepEqual(
    cleanConfig(
      {
        mode: "drift",
        track: "nowhere",
        laps: 99,
        reverse: "yes",
        weather: "lava",
        garage: "everything",
      },
      fallback,
    ),
    {
      mode: "race",
      track: "neon_a",
      laps: 5,
      reverse: false,
      weather: "clear",
      garage: "own",
    },
  );
  assert.equal(cleanConfig({ garage: "open" }, fallback).garage, "open");
  assert.equal(
    cleanConfig(
      { mode: "roam", track: "coast_c", laps: 2, weather: "snow" },
      fallback,
    ).track,
    "coast_c",
  );
  assert.equal(cleanName('<img src=x onerror="alert(1)">'), "img srcx onerror");
  assert.equal(cleanName(""), "RACER");
  assert.equal(cleanName("A".repeat(40)).length, 16);
  const v = cleanVisual(
    { paint: "red;background:url(x)", spoiler: 9, rim: "../evil" },
    "kestrel",
  );
  assert.match(v.paint, /^#[0-9a-f]{6}$/i);
  assert.equal(v.spoiler, 3);
  assert.equal(v.rim, "Rim_01");
});
test("achievements unlock once, pay out, and survive a save round-trip", () => {
  const d = defaultSave();
  d.stats.races = 1;
  d.stats.wins = 1;
  d.stats.topSpeed = 260;
  const credits = d.profile.credits;
  const first = checkAchievements(d).map((a) => a.id);
  assert.deepEqual(
    first.sort(),
    ["first_race", "first_win", "speed_250"].sort(),
  );
  assert.equal(d.profile.credits, credits + 500 + 1000 + 2000);
  assert.equal(checkAchievements(d).length, 0, "no double payout");
  const restored = migrateSave(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.stats.topSpeed, 260);
  assert.ok(restored.achievements.first_win);
  assert.equal(
    new Set(ACHIEVEMENTS.map((a) => a.id)).size,
    ACHIEVEMENTS.length,
  );
});
test("daily challenge is deterministic per day and valid", () => {
  const a = dailyChallenge(new Date(2026, 9, 27)),
    b = dailyChallenge(new Date(2026, 9, 27, 23, 59)),
    c = dailyChallenge(new Date(2026, 9, 28));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(TRACKS.some((t) => t.id === a.track));
});
test("all track layouts are closed loops without overlapping sections", () => {
  for (const t of TRACKS) {
    const geometry = new TrackGeometry(t),
      pts = geometry.curve.getSpacedPoints(300);
    let min = Infinity;
    for (let i = 0; i < 300; i++)
      for (let j = i + 45; j < 300; j++)
        if (300 - (j - i) >= 45) min = Math.min(min, pts[i].distanceTo(pts[j]));
    assert.ok(
      min > t.width * 2.5,
      `${t.id} sections only ${min.toFixed(1)} m apart`,
    );
  }
});
test("handbrake drift holds an angle under counter-steer and recovers grip", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setFriction(1),
  );
  const settings = defaultSave().settings;
  const v = new VehicleController(
    world,
    CARS[1],
    {
      ...JSON.parse(JSON.stringify(defaultSave().garage.owned.kestrel)),
      visual: defaultSave().garage.owned.kestrel.visual,
    },
    new Vector3(-150, 0.7, -300),
    0,
  );
  const step = (c: Partial<Parameters<VehicleController["update"]>[1]>) => {
    v.update(
      1 / 60,
      {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        nitro: false,
        rear: false,
        ...c,
      },
      settings,
    );
    world.step();
    v.sync();
  };
  while (v.speed < 95) step({ throttle: 1 });
  const slips: number[] = [];
  for (let i = 0; i < 150; i++) {
    step({ throttle: 0.85, steer: i < 15 ? 1 : 0.6, handbrake: i < 12 });
    if (i > 40) slips.push(Math.abs(v.slip));
  }
  const avg = slips.reduce((a, b) => a + b, 0) / slips.length;
  assert.ok(avg > 0.25 && avg < 0.7, `held slip ${(avg * 57.3).toFixed(0)}°`);
  assert.ok(Math.max(...slips) < 1.2, "no spin-out");
  assert.ok(v.speed > 60, `drift keeps momentum (${v.speed.toFixed(0)} km/h)`);
  for (let i = 0; i < 60; i++) step({ throttle: 0.5 });
  assert.ok(
    Math.abs(v.slip) < 0.08,
    "grip returns within a second of letting go",
  );
  assert.equal(v.drifting, false);
});

test("AI keeps following neon_a after the screen-space steering conversion", async () => {
  await RAPIER.init();
  const restoreCanvas = installCanvasMock();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  try {
    const track = new Track(
      TRACKS.find((track) => track.id === "neon_a")!,
      world,
    );
    const start = track.at(0);
    start.point.y += 0.66;
    const car = new VehicleController(
      world,
      CARS[0],
      defaultSave().garage.owned.kestrel,
      start.point,
      start.yaw,
    );
    const driver = new AIDriver(car, { ...AI_PROFILES[0], lane: 0 }, "normal");
    const checkpoints = new Checkpoints();
    const forward = new Vector3();
    let hint = -1;
    // 0.8 circuits are ~4 km, so checkpoints sit ~350 m apart.
    for (let step = 0; step < 40 * 60; step++) {
      const near = track.nearest(car.position, hint);
      hint = near.index;
      car.update(
        1 / 60,
        driver.drive(1 / 60, track, near, near.t, false),
        defaultSave().settings,
      );
      world.step();
      car.sync();
      const progress = track.nearest(car.position, hint);
      forward.set(0, 0, 1).applyQuaternion(car.quaternion);
      checkpoints.update(
        progress.t,
        (step + 1) / 60,
        forward.dot(track.at(progress.t).tangent),
      );
    }
    assert.ok(
      checkpoints.passed >= 3,
      `AI passed ${checkpoints.passed} checkpoints in 40 seconds`,
    );
    car.dispose();
  } finally {
    world.free();
    restoreCanvas();
  }
});
