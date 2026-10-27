import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { VehicleController } from "../src/physics/VehicleController.ts";
import { createWallRibbon } from "../src/physics/Walls.ts";
import { CARS } from "../src/data/cars.ts";
import { defaultSave, newOwned } from "../src/core/Save.ts";

async function wallRig(
  points: Vector3[],
  position: Vector3,
  yaw: number,
  speedKmh: number,
  closed = false,
) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setFriction(1),
  );
  const wall = createWallRibbon(world, points, { closed });
  const wallHandles = new Set([wall.handle]);
  const car = new VehicleController(
    world,
    CARS[0],
    newOwned("kestrel"),
    position,
    yaw,
  );
  const settings = defaultSave().settings;
  const step = (throttle = 0.6, steer = 0) => {
    car.update(
      1 / 60,
      {
        throttle,
        brake: 0,
        steer,
        handbrake: false,
        nitro: false,
        rear: false,
      },
      settings,
    );
    world.step();
    car.wallContact(world, wallHandles);
    car.sync();
  };
  for (let i = 0; i < 90; i++) step(0);
  const metresPerSecond = speedKmh / 3.6;
  car.body.setLinvel(
    {
      x: Math.sin(yaw) * metresPerSecond,
      y: 0,
      z: Math.cos(yaw) * metresPerSecond,
    },
    true,
  );
  const speed = () => {
    const v = car.body.linvel();
    return Math.hypot(v.x, v.z) * 3.6;
  };
  return {
    car,
    step,
    speed,
    dispose() {
      car.dispose();
      world.free();
    },
  };
}

for (const [entry, minimum] of [
  [100, 85],
  [150, 130],
] as const) {
  test(`${entry} km/h glancing wall contact preserves momentum and aligns the nose`, async (t) => {
    const rig = await wallRig(
      [new Vector3(0, 0, -150), new Vector3(0, 0, 150)],
      new Vector3(1.7, 0.7, -60),
      (-15 * Math.PI) / 180,
      entry,
    );
    try {
      let contacts = 0;
      for (let i = 0; i < 90; i++) {
        rig.step();
        if (rig.car.wallImpact > 0) contacts++;
      }
      const forward = new Vector3(0, 0, 1).applyQuaternion(rig.car.quaternion);
      const heading =
        (Math.abs(Math.atan2(forward.x, forward.z)) * 180) / Math.PI;
      const speed = rig.speed();
      t.diagnostic(
        `entry=${entry}, exit=${speed.toFixed(2)} km/h, heading=${heading.toFixed(2)} deg, wall distance=${rig.car.position.x.toFixed(2)} m, contacts=${contacts}`,
      );
      assert.ok(contacts > 0, "the car actually scraped the production wall");
      assert.ok(
        speed >= minimum,
        `exit speed ${speed.toFixed(2)} < ${minimum} km/h`,
      );
      assert.ok(
        heading <= 10,
        `heading ${heading.toFixed(2)} exceeds 10 degrees`,
      );
      assert.ok(
        rig.car.position.x > 0 && rig.car.position.x <= 3,
        `the car slid along the wall, distance=${rig.car.position.x.toFixed(2)} m`,
      );
    } finally {
      rig.dispose();
    }
  });
}

test("100 km/h head-on contact stops the car without crossing the ribbon", async (t) => {
  const rig = await wallRig(
    [new Vector3(-150, 0, 0), new Vector3(150, 0, 0)],
    new Vector3(0, 0.7, -5),
    0,
    100,
  );
  try {
    let furthestZ = rig.car.position.z;
    for (let i = 0; i < 30; i++) {
      rig.step();
      furthestZ = Math.max(furthestZ, rig.car.position.z);
    }
    t.diagnostic(
      `exit=${rig.speed().toFixed(2)} km/h, furthest z=${furthestZ.toFixed(2)} m`,
    );
    assert.ok(
      rig.speed() <= 40,
      `head-on exit speed ${rig.speed().toFixed(2)} > 40 km/h`,
    );
    assert.ok(
      furthestZ < 0,
      `the chassis passed through the wall: z=${furthestZ}`,
    );
  } finally {
    rig.dispose();
  }
});

test("120 km/h curved-wall scrape has no seam-sized speed drops over 300 steps", async (t) => {
  const radius = 40;
  const samples = Math.ceil(2 * Math.PI * radius);
  const points = Array.from({ length: samples }, (_, i) => {
    const angle = (i / samples) * 2 * Math.PI;
    return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const rig = await wallRig(points, new Vector3(38.9, 0.7, 0), 0, 120, true);
  try {
    let previousSpeed = rig.speed();
    let maxDrop = 0;
    let contacts = 0;
    for (let i = 0; i < 300; i++) {
      const angle = Math.atan2(rig.car.position.z, rig.car.position.x);
      // Aim just beyond the barrier so this exercises a sustained scrape.
      const target = new Vector3(
        Math.cos(angle + 0.3) * 40.3,
        0,
        Math.sin(angle + 0.3) * 40.3,
      );
      const forward = new Vector3(0, 0, 1).applyQuaternion(rig.car.quaternion);
      const heading = Math.atan2(forward.x, forward.z);
      const error = Math.atan2(
        Math.sin(
          Math.atan2(
            target.x - rig.car.position.x,
            target.z - rig.car.position.z,
          ) - heading,
        ),
        Math.cos(
          Math.atan2(
            target.x - rig.car.position.x,
            target.z - rig.car.position.z,
          ) - heading,
        ),
      );
      rig.step(0.6, -Math.max(-1, Math.min(1, error * 1.9)));
      if (rig.car.touchingWall) contacts++;
      const speed = rig.speed();
      maxDrop = Math.max(maxDrop, previousSpeed - speed);
      previousSpeed = speed;
    }
    t.diagnostic(
      `max one-step loss=${maxDrop.toFixed(3)} km/h, exit=${rig.speed().toFixed(2)} km/h, contacts=${contacts}`,
    );
    assert.ok(
      contacts >= 30,
      `the driven arc must scrape throughout the run, contact frames=${contacts}/300`,
    );
    assert.ok(
      maxDrop <= 8,
      `a wall seam lost ${maxDrop.toFixed(3)} km/h in one step`,
    );
  } finally {
    rig.dispose();
  }
});
