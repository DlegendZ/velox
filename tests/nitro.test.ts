import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { VehicleController } from "../src/physics/VehicleController.ts";
import { CARS } from "../src/data/cars.ts";
import { defaultSave, newOwned } from "../src/core/Save.ts";

async function drivingRig(nitroUpgrade = 0) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5000, 0.1, 5000)
      .setTranslation(0, -0.1, 0)
      .setFriction(1),
  );
  const owned = newOwned("kestrel");
  owned.upgrades.nitro = nitroUpgrade;
  const car = new VehicleController(
    world,
    CARS[0],
    owned,
    new Vector3(0, 0.7, 0),
    0,
  );
  const settings = defaultSave().settings;
  const step = (nitro: boolean) => {
    car.update(
      1 / 60,
      {
        throttle: 1,
        brake: 0,
        steer: 0,
        handbrake: false,
        nitro,
        rear: false,
      },
      settings,
    );
    world.step();
    car.sync();
  };
  for (let i = 0; i < 120; i++) step(false);
  assert.ok(car.speed > 20, "the lockout is tested on a moving car");
  car.nitro = car.nitroMax;
  return {
    car,
    step,
    dispose() {
      car.dispose();
      world.free();
    },
  };
}

test("empty nitro stays locked while held, even after recharging past 25 percent", async () => {
  const { car, step, dispose } = await drivingRig();
  try {
    let stoppedAt = -1;
    for (let i = 0; i < 10 * 60; i++) {
      step(true);
      if (!car.boosting && stoppedAt < 0) stoppedAt = i;
      if (stoppedAt >= 0) {
        assert.equal(car.boosting, false, `boost restarted at held frame ${i}`);
        assert.equal(car.nitroLocked, true);
      }
      assert.ok(car.nitro >= 0 && car.nitro <= car.nitroMax);
    }
    assert.ok(
      stoppedAt > 0,
      "the full tank depleted during the 10 second hold",
    );
    assert.ok(car.nitro < car.nitroMax * 0.25);
    step(false);
    assert.equal(
      car.nitroLocked,
      true,
      "releasing below 25 percent keeps the lock",
    );
    for (let i = 0; i < 10 * 60; i++) {
      step(true);
      assert.equal(car.boosting, false);
      assert.equal(car.nitroLocked, true);
    }
    assert.ok(car.nitro >= car.nitroMax * 0.25);
    step(false);
    assert.equal(car.nitroLocked, false, "release with enough charge unlocks");
    step(true);
    assert.equal(car.boosting, true, "a new press can boost after the release");
  } finally {
    dispose();
  }
});

test("nitro capacity and the release threshold use the upgraded tank maximum", async () => {
  const { car, step, dispose } = await drivingRig(5);
  try {
    assert.equal(car.nitroMax, 150);
    car.nitro = 149.99;
    step(false);
    assert.equal(car.nitro, 150, "recharge clamps to the upgraded capacity");
    for (let i = 0; i < 10 * 60; i++) step(true);
    assert.equal(car.nitroLocked, true);
    assert.equal(car.boosting, false);
    for (let i = 0; i < 12 * 60 && car.nitro < 30; i++) step(true);
    assert.ok(car.nitro >= 25 && car.nitro < 37.5);
    step(false);
    assert.equal(car.nitroLocked, true, "25 units are below 25 percent of 150");
    for (let i = 0; i < 12 * 60 && car.nitro < 37.5; i++) step(true);
    assert.ok(car.nitro >= 37.5);
    assert.equal(
      car.nitroLocked,
      true,
      "charge alone never unlocks a held button",
    );
    step(false);
    assert.equal(car.nitroLocked, false);
    step(true);
    assert.equal(car.boosting, true);
  } finally {
    dispose();
  }
});
