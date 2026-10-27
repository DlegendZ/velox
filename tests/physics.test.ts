import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { VehicleController } from "../src/physics/VehicleController.ts";
import { CARS } from "../src/data/cars.ts";
import { defaultSave, newOwned } from "../src/core/Save.ts";
test("four-wheel raycast car accelerates forward, steers, brakes and resets", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0),
  );
  const v = new VehicleController(
      world,
      CARS[0],
      newOwned("kestrel"),
      new Vector3(0, 0.7, 0),
      0,
    ),
    settings = defaultSave().settings;
  const input = {
    throttle: 1,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
    rear: false,
  };
  for (let i = 0; i < 360; i++) {
    v.update(1 / 60, input, settings);
    world.step();
    v.sync();
  }
  assert.equal(v.controller.numWheels(), 4);
  assert.ok(v.position.z > 20, `forward z=${v.position.z}`);
  assert.ok(v.speed > 60, `speed ${v.speed}`);
  assert.ok(v.position.y > 0 && v.position.y < 1, `height ${v.position.y}`);
  const before = v.speed;
  for (let i = 0; i < 90; i++) {
    v.update(1 / 60, { ...input, throttle: 0, brake: 1 }, settings);
    world.step();
    v.sync();
  }
  assert.ok(v.speed < before * 0.5, "brakes reduce speed");
  v.reset(new Vector3(0, 0.7, 0), 0);
  for (let i = 0; i < 240; i++) {
    v.update(1 / 60, { ...input, steer: i > 120 ? 0.5 : 0 }, settings);
    world.step();
    v.sync();
  }
  assert.ok(
    v.position.x < -3,
    `right input turns screen-right (world -X): x=${v.position.x}`,
  );
  v.reset(new Vector3(0, 0.7, 0), 0);
  for (let i = 0; i < 180; i++) {
    v.update(1 / 60, input, settings);
    world.step();
    v.sync();
  }
  const boostSpeed = v.speed;
  for (let i = 0; i < 60; i++) {
    v.update(1 / 60, { ...input, nitro: true }, settings);
    world.step();
    v.sync();
  }
  assert.ok(v.nitro < 90 && v.boosting, "nitro consumes its reservoir");
  assert.ok(v.speed > boostSpeed, "nitro accelerates the car");
  v.update(1 / 60, { ...input, handbrake: true }, settings);
  assert.ok(
    v.controller.wheelFrictionSlip(2) < v.controller.wheelFrictionSlip(0),
    "handbrake reduces rear grip",
  );
  v.reset(new Vector3(2, 0.7, 3), 0);
  assert.equal(v.position.z, 3);
  assert.equal(v.body.linvel().z, 0);
  v.dispose();
  world.free();
});
