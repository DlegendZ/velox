// Prints objective handling numbers for tuning: steering response, turning, braking, drift.
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { VehicleController } from "../../src/physics/VehicleController.ts";
import { CARS } from "../../src/data/cars.ts";
import { defaultSave, newOwned } from "../../src/core/Save.ts";
import { Input } from "../../src/core/Input.ts";
await RAPIER.init();
const settings = defaultSave().settings;
function rig(car = CARS[0]) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(800, 0.1, 800)
      .setTranslation(0, -0.1, 0)
      .setFriction(1),
  );
  const v = new VehicleController(
    world,
    car,
    newOwned(car.id),
    new Vector3(0, 0.7, 0),
    0,
  );
  const step = (c: Partial<ReturnType<Input["read"]>>) => {
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
  return { v, step };
}
// Input smoothing as the player feels it (keyboard).
const w = globalThis as any;
w.window = w;
w.addEventListener ??= () => {};
(globalThis as any).document = { addEventListener() {} };

const input = new Input(() => settings.bindings);
for (const car of [CARS[0], CARS[1], CARS[6]]) {
  const { v, step } = rig(car);
  let t = 0;
  while (v.speed < 100 && t < 20) {
    step({ throttle: 1 });
    t += 1 / 60;
  }
  const accel = t;
  // Steering step response at ~100 km/h.
  input.keys.add(settings.bindings.right);
  let steer90 = -1,
    yaw = 0;
  for (let i = 0; i < 120; i++) {
    const c = input.read(1 / 60);
    step({ throttle: 0.6, steer: c.steer });
    if (
      steer90 < 0 &&
      Math.abs(v.steering) > 0.9 * Math.abs(0.48 / (1 + 27.7 / 42))
    )
      steer90 = i / 60;
    yaw = v.body.angvel().y;
  }
  input.keys.delete(settings.bindings.right);
  let center = -1;
  for (let i = 0; i < 120; i++) {
    const c = input.read(1 / 60);
    step({ throttle: 0.6, steer: c.steer });
    if (center < 0 && Math.abs(v.steering) < 0.02) center = i / 60;
  }
  const radius = Math.abs(v.speed / 3.6 / (yaw || 1));
  // Braking from 100.
  while (v.speed < 100) step({ throttle: 1 });
  let d = 0;
  const start = v.position.clone();
  while (v.speed > 1) step({ brake: 1 });
  d = v.position.distanceTo(start);
  // Handbrake drift at 90 km/h.
  while (v.speed < 90) step({ throttle: 1 });
  let maxSlip = 0,
    driftTime = 0;
  for (let i = 0; i < 90; i++) {
    step({ throttle: 1, steer: 1, handbrake: i < 25 });
    maxSlip = Math.max(maxSlip, Math.abs(v.slip));
    if (v.drifting) driftTime += 1 / 60;
  }
  const speedAfterDrift = v.speed;
  // Controlled drift: flick, then a simple counter-steer controller holding ~25 degrees.
  while (v.speed < 95) step({ throttle: 1 });
  while (v.speed > 98) step({});
  const slips: number[] = [];
  let entry = v.speed;
  for (let i = 0; i < 180; i++) {
    const s = v.slip,
      steerCmd =
        i < 15
          ? 1
          : Math.max(-1, Math.min(1, (Math.abs(s) - 0.44) * 4 * -Math.sign(s)));
    step({ throttle: 0.85, steer: i < 15 ? 1 : steerCmd, handbrake: i < 12 });
    if (i > 40) slips.push(Math.abs(s) * 57.3);
  }
  const held = slips.reduce((a, b) => a + b, 0) / slips.length,
    spread = Math.max(...slips) - Math.min(...slips);
  // Release: how quickly grip returns when the player straightens up.
  let recover = -1;
  for (let i = 0; i < 180; i++) {
    step({ throttle: 0.5 });
    if (recover < 0 && Math.abs(v.slip) < 0.05) recover = i / 60;
  }
  console.log(
    " ".repeat(12),
    `controlled drift: entry ${entry.toFixed(0)} avg slip ${held.toFixed(0)}° spread ${spread.toFixed(0)}° speed ${v.speed.toFixed(0)} recover ${recover.toFixed(2)}s`,
  );
  console.log(
    car.name.padEnd(12),
    `0-100 ${accel.toFixed(2)}s`,
    `steer90 ${steer90.toFixed(2)}s`,
    `recenter ${center.toFixed(2)}s`,
    `yaw ${yaw.toFixed(2)}rad/s r=${radius.toFixed(0)}m`,
    `brake100 ${d.toFixed(1)}m`,
    `drift slip ${(maxSlip * 57.3).toFixed(0)}° t=${driftTime.toFixed(2)}s exit ${speedAfterDrift.toFixed(0)}km/h`,
  );
}
